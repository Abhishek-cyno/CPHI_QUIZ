// A small in-memory stand-in for the Google Apps Script services the CPHI
// backend uses, so google-apps-script-cphi.gs can be loaded and exercised in
// Node exactly as written.
//
// It copies the two Sheets behaviours that have bitten this project:
//   - a value written starting with "=", "+", "-" or "@" is parsed as a
//     formula; anything that is not a real formula displays as "#ERROR!",
//     while getFormulas() still returns the original text;
//   - a leading apostrophe is Sheets' "store as text" marker: it is dropped
//     and the rest is kept literally.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function storeCell(value) {
  if (typeof value !== 'string') return { value, formula: '' }
  if (value.startsWith("'")) return { value: value.slice(1), formula: '' }
  if (/^[=+\-@]/.test(value)) return { value: '#ERROR!', formula: value }
  return { value, formula: '' }
}

export function makeSheet(name, rows = []) {
  const cells = rows.map((r) => r.map(storeCell))
  const sheet = {
    name,
    frozenRows: 0,
    getName: () => name,
    getLastRow() {
      let n = cells.length
      while (n && cells[n - 1].every((c) => c == null || c.value === '' || c.value == null)) n--
      return n
    },
    getMaxRows: () => 1000,
    getLastColumn: () => Math.max(0, ...cells.map((r) => r.length)),
    insertRowBefore(r) { cells.splice(r - 1, 0, []) },
    setFrozenRows(n) { sheet.frozenRows = n },
    appendRow(values) { cells.splice(sheet.getLastRow(), 0, values.map(storeCell)) },
    getDataRange() { return sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 20) },
    getRange(r, c, nr = 1, nc = 1) {
      const at = (i, j) => (cells[r - 1 + i] || [])[c - 1 + j]
      const grid = (fn) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fn(at(i, j))))
      const range = {
        getDisplayValue: () => String(at(0, 0)?.value ?? ''),
        getDisplayValues: () => grid((cell) => (cell?.value instanceof Date ? cell.value.toISOString() : String(cell?.value ?? ''))),
        getFormulas: () => grid((cell) => cell?.formula ?? ''),
        setValues(values) {
          values.forEach((row, i) => {
            cells[r - 1 + i] = cells[r - 1 + i] || []
            row.forEach((v, j) => { cells[r - 1 + i][c - 1 + j] = storeCell(v) })
          })
          return range
        },
        setValue: (v) => range.setValues([[v]]),
        setFontWeight: () => range,
        setNumberFormat: () => range,
      }
      return range
    },
    // What a person looking at the sheet would see, row by row.
    view: () => cells.map((row) => row.map((cell) => (cell?.value instanceof Date ? '<date>' : String(cell?.value ?? '')))),
  }
  return sheet
}

/**
 * Loads google-apps-script-cphi.gs against fresh fake services and returns
 * its top-level functions plus handles on the fakes.
 */
export function loadBackend({ entries, gifts, settings, questions, vouchers, webhookStatus = 200 } = {}) {
  const sheets = {
    CphiEntries: entries === null ? null : makeSheet('CphiEntries', entries ?? [[
      'Entered At', 'Ref', 'Status', 'Name', 'Email', 'Phone', 'Score', 'Total', 'Percent',
      'Prize', 'Answers (JSON)', 'Organization', 'Designation',
    ]]),
    Gifts: makeSheet('Gifts', gifts ?? [
      ['tier', 'id', 'title', 'short', 'desc', 'emoji', 'active', 'stock', 'weight'],
      ['premium', 'lamp', 'Desk Lamp', 'Lamp', '', '💡', 'yes', '2', '1'],
      ['standard', 'pen', 'Pen Set', 'Pens', '', '🖊️', 'yes', '', '1'],
      ['superpremium', 'speaker', 'Speaker', 'Speaker', '', '🔊', 'yes', '0', '1'],
    ]),
    Settings: makeSheet('Settings', settings ?? [
      ['key', 'value'], ['brandName', 'Eqova Medicare'], ['cphiEventName', 'CPHI'], ['cphiPabblyWebhook', ''],
      ['cphiEmailWebhook', 'https://pabbly.test/email'], ['cphiContactEmail', 'info@eqova.in'],
    ]),
    GiftVouchers: vouchers === undefined ? null : makeSheet('GiftVouchers', vouchers),
    QuestionsCPHI: makeSheet('QuestionsCPHI', questions ?? [
      ['id', 'question', 'option1', 'option2', 'option3', 'option4', 'answer'],
      ['q1', 'Two plus two?', '3', '4', '5', '6', '1'],
    ]),
  }
  const spreadsheet = {
    getSheets: () => Object.values(sheets).filter(Boolean),
    insertSheet(name) { sheets[name] = makeSheet(name); return sheets[name] },
  }
  const mail = []
  const fetches = []
  const cache = new Map()
  const logs = []

  const context = vm.createContext({
    SpreadsheetApp: { openById: () => spreadsheet, getActiveSpreadsheet: () => spreadsheet },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    ContentService: { createTextOutput: (text) => ({ setMimeType: () => ({ text }) }), MimeType: { JSON: 'json' } },
    MailApp: { sendEmail: (m) => mail.push(m), getRemainingDailyQuota: () => 100 },
    // `webhookStatus` may be a number or a function of the call count, so a
    // test can fail the first email and let a retry through.
    UrlFetchApp: {
      fetch: (url, opts) => {
        fetches.push({ url, opts, payload: JSON.parse(opts.payload) })
        const status = typeof webhookStatus === 'function' ? webhookStatus(fetches.length) : webhookStatus
        return { getResponseCode: () => status, getContentText: () => (status === 200 ? '{"status":"success"}' : 'paused') }
      },
    },
    Logger: { log: (m) => logs.push(String(m)) },
    console: { log: (m) => logs.push(String(m)), info: (m) => logs.push(String(m)), warn: (m) => logs.push(String(m)), error: (m) => logs.push(String(m)) },
    Date, JSON, Math, String, Number, Object, Array, RegExp, parseInt, isNaN, isFinite,
  })
  const source = readFileSync(new URL('../../google-apps-script-cphi.gs', import.meta.url), 'utf8')
  vm.runInContext(source, context, { filename: 'google-apps-script-cphi.gs' })

  // doGet/doPost return ContentService output; unwrap to plain objects.
  const call = (out) => JSON.parse(out.text)
  return {
    gs: context,
    sheets,
    mail,
    fetches,
    // Only the emails handed to the Pabbly email webhook.
    get emails() { return fetches.filter((f) => f.url === 'https://pabbly.test/email').map((f) => f.payload) },
    logs,
    get: (params) => call(context.doGet({ parameter: params })),
    post: (body) => call(context.doPost({ postData: { contents: JSON.stringify(body) } })),
  }
}
