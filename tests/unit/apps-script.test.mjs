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

test('a blank email (an out-of-date tablet) still saves, and nothing is mailed', () => {
  const b = loadBackend()
  const res = b.post({ action: 'submit', ...visitor, email: '', score: 1, total: 3, percent: 33, gift: 'Pen Set', answers: [] })
  assert.equal(res.ok, true)
  assert.equal(b.emails.length, 0, 'must not try to mail an empty address')
  assert.ok(b.logs.some((l) => /No email/.test(l)), 'skipping the mail should be logged')
})

test('designation is optional; a malformed email and a blank organization are rejected', () => {
  const b = loadBackend()
  const base = { action: 'submit', score: 1, total: 3, percent: 33, gift: 'Pen Set', answers: [] }
  assert.equal(b.post({ ...base, ...visitor, designation: '' }).ok, true, 'the form lets designation be blank')
  assert.match(b.post({ ...base, ...visitor, email: 'not-an-email' }).error, /email/i)
  assert.match(b.post({ ...base, ...visitor, organization: '' }).error, /organization/i)
})

test('nothing is ever sent from the Google account — every email goes to the Pabbly webhook', () => {
  const b = loadBackend()
  b.post({ action: 'submit', ...visitor, score: 2, total: 3, percent: 67, gift: 'Pen Set', answers: [] })
  assert.equal(b.mail.length, 0, 'MailApp must not be used')
  assert.equal(b.emails.length, 1)
  const mail = b.emails[0]
  assert.equal(mail.to, visitor.email)
  assert.equal(mail.isVoucher, false)
  assert.match(mail.text, /^Dear Asha Verma,/)
  assert.match(mail.text, /Thank you for visiting Eqova Medicare at CPHI India 2026/)
  assert.match(mail.text, /explore a collaboration or partnership/)
  assert.match(mail.text, /Team Eqova Medicare/)
  assert.match(mail.text, /✉️ info@eqova\.in/)
  assert.doesNotMatch(mail.text, /voucher/i, 'a non-voucher prize gets no voucher block')
})

test('a repeat submit re-sends the confirmation instead of going silent', () => {
  const b = loadBackend()
  const body = { action: 'submit', ...visitor, score: 2, total: 3, percent: 67, gift: 'Pen Set', answers: [] }
  const first = b.post(body)
  const second = b.post(body)
  assert.equal(second.alreadyEntered, true)
  assert.equal(second.ref, first.ref)
  assert.equal(b.emails.filter((m) => m.to === visitor.email).length, 2)
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

// ---- Vouchers -------------------------------------------------------------
// Made-up codes only. Real ones live in the GiftVouchers tab.
const VOUCHER_HEADER = ['CouponID', 'Type', 'Code', 'Pin', 'Status', 'Terms', 'ClaimedBy']
const voucherGifts = [
  ['tier', 'id', 'title', 'short', 'desc', 'emoji', 'active', 'stock', 'weight'],
  ['premium', 'amz', 'Amazon Voucher ₹500', 'Amazon', '', '💳', 'yes', '', '1'],
  ['premium', 'myn', 'Myntra Gift Card', 'Myntra', '', '🛍️', 'yes', '5', '1'],
  ['standard', 'pen', 'Pen Set', 'Pens', '', '🖊️', 'yes', '', '1'],
]
const withVouchers = (rows, opts = {}) => loadBackend({
  gifts: voucherGifts,
  vouchers: [VOUCHER_HEADER, ...rows],
  ...opts,
})
const AMZ1 = ['T1', 'Amazon', 'TEST-AAAA-0001', '', 'AVAILABLE', 'https://example.com/amazon-terms', 'NA']
const AMZ2 = ['T2', 'Amazon', 'TEST-AAAA-0002', '', 'AVAILABLE', 'https://example.com/amazon-terms', 'NA']
const MYN1 = ['T3', 'Myntra', '9999000011112222', '123456', 'AVAILABLE', 'https://example.com/myntra-terms', 'NA']
const vRows = (b) => b.sheets.GiftVouchers.view().slice(1)
const V = { code: 2, status: 4, claimedBy: 6 }
const play = (b, who, id, gift) => {
  assert.equal(b.post({ action: 'claimGift', id, ...who }).ok, true)
  return b.post({ action: 'submit', ...who, score: 2, total: 3, percent: 67, gift, answers: [] })
}

test('a voucher win reserves a code at spin time and CLAIMs it once the email is sent', () => {
  const b = withVouchers([AMZ1, AMZ2])
  assert.equal(b.post({ action: 'claimGift', id: 'amz', ...visitor }).ok, true)
  assert.equal(vRows(b)[0][V.status], 'RESERVED')
  assert.equal(b.emails.length, 0, 'nothing is emailed until the final submit')

  const done = b.post({ action: 'submit', ...visitor, score: 2, total: 3, percent: 67, gift: 'Amazon Voucher ₹500', answers: [] })
  assert.equal(vRows(b)[0][V.status], 'CLAIMED')
  assert.match(vRows(b)[0][V.claimedBy], new RegExp('^' + done.ref + ' · Asha Verma · 919876543210 · asha@example.com'))
  assert.equal(vRows(b)[1][V.status], 'AVAILABLE', 'only one code is used')

  const mail = b.emails[0]
  assert.equal(mail.isVoucher, true)
  assert.equal(mail.voucherCode, 'TEST-AAAA-0001')
  assert.match(mail.subject, /Amazon voucher/)
  assert.match(mail.text, /Congratulations, you've won an Amazon voucher worth ₹500!/)
  assert.match(mail.text, /Voucher Number: TEST-AAAA-0001/)
  assert.doesNotMatch(mail.text, /PIN:/, 'Amazon codes have no PIN, so no PIN line')
  assert.match(mail.text, /Go to Amazon Pay → Add Gift Card/)
  assert.match(mail.html, /href="https:\/\/example.com\/amazon-terms"/)
})

test('a Myntra win carries the card number and PIN, and Myntra claim steps', () => {
  const b = withVouchers([AMZ1, MYN1])
  play(b, visitor, 'myn', 'Myntra Gift Card')
  const mail = b.emails[0]
  assert.match(mail.text, /won a Myntra voucher!/)
  assert.match(mail.text, /Voucher Number: 9999000011112222\nPIN: 123456/)
  assert.match(mail.text, /Myntra Credit/)
  assert.equal(vRows(b)[1][V.status], 'CLAIMED')
  assert.equal(vRows(b)[0][V.status], 'AVAILABLE', 'an Amazon code is not touched by a Myntra win')
})

test('an Uber win carries the Uber code and Uber claim steps', () => {
  const b = loadBackend({
    gifts: [voucherGifts[0], ['standard', 'Uber-gift-card', 'Uber Voucher', 'Uber Coupon', '', '💳', 'yes', '19', '2']],
    vouchers: [VOUCHER_HEADER, AMZ1, ['T5', 'Uber', 'QTESTUBERCODE01', '', 'AVAILABLE', 'https://example.com/uber-terms', 'NA']],
  })
  play(b, visitor, 'Uber-gift-card', 'Uber Voucher')
  const mail = b.emails[0]
  assert.equal(mail.voucherCode, 'QTESTUBERCODE01')
  assert.match(mail.text, /Congratulations, you've won an Uber voucher!/)
  assert.match(mail.text, /Account → Wallet/)
  assert.doesNotMatch(mail.text, /PIN:/)
  assert.equal(vRows(b)[1][V.status], 'CLAIMED')
  assert.equal(vRows(b)[0][V.status], 'AVAILABLE')
})

test('two winners get two different codes, and a repeat submit re-sends the SAME code', () => {
  const b = withVouchers([AMZ1, AMZ2])
  const other = { ...visitor, name: 'Ravi Shah', phone: '+91 9000000002', email: 'ravi@example.com' }
  const first = play(b, visitor, 'amz', 'Amazon Voucher ₹500')
  play(b, other, 'amz', 'Amazon Voucher ₹500')
  assert.deepEqual(b.emails.map((m) => m.voucherCode), ['TEST-AAAA-0001', 'TEST-AAAA-0002'])

  const again = b.post({ action: 'submit', ...visitor, score: 2, total: 3, percent: 67, gift: 'Amazon Voucher ₹500', answers: [] })
  assert.equal(again.ref, first.ref)
  assert.equal(b.emails[2].voucherCode, 'TEST-AAAA-0001')
  assert.deepEqual(vRows(b).map((r) => r[V.status]), ['CLAIMED', 'CLAIMED'])
})

test('a code set back to AVAILABLE in the sheet is handed out again', () => {
  const b = withVouchers([AMZ1])
  const first = play(b, visitor, 'amz', 'Amazon Voucher ₹500')
  assert.equal(vRows(b)[0][V.status], 'CLAIMED')

  // Someone at the stall edits Status back by hand, leaving ClaimedBy as-is
  // (and in any capitalisation).
  b.sheets.GiftVouchers.getRange(2, V.status + 1).setValue('Available')

  // The next winner gets it, with ClaimedBy rewritten to them.
  const other = { ...visitor, name: 'Ravi Shah', phone: '+91 9000000002', email: 'ravi@example.com' }
  const second = play(b, other, 'amz', 'Amazon Voucher ₹500')
  assert.notEqual(second.ref, first.ref)
  assert.equal(vRows(b)[0][V.status], 'CLAIMED')
  assert.match(vRows(b)[0][V.claimedBy], new RegExp('^' + second.ref + ' · Ravi Shah'))
  assert.equal(b.emails.at(-1).to, 'ravi@example.com')
  assert.equal(b.emails.at(-1).voucherCode, 'TEST-AAAA-0001')
})

test('with no codes left, the voucher cannot be won and its stock is not spent', () => {
  const b = withVouchers([['T9', 'Myntra', '1', '2', 'CLAIMED', '', 'CP-OLD · X'], AMZ1])
  const res = b.post({ action: 'claimGift', id: 'myn', ...visitor })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'outofstock')
  assert.equal(b.sheets.Gifts.view()[2][7], '5', 'Myntra stock untouched')
  assert.equal(entryRows(b).length, 0, 'no prize recorded')
})

test('a failed webhook leaves the code RESERVED; sendPendingVouchers delivers it later', () => {
  const b = withVouchers([AMZ1], { webhookStatus: (n) => (n === 1 ? 500 : 200) })
  const done = play(b, visitor, 'amz', 'Amazon Voucher ₹500')
  assert.equal(done.ok, true, 'the visitor still sees their entry saved')
  assert.equal(vRows(b)[0][V.status], 'RESERVED')
  assert.ok(b.logs.some((l) => /rejected/.test(l)))
  assert.ok(!b.logs.some((l) => l.includes('TEST-AAAA-0001')), 'the code must never be written to the logs')

  b.gs.sendPendingVouchers()
  assert.equal(vRows(b)[0][V.status], 'CLAIMED')
  assert.equal(b.emails.at(-1).voucherCode, 'TEST-AAAA-0001')
})

test('with no email webhook configured, nothing is sent and the code stays RESERVED', () => {
  const b = withVouchers([AMZ1], { settings: [['key', 'value'], ['brandName', 'Eqova Medicare']] })
  play(b, visitor, 'amz', 'Amazon Voucher ₹500')
  assert.equal(b.fetches.length, 0)
  assert.equal(b.mail.length, 0)
  assert.equal(vRows(b)[0][V.status], 'RESERVED')
  assert.ok(b.logs.some((l) => /No cphiEmailWebhook/.test(l)))
})

test('a non-voucher prize never touches the voucher tab', () => {
  const b = withVouchers([AMZ1])
  play(b, visitor, 'pen', 'Pen Set')
  assert.equal(vRows(b)[0][V.status], 'AVAILABLE')
  assert.equal(b.emails[0].isVoucher, false)
})
