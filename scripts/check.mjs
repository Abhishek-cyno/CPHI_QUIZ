// Static checks that run in CI before anything is built or deployed.
//
// Each one guards something that has actually gone wrong, or nearly gone
// wrong, on this project — a malformed question would be unanswerable at the
// stall, a syntax error in the Apps Script only shows up after someone pastes
// and deploys it, and this repo is public so real Sheet IDs must never land
// in it.
//
//   npm run check
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

const failures = []
const fail = (msg) => failures.push(msg)
const pass = (msg) => console.log(`  ok  ${msg}`)

// ---- 1. The bundled question bank ----------------------------------------
const questions = JSON.parse(read('src/data/questions.json'))
const ids = new Set()
questions.forEach((q, i) => {
  const where = `questions.json #${i + 1} (${q.id ?? 'no id'})`
  if (!q.id) fail(`${where}: missing id`)
  else if (ids.has(q.id)) fail(`${where}: duplicate id`)
  ids.add(q.id)
  if (!String(q.q ?? '').trim()) fail(`${where}: empty question text`)
  if (!Array.isArray(q.options) || q.options.length !== 4) fail(`${where}: needs exactly 4 options`)
  else if (q.options.some((o) => !String(o ?? '').trim())) fail(`${where}: has a blank option`)
  else if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) fail(`${where}: has duplicate options`)
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) fail(`${where}: answer must be 0, 1, 2 or 3`)
})
const config = read('src/config.js')
const perQuiz = Number(config.match(/questionsPerQuiz:\s*(\d+)/)?.[1])
if (!(questions.length >= perQuiz)) fail(`question bank has ${questions.length}, fewer than questionsPerQuiz (${perQuiz})`)
pass(`${questions.length} bundled questions are well-formed`)

// ---- 2. The Sheet seed file matches the bundled bank ----------------------
// The TSV is what gets pasted into the QuestionsCPHI tab. If it drifts from
// questions.json, the live quiz (Sheet) and the fallback (bundle) disagree
// about what the right answer is.
const tsv = read('sheet-seed-QuestionsCPHI.tsv').trim().split(/\r?\n/).map((l) => l.split('\t'))
const [header, ...rows] = tsv
if (header.join('|') !== 'id|question|option1|option2|option3|option4|answer') fail('sheet-seed TSV header has changed')
if (rows.length !== questions.length) fail(`sheet-seed TSV has ${rows.length} rows, questions.json has ${questions.length}`)
rows.forEach((r, i) => {
  const q = questions[i]
  if (!q) return
  const same = r[0] === q.id && r[1] === q.q && r.slice(2, 6).join('|') === q.options.join('|') && Number(r[6]) === q.answer
  if (!same) fail(`sheet-seed TSV row ${i + 2} (${r[0]}) does not match questions.json`)
})
pass('sheet-seed TSV matches questions.json')

// ---- 3. The Apps Script --------------------------------------------------
const gs = read('google-apps-script-cphi.gs')
try {
  new vm.Script(gs, { filename: 'google-apps-script-cphi.gs' })
  pass('Apps Script parses')
} catch (e) {
  fail(`Apps Script does not parse: ${e.message}`)
}
for (const name of ['CONTENT_SHEET_ID', 'DATA_SHEET_ID']) {
  const value = gs.match(new RegExp(`var ${name} = '([^']*)'`))?.[1]
  // This repo is public. The real IDs belong only in the Apps Script editor.
  if (value === undefined) fail(`Apps Script: ${name} not found`)
  else if (value && !value.startsWith('PASTE_')) fail(`Apps Script: ${name} holds a real spreadsheet ID — keep the PASTE_ placeholder in the repo`)
}
pass('no real spreadsheet IDs committed')
for (const fn of ['doGet', 'doPost', 'setupSheets', 'repairEntryPhones', 'clearCaches']) {
  if (!new RegExp(`function ${fn}\\(`).test(gs)) fail(`Apps Script: function ${fn}() is missing`)
}
pass('Apps Script entry points present')

// ---- 4. The app's backend URL --------------------------------------------
const endpoint = config.match(/apiEndpoint:\s*'([^']*)'/)?.[1]
if (endpoint === undefined) fail('config.js: apiEndpoint not found')
else if (endpoint && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
  fail(`config.js: apiEndpoint is not an Apps Script /exec URL: ${endpoint}`)
} else if (!endpoint) {
  fail('config.js: apiEndpoint is empty — the deployed site would have no prize wheel')
}
pass('apiEndpoint is an Apps Script web-app URL')

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
