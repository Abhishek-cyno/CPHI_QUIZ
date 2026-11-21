/**
 * EQOVA MEDICARE — CPHI quiz backend
 * =============================================================
 * One Web App that serves the whole CPHI quiz: the question bank,
 * the prize catalog, the one-prize-per-mobile check, and every write.
 * (The doctor app splits the same job across three separate scripts;
 * there is no booking or calendar here, so it all fits in one.)
 *
 * It is bound to the SAME two Google Sheets the doctor app already uses,
 * but touches different tabs:
 *
 *   CONTENT sheet   reads  QuestionsCPHI     <- new tab
 *   DATA sheet      writes CphiEntries       <- new tab
 *                   writes GiftVouchers      <- voucher codes (Status column)
 *                   reads  Gifts, Settings   <- SHARED with the doctor app
 *
 * Because prize stock lives in the shared Gifts tab, a limited prize runs
 * down across BOTH campaigns. That is deliberate — one physical box of
 * prizes, one stock count. If the two campaigns should have independent
 * prizes, copy Gifts to a GiftsCPHI tab and change GIFTS_TAB below.
 *
 * -------------------------------------------------------------
 * SETUP (10 minutes)
 *
 * 1. Open the CONTENT sheet (the one with the Specialties/Questions tabs
 *    that the doctor app reads). Add a tab named exactly:
 *        QuestionsCPHI
 *    with this header row:
 *        id | question | option1 | option2 | option3 | option4 | answer
 *    "answer" is the 0-based index of the correct option: 0, 1, 2 or 3.
 *    Paste in QuestionsCPHI.tsv, which ships beside this file.
 *
 * 2. Open the DATA sheet (the one with the Bookings/Gifts/Settings tabs).
 *    You do NOT need to create the CphiEntries tab by hand — step 5 does
 *    it. Copy its ID from the URL:
 *        docs.google.com/spreadsheets/d/<<THIS BIT>>/edit
 *
 * 3. Copy the CONTENT sheet's ID the same way.
 *
 * 4. Paste both IDs into CONTENT_SHEET_ID and DATA_SHEET_ID below.
 *
 * 5. Extensions > Apps Script on either sheet. Delete any code, paste ALL
 *    of this file, then Run > setupSheets once. Approve the permission
 *    prompt (Sheets, external requests). No mail is sent from this Google
 *    account: every email goes out through Pabbly (see EMAIL below).
 *
 * 6. Deploy > New deployment > type "Web app".
 *        Execute as:      Me
 *        Who has access:  Anyone
 *
 * 7. Copy the Web app URL into src/config.js -> apiEndpoint.
 *
 * -------------------------------------------------------------
 * REDEPLOYING AFTER AN EDIT
 *
 * Saving this file does NOT change what the live URL runs. An /exec URL
 * serves the version that was pinned when it was deployed. After any edit:
 *     Deploy > Manage deployments > (pencil) > Version: New version > Deploy
 * The URL stays the same. Skip this and the live app keeps running the old
 * code no matter what the editor shows — this is the single most common
 * way an Apps Script change appears to "not work".
 */

// ============================================================
//  Configuration
// ============================================================

// Leave either ID as '' to use the spreadsheet this script is bound to.
var CONTENT_SHEET_ID = 'PASTE_CONTENT_SHEET_ID_HERE';
var DATA_SHEET_ID = 'PASTE_DATA_SHEET_ID_HERE';

var QUESTIONS_TAB = 'QuestionsCPHI';
var ENTRIES_TAB = 'CphiEntries';
var GIFTS_TAB = 'Gifts';        // shared with the doctor app
var SETTINGS_TAB = 'Settings';  // shared with the doctor app

// EMAIL
// The thank-you email (with the voucher code, for voucher winners) is NOT
// sent from this Google account. The script builds the finished email —
// subject, HTML and plain text — and posts it to a Pabbly Connect webhook,
// whose "Send Email" step sends it from info@eqova.in. Put that webhook's
// URL in the Settings tab under `cphiEmailWebhook`. With it blank, no email
// is sent at all (and voucher codes stay RESERVED, never CLAIMED).
var SEND_EMAILS = true;

// Shown in the email: "Thank you for visiting Eqova Medicare at <this>".
var EMAIL_EVENT_NAME = 'CPHI India 2026';

// Voucher codes, one row each:
//   CouponID | Type | Code | Pin | Status | Terms | ClaimedBy
// Optional extra columns, used in the email when present:
//   Amount | Expiry (or "Valid until")
// Columns are found by their header, so their order does not matter.
//
// Status runs AVAILABLE -> RESERVED (the wheel landed on it) -> CLAIMED
// (the email carrying it was handed to Pabbly). ClaimedBy records who.
// A prize on the Gifts tab counts as a voucher when its title contains a
// Type from this tab — e.g. "Amazon Voucher ₹500" draws from the Amazon rows.
var VOUCHERS_TAB = 'GiftVouchers';

// How long the question bank and prize catalog may be served from cache.
// Run clearCaches() after editing a tab to make the change show up at once.
var QUESTIONS_CACHE_KEY = 'cphi_questions_v1';
var QUESTIONS_CACHE_TTL = 300;
var GIFTS_CACHE_KEY = 'cphi_gifts_v1';
var GIFTS_CACHE_TTL = 120;

var ENTRY_HEADERS = [
  'Entered At', 'Ref', 'Status', 'Name', 'Email', 'Phone',
  'Score', 'Total', 'Percent', 'Prize', 'Answers (JSON)',
  // Added after launch, so they go on the END: rows already in the tab keep
  // every column where it was, and setupSheets just extends the header.
  'Organization', 'Designation',
];

// Column indexes into ENTRY_HEADERS, 0-based, used when reading rows back.
var COL = { ref: 1, status: 2, name: 3, email: 4, phone: 5, prize: 9, organization: 11, designation: 12 };

// ============================================================
//  Web endpoints
// ============================================================

/**
 * GET ?action=questions    -> the question bank
 * GET ?action=gifts        -> the prize wheel catalog
 * GET ?action=eligibility&phone=...  -> may this mobile still spin?
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'questions';

    if (action === 'questions') return questionsResponse();
    if (action === 'gifts') return giftsResponse();
    if (action === 'eligibility') return eligibilityResponse(e.parameter.phone);

    return json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('doGet failed: ' + err);
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * POST { action:'register', name, phone, email }
 *   -> creates this visitor's row at status 'registered'.
 * POST { action:'claimGift', id, name, phone, email }
 *   -> debits one unit of that prize's stock and records the win.
 * POST { action:'submit', name, email, phone, score, total, percent, gift, answers }
 *   -> completes the row and sends the confirmation email.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'submit';

    if (action === 'register') return registerVisitor(data);
    if (action === 'claimGift') return claimGift(data);
    if (action === 'submit') return submitEntry(data);

    return json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('doPost failed: ' + err);
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// ============================================================
//  Reads
// ============================================================

function questionsResponse() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(QUESTIONS_CACHE_KEY);
  if (cached) return rawJson(cached);

  var sheet = tab(contentSheet(), QUESTIONS_TAB);
  if (!sheet || sheet.getLastRow() < 2) {
    return json({ ok: false, error: 'The ' + QUESTIONS_TAB + ' tab is missing or empty.' });
  }

  // getDisplayValues (not getValues) so an option like "8.2 - 10.0" or
  // "100%" comes back as the text shown in the cell rather than whatever
  // number Sheets decided it was underneath.
  var rows = sheet.getDataRange().getDisplayValues();
  rows.shift(); // header

  var questions = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var text = String(r[1] || '').trim();
    var options = [r[2], r[3], r[4], r[5]].map(function (o) { return String(o == null ? '' : o).trim(); });
    var answer = parseInt(r[6], 10);

    // A half-filled row is a typo in the sheet, not a question. Skipping it
    // keeps the quiz playable instead of handing the app a broken item that
    // can never be answered correctly.
    if (!text || options.some(function (o) { return !o; }) || !(answer >= 0 && answer <= 3)) {
      if (text) console.warn('Skipping malformed question row ' + (i + 2) + ': ' + text);
      continue;
    }

    questions.push({
      id: String(r[0] || '').trim() || ('q' + (i + 1)),
      q: text,
      options: options,
      answer: answer,
    });
  }

  var body = JSON.stringify({ ok: true, questions: questions });
  // A payload over CacheService's 100KB limit throws — better to serve it
  // uncached than to fail the whole request over it.
  try { cache.put(QUESTIONS_CACHE_KEY, body, QUESTIONS_CACHE_TTL); } catch (cacheErr) {}
  return rawJson(body);
}

function giftsResponse() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(GIFTS_CACHE_KEY);
  if (cached) return rawJson(cached);

  var gifts = readGifts();
  var body = JSON.stringify({ ok: true, gifts: gifts });
  try { cache.put(GIFTS_CACHE_KEY, body, GIFTS_CACHE_TTL); } catch (cacheErr) {}
  return rawJson(body);
}

/**
 * The Gifts tab is shared with the doctor app, so the column order here is
 * ITS order and must stay in step with readGifts() in
 * google-apps-script-booking.gs:
 *
 *   tier | id | title | short | desc | emoji | active | stock | weight
 *
 * A row whose tier is not one of the four (blank, a typo, a note someone
 * left) is skipped rather than crashing the whole wheel over one bad row.
 */
function readGifts() {
  var out = { superpremium: [], premium: [], standard: [], consolation: [] };
  var sheet = tab(dataSheet(), GIFTS_TAB);
  if (!sheet || sheet.getLastRow() < 2) {
    console.error('The ' + GIFTS_TAB + ' tab is missing or empty — the wheel will be blank.');
    return out;
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var tier = String(r[0] || '').trim().toLowerCase();
    var title = String(r[2] || '').trim();
    if (!title || !out[tier]) continue;

    out[tier].push({
      // SpinWheel matches the winning slice back to a prize by id, so every
      // row needs one — fall back to a slug of the title, then the row
      // position, so a blank id column still gets something stable rather
      // than every such row colliding on ''.
      id: String(r[1] || '').trim() || slugify(title) || (tier + '-' + (i + 1)),
      tier: tier,
      title: title,
      short: String(r[3] || '').trim() || title,
      desc: String(r[4] || '').trim(),
      emoji: String(r[5] || '').trim() || '🎁',
      active: !/^(no|false|0|off)$/i.test(String(r[6] || 'yes').trim()),
      stock: parseNullableInt(r[7]), // null = unlimited
      weight: parseWeight(r[8]),
    });
  }
  return out;
}

/** A visitor who already has a prize recorded may answer again, but not spin. */
function eligibilityResponse(phone) {
  var digits = digitsOnly(phone);
  if (digits.length < 10) {
    return json({ ok: false, reason: 'invalid', error: 'A valid mobile number is required.' });
  }

  var existing = findEntry('', digits);
  var won = !!(existing && String(existing.prize || '').trim());
  return json({ ok: true, eligible: !won, ref: existing ? existing.ref : '' });
}

// ============================================================
//  Writes
// ============================================================

/**
 * The first row for this visitor, written the instant the registration form
 * is submitted. claimGift() and submitEntry() both find it afterwards by
 * phone (see findEntry) and upgrade it in place, so one visitor's whole
 * journey stays a single row instead of piling up one per step.
 *
 * Someone already past this step keeps their row untouched — going Back to
 * registration and resubmitting must not blank out a prize already won.
 */
function registerVisitor(data) {
  if (!String(data.name || '').trim()) {
    return json({ ok: false, reason: 'invalid', error: 'Name is required.' });
  }
  if (digitsOnly(data.phone).length < 10) {
    return json({ ok: false, reason: 'invalid', error: 'A valid mobile number is required.' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return json({ ok: false, reason: 'busy', error: 'Server busy, please try again.' });
  }

  try {
    var existing = findEntry(data.email, data.phone);
    if (existing && existing.status !== 'registered') {
      return json({ ok: true, ref: existing.ref });
    }

    var ref = existing ? existing.ref : makeRef();
    var row = [
      new Date(), ref, 'registered',
      sheetText(data.name), sheetText(data.email), sheetPhone(data.phone),
      '', '', '', '', '[]',
      sheetText(data.organization), sheetText(data.designation),
    ];

    if (existing) {
      entriesSheet().getRange(existing.row, 1, 1, row.length).setValues([row]);
    } else {
      entriesSheet().appendRow(row);
    }

    return json({ ok: true, ref: ref });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/**
 * Spends one unit of a prize's stock, the instant the wheel settles (see
 * GiftPage.jsx) — the prize is won right there, not later when the visitor
 * confirms their details, so stock has to be debited now or a limited prize
 * could go out more times than it has units.
 */
function claimGift(data) {
  var id = String(data.id || '').trim();
  if (!id) return json({ ok: false, error: 'Missing prize id.' });
  if (digitsOnly(data.phone).length < 10) {
    return json({ ok: false, reason: 'invalid', error: 'A valid mobile number is required.' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return json({ ok: false, reason: 'busy', error: 'Server busy, please try again.' });
  }

  try {
    // The authoritative one-prize-per-mobile check. It runs under the same
    // lock as the stock change, so two tabs cannot both claim.
    var prior = findEntry('', data.phone);
    if (prior && String(prior.prize || '').trim()) {
      return json({ ok: false, reason: 'alreadyclaimed', error: 'This mobile number has already claimed a prize.' });
    }

    var sheet = tab(dataSheet(), GIFTS_TAB);
    if (!sheet || sheet.getLastRow() < 2) return json({ ok: false, error: 'Prize not found.' });

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getDisplayValues();
    for (var i = 0; i < rows.length; i++) {
      var tier = String(rows[i][0] || '').trim().toLowerCase();
      var title = String(rows[i][2] || '').trim();
      var rowId = String(rows[i][1] || '').trim() || slugify(title) || (tier + '-' + (i + 1));
      if (rowId !== id) continue;

      var active = !/^(no|false|0|off)$/i.test(String(rows[i][6] || 'yes').trim());
      if (!active) return json({ ok: false, reason: 'outofstock', error: 'That prize is no longer available.' });

      var stock = parseNullableInt(rows[i][7]);
      if (stock !== null && stock <= 0) {
        return json({ ok: false, reason: 'outofstock', error: 'That prize just ran out.' });
      }

      // A voucher prize is only won if there is a code left to send.
      var ref = prior ? prior.ref : makeRef();
      var vouchers = readVouchers();
      var type = voucherTypeFor(title, vouchers);
      if (type && reserveVoucher(vouchers, type, ref, data) === -1) {
        console.error('No AVAILABLE ' + type + ' vouchers left in ' + VOUCHERS_TAB + ' — refusing "' + title + '".');
        return json({ ok: false, reason: 'outofstock', error: 'That prize just ran out.' });
      }

      if (stock !== null) sheet.getRange(i + 2, 8).setValue(stock - 1);

      var claimRow = [
        new Date(), ref, 'prize-claimed',
        sheetText(data.name), sheetText(data.email), sheetPhone(data.phone),
        '', '', '', title, '[]',
        sheetText(data.organization), sheetText(data.designation),
      ];
      if (prior) {
        entriesSheet().getRange(prior.row, 1, 1, claimRow.length).setValues([claimRow]);
      } else {
        entriesSheet().appendRow(claimRow);
      }

      try { CacheService.getScriptCache().remove(GIFTS_CACHE_KEY); } catch (cacheErr) {}
      return json({ ok: true, remaining: stock === null ? null : stock - 1 });
    }

    return json({ ok: false, error: 'Prize not found.' });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/**
 * The final write: contact details, quiz result and prize, all onto the one
 * row this visitor has had since registration.
 *
 * Note what happens on a REPEAT submit (same phone or email, row already at
 * 'entered'): the row is left alone, but the confirmation is still sent and
 * the original ref is returned. The doctor app returns early here and sends
 * nothing, which is why a doctor who replayed the quiz saw a success screen
 * and never got an email. Re-sending a confirmation someone already has is
 * a far smaller problem than silently sending nothing.
 */
function submitEntry(data) {
  var invalid = validate(data);
  if (invalid) return json({ ok: false, reason: 'invalid', error: invalid });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return json({ ok: false, reason: 'busy', error: 'Server busy, please try again.' });
  }

  var ref;
  var repeat = false;

  try {
    var existing = findEntry(data.email, data.phone);
    repeat = !!(existing && existing.status === 'entered');
    ref = existing ? existing.ref : makeRef();

    var row = [
      new Date(), ref, 'entered',
      sheetText(data.name), sheetText(data.email), sheetPhone(data.phone),
      data.score, data.total, data.percent,
      sheetText(data.gift || (existing ? existing.prize : '') || ''),
      JSON.stringify(data.answers || []),
      sheetText(data.organization), sheetText(data.designation),
    ];

    if (repeat) {
      // Keep the first entry's record as the audit trail; only the ref is
      // reused, so the reference on the visitor's screen stays the one
      // already written on their row.
      console.info('Repeat submit for ' + ref + ' — row left as-is, confirmation re-sent.');
    } else if (existing) {
      entriesSheet().getRange(existing.row, 1, 1, row.length).setValues([row]);
    } else {
      entriesSheet().appendRow(row);
    }
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }

  // The row is safely written, so let go of the lock before the slow stuff.
  // Mail and webhooks take seconds; holding the lock through them would
  // queue up everyone else at the stall behind this one visitor.
  if (SEND_EMAILS) {
    try {
      sendEntryEmail(data, ref);
    } catch (mailErr) {
      // Logged loudly because the visitor still sees a success screen
      // either way. A voucher stays RESERVED to them, so running
      // sendPendingVouchers() later delivers it.
      console.error('EMAIL FAILED for ' + ref + ': ' + mailErr);
    }
  }

  try {
    notifyPabbly(data, ref);
  } catch (waErr) {
    console.error('Pabbly webhook threw for ' + ref + ': ' + waErr);
  }

  return json({ ok: true, ref: ref, alreadyEntered: repeat });
}

function validate(data) {
  if (!data) return 'Empty request.';
  if (!String(data.name || '').trim()) return 'Name is required.';
  if (!String(data.organization || '').trim()) return 'Organization is required.';
  // Designation is optional on the form. Email is required on the form,
  // but only checked for shape here so an out-of-date tablet still saves.
  var email = String(data.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That email address does not look right.';
  if (digitsOnly(data.phone).length < 10) return 'A valid WhatsApp number is required.';
  return null;
}

/**
 * The one row this visitor has, matched by email OR phone (whichever
 * matches — a typo in one shouldn't defeat this), ignoring cancelled rows.
 */
function findEntry(email, phone) {
  var sheet = entriesSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var normEmail = String(email || '').trim().toLowerCase();
  var allDigits = digitsOnly(phone);
  var normPhone = allDigits.length >= 10 ? allDigits.slice(-10) : '';
  if (!normEmail && !normPhone) return null;

  var rows = sheet.getRange(2, 1, lastRow - 1, ENTRY_HEADERS.length).getDisplayValues();
  // Legacy rows hold a broken formula rather than text — see
  // phoneDigitsFromSheet for why the formula text is worth reading.
  var phoneFormulas = sheet.getRange(2, COL.phone + 1, lastRow - 1, 1).getFormulas();
  var match = null;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var status = String(r[COL.status] || '').trim().toLowerCase();
    if (status === 'cancelled') continue;

    var rowEmail = String(r[COL.email] || '').trim().toLowerCase();
    var rowPhone = phoneDigitsFromSheet(r[COL.phone], phoneFormulas[i][0]);

    if ((normEmail && rowEmail === normEmail) || (normPhone && rowPhone === normPhone)) {
      var candidate = {
        row: i + 2,
        ref: r[COL.ref],
        status: status,
        name: String(r[COL.name] || ''),
        prize: String(r[COL.prize] || ''),
      };
      // Normally one visitor has one row, but duplicates do happen (a row
      // that was invisible to this lookup, a sheet edited by hand). Taking
      // the FIRST match would hand back a bare 'registered' row while a
      // later row records the prize already won — and the one-prize check
      // would wave that visitor through for a second spin. So keep looking
      // and return the row that got furthest.
      if (!match || entryProgress(candidate) > entryProgress(match)) match = candidate;
    }
  }

  return match;
}

/** How far a row got: entered > prize-claimed > registered, plus one for a prize. */
function entryProgress(row) {
  var rank = { registered: 1, 'prize-claimed': 2, entered: 3 }[row.status] || 0;
  return rank + (String(row.prize || '').trim() ? 1 : 0);
}

// ============================================================
//  Email + WhatsApp
// ============================================================

// ============================================================
//  Vouchers (GiftVouchers tab)
// ============================================================

/**
 * The voucher tab, with its columns found by header name. Null when the tab
 * is missing or lacks a column the voucher flow cannot work without.
 */
function readVouchers() {
  var sheet = tab(dataSheet(), VOUCHERS_TAB);
  if (!sheet || sheet.getLastRow() < 1) return null;

  var width = Math.max(7, sheet.getLastColumn ? sheet.getLastColumn() : 12);
  var header = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  var col = {};
  var names = {
    type: ['type'], code: ['code', 'vouchernumber', 'cardnumber'], pin: ['pin'],
    status: ['status'], terms: ['terms', 'termsofuse', 'tnc'], claimedBy: ['claimedby'],
    couponId: ['couponid', 'id'], amount: ['amount', 'value', 'denomination'],
    expiry: ['expiry', 'expirydate', 'validuntil', 'validtill'],
  };
  header.forEach(function (h, i) {
    var key = String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    Object.keys(names).forEach(function (field) {
      if (col[field] === undefined && names[field].indexOf(key) !== -1) col[field] = i;
    });
  });
  var required = ['type', 'code', 'status', 'claimedBy'];
  for (var r = 0; r < required.length; r++) {
    if (col[required[r]] === undefined) {
      console.error('The ' + VOUCHERS_TAB + ' tab has no "' + required[r] + '" column.');
      return null;
    }
  }

  var count = Math.max(0, sheet.getLastRow() - 1);
  var rows = count ? sheet.getRange(2, 1, count, width).getDisplayValues() : [];
  // A Terms cell may be a link whose visible text is not the URL itself.
  var rich = null;
  if (count && col.terms !== undefined) {
    try { rich = sheet.getRange(2, col.terms + 1, count, 1).getRichTextValues(); } catch (e) { rich = null; }
  }
  return { sheet: sheet, col: col, rows: rows, rich: rich };
}

function voucherCell(v, i, field) {
  return v.col[field] === undefined ? '' : String(v.rows[i][v.col[field]] || '').trim();
}

function voucherStatus(v, row) {
  return String(row[v.col.status] || '').trim().toUpperCase();
}

/** "Amazon Voucher ₹500" -> "Amazon", if Amazon is a Type on the voucher tab. */
function voucherTypeFor(giftTitle, v) {
  var title = String(giftTitle || '').toLowerCase();
  if (!v || !title) return null;
  for (var i = 0; i < v.rows.length; i++) {
    var type = voucherCell(v, i, 'type');
    if (type && title.indexOf(type.toLowerCase()) !== -1) return type;
  }
  return null;
}

/**
 * The voucher row this ref holds (RESERVED or CLAIMED), or -1.
 *
 * Status is what counts, not ClaimedBy: setting a row back to AVAILABLE in
 * the sheet frees that code for the next winner even if the old ClaimedBy
 * text is left in place — it is simply overwritten when the code is reused.
 */
function voucherIndexFor(v, ref) {
  for (var i = 0; i < v.rows.length; i++) {
    var status = voucherStatus(v, v.rows[i]);
    if (status !== 'RESERVED' && status !== 'CLAIMED') continue;
    if (voucherCell(v, i, 'claimedBy').indexOf(ref + ' ') === 0) return i;
  }
  return -1;
}

/**
 * Holds the next AVAILABLE code of this type for this visitor. Call it with
 * the script lock held. Returns the row index, or -1 if none are left.
 * Idempotent: a visitor who already holds a code keeps the same one.
 */
function reserveVoucher(v, type, ref, data) {
  var held = voucherIndexFor(v, ref);
  if (held !== -1) return held;

  for (var i = 0; i < v.rows.length; i++) {
    if (voucherCell(v, i, 'type').toLowerCase() !== type.toLowerCase()) continue;
    if (voucherStatus(v, v.rows[i]) !== 'AVAILABLE') continue;
    var who = claimedByText(ref, data);
    v.sheet.getRange(i + 2, v.col.status + 1).setValue('RESERVED');
    v.sheet.getRange(i + 2, v.col.claimedBy + 1).setValue(who);
    v.rows[i][v.col.status] = 'RESERVED';
    v.rows[i][v.col.claimedBy] = who;
    return i;
  }
  return -1;
}

/** "CP-AB12CD · Asha Verma · 919876543210 · asha@x.com · 22/11/2026 14:05" — starts with the ref, which is how it is looked up. */
function claimedByText(ref, data) {
  var when = '';
  try { when = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm'); } catch (e) { when = ''; }
  return sheetText([ref, data.name, sheetPhone(data.phone), data.email, when]
    .map(function (x) { return String(x || '').trim(); })
    .filter(function (x) { return x; })
    .join(' · '));
}

function voucherDetails(v, i, giftTitle) {
  var terms = voucherCell(v, i, 'terms');
  if (!/^https?:\/\//i.test(terms) && v.rich && v.rich[i] && v.rich[i][0]) {
    try { terms = v.rich[i][0].getLinkUrl() || terms; } catch (e) {}
  }
  var amount = voucherCell(v, i, 'amount') || amountFromTitle(giftTitle);
  return {
    type: voucherCell(v, i, 'type'),
    code: voucherCell(v, i, 'code'),
    pin: voucherCell(v, i, 'pin'),
    amount: String(amount || '').replace(/^₹\s*/, ''),
    expiry: voucherCell(v, i, 'expiry'),
    terms: /^https?:\/\//i.test(terms) ? terms : '',
  };
}

/** "Amazon Voucher ₹500" / "Rs 500 Myntra card" -> "500". */
function amountFromTitle(title) {
  var m = String(title || '').match(/(?:₹|rs\.?|inr)\s*([\d,]+)/i) || String(title || '').match(/([\d,]+)\s*(?:₹|rs\b|inr\b)/i);
  return m ? m[1] : '';
}

// ============================================================
//  Email (sent by Pabbly, from info@eqova.in)
// ============================================================

/**
 * Builds the visitor's email and hands it to the Pabbly webhook. For a
 * voucher prize it carries the visitor's reserved code, and the code is
 * marked CLAIMED once Pabbly accepts it. Safe to call again for the same
 * ref: the same code is re-sent, never a second one.
 */
function sendEntryEmail(data, ref) {
  var settings = readSettings();
  var to = String(data.email || '').trim();
  if (!to) {
    console.info('No email for ' + ref + ' — skipping the visitor email.');
    return { ok: false, skipped: true };
  }

  var vouchers = readVouchers();
  var type = voucherTypeFor(data.gift, vouchers);
  var index = -1;
  if (type) {
    index = voucherIndexFor(vouchers, ref);
    if (index === -1) {
      // Won before vouchers were reserved at spin time — reserve one now.
      var lock = LockService.getScriptLock();
      if (lock.tryLock(30000)) {
        try {
          vouchers = readVouchers();
          index = reserveVoucher(vouchers, type, ref, data);
        } finally {
          try { lock.releaseLock(); } catch (ignored) {}
        }
      }
    }
    if (index === -1) {
      console.error('VOUCHER MISSING for ' + ref + ': no ' + type + ' code could be reserved. Email not sent.');
      return { ok: false, error: 'no voucher' };
    }
  }

  var webhook = settings.cphiEmailWebhook;
  if (!webhook) {
    console.error('No cphiEmailWebhook in Settings — email for ' + ref + ' not sent' +
      (type ? ' (voucher stays RESERVED).' : '.'));
    return { ok: false, error: 'no webhook' };
  }

  var voucher = index === -1 ? null : voucherDetails(vouchers, index, data.gift);
  var mail = buildEmail(data, voucher, settings);
  var brand = settings.brandName || 'Eqova Medicare';
  var payload = {
    event: 'cphi_email',
    ref: ref,
    to: to,
    toName: data.name || '',
    fromName: brand,
    replyTo: settings.cphiContactEmail || 'info@eqova.in',
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    prize: data.gift || '',
    isVoucher: !!voucher,
    voucherType: voucher ? voucher.type : '',
    voucherCode: voucher ? voucher.code : '',
    voucherPin: voucher ? voucher.pin : '',
    voucherAmount: voucher ? voucher.amount : '',
    voucherExpiry: voucher ? voucher.expiry : '',
    voucherTerms: voucher ? voucher.terms : '',
  };

  var res = UrlFetchApp.fetch(webhook, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var body = String(res.getContentText() || '');
  if (code < 200 || code >= 300 || /"status"\s*:\s*"error"/i.test(body)) {
    // Never log the payload: it holds the voucher code.
    console.error('Pabbly email webhook rejected ' + ref + ' with HTTP ' + code + ': ' + body.slice(0, 300));
    return { ok: false, error: 'HTTP ' + code };
  }

  if (voucher) {
    vouchers.sheet.getRange(index + 2, vouchers.col.status + 1).setValue('CLAIMED');
    console.info('Voucher ' + (voucherCell(vouchers, index, 'couponId') || ('row ' + (index + 2))) + ' CLAIMED by ' + ref + '.');
  }
  return { ok: true };
}

/**
 * Retries every voucher still RESERVED — e.g. the email webhook was paused,
 * or the visitor left before the last screen. Run it from the editor, or on
 * a time-driven trigger. Codes already CLAIMED are never re-sent from here.
 */
function sendPendingVouchers() {
  var v = readVouchers();
  if (!v) { Logger.log('No usable ' + VOUCHERS_TAB + ' tab.'); return; }
  var sent = 0, failed = 0;
  for (var i = 0; i < v.rows.length; i++) {
    if (voucherStatus(v, v.rows[i]) !== 'RESERVED') continue;
    var ref = voucherCell(v, i, 'claimedBy').split(' ')[0];
    var entry = entryByRef(ref);
    if (!entry || !entry.email) {
      Logger.log('Row ' + (i + 2) + ': no entry with an email for ' + ref + ' — skipped.');
      failed++;
      continue;
    }
    var result = sendEntryEmail(entry, ref);
    if (result.ok) sent++; else failed++;
  }
  Logger.log('Pending vouchers: ' + sent + ' sent, ' + failed + ' not sent.');
}

function entryByRef(ref) {
  if (!ref) return null;
  var sheet = entriesSheet();
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ENTRY_HEADERS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[COL.ref]).trim() !== ref) continue;
    return {
      name: r[COL.name], email: String(r[COL.email] || '').trim(), phone: r[COL.phone],
      organization: r[COL.organization], designation: r[COL.designation], gift: r[COL.prize],
    };
  }
  return null;
}

/** How to redeem each voucher Type. Anything else gets a generic line. */
var CLAIM_STEPS = {
  amazon: [
    'Log in to your account at amazon.in or open the Amazon app.',
    'Go to Amazon Pay → Add Gift Card.',
    'Enter the code shown above and click Add to Balance.',
  ],
  myntra: [
    'Log in to your account at myntra.com or open the Myntra app.',
    'Go to Profile → Gift Cards → Add Gift Card.',
    'Enter the card number and PIN shown above and add it to your Myntra Credit.',
  ],
  uber: [
    'Open the Uber app and tap Account → Wallet.',
    'Tap Add Payment Method → Gift Card.',
    'Enter the code shown above and tap Add.',
  ],
};

/** The visitor email, in the agreed format. `voucher` is null for other prizes. */
function buildEmail(data, voucher, settings) {
  var brand = settings.brandName || 'Eqova Medicare';
  var name = String(data.name || '').trim() || 'there';
  var footer = [
    settings.cphiContactPhone ? '📞 ' + settings.cphiContactPhone : '',
    '✉️ ' + (settings.cphiContactEmail || 'info@eqova.in'),
    settings.cphiWebsite ? '🌐 ' + settings.cphiWebsite : '',
  ].filter(function (x) { return x; });

  var text = [];
  var html = [];
  var P = 'margin:0 0 14px';
  var para = function (t) { text.push(t, ''); html.push('<p style="' + P + '">' + escapeHtml(t) + '</p>'); };

  para('Dear ' + name + ',');
  para('Thank you for visiting ' + brand + ' at ' + EMAIL_EVENT_NAME + ' and taking part in our quiz.');

  if (voucher) {
    var article = /^[aeiou]/i.test(voucher.type) ? 'an' : 'a';
    var worth = voucher.amount ? ' worth ₹' + voucher.amount : '';
    var headline = 'Congratulations, you\'ve won ' + article + ' ' + voucher.type + ' voucher' + worth + '!';
    var details = [['Voucher Number', voucher.code]];
    if (voucher.pin) details.push(['PIN', voucher.pin]);
    if (voucher.expiry) details.push(['Valid until', voucher.expiry]);
    var steps = CLAIM_STEPS[voucher.type.toLowerCase()] ||
      ['Redeem it on the ' + voucher.type + ' website or app using the details shown above.'];
    var rule = 'It can\'t be exchanged for cash, and it can\'t be reissued if lost or shared.';

    text.push(headline, '', 'Your voucher details');
    details.forEach(function (d) { text.push(d[0] + ': ' + d[1]); });
    text.push('', 'How to claim');
    steps.forEach(function (s, n) { text.push((n + 1) + '. ' + s); });
    text.push('', 'Terms: ' + (voucher.terms ? 'Please do read the terms of use (' + voucher.terms + '). ' : '') + rule, '');

    html.push(
      '<p style="' + P + ';font-size:17px;font-weight:700;color:#0c3c54">' + escapeHtml(headline) + '</p>',
      '<div style="border:1px solid #f4ac3c;background:#fef8ed;border-radius:10px;padding:14px 18px;margin:0 0 16px">',
      '<div style="font-weight:700;margin-bottom:6px">Your voucher details</div>',
      details.map(function (d) {
        return '<div>' + escapeHtml(d[0]) + ': <b style="font-family:Consolas,Menlo,monospace;letter-spacing:.5px">' + escapeHtml(d[1]) + '</b></div>';
      }).join(''),
      '</div>',
      '<div style="font-weight:700;margin-bottom:4px">How to claim</div>',
      '<ol style="margin:0 0 14px;padding-left:20px">',
      steps.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join(''),
      '</ol>',
      '<p style="' + P + ';font-size:13px;color:#475569">Terms: ' +
        (voucher.terms ? 'Please do read the <a href="' + escapeHtml(voucher.terms) + '">terms of use</a>. ' : '') +
        escapeHtml(rule) + '</p>'
    );
  }

  para('If you have any current or upcoming requirements, or would like to explore a collaboration or partnership, we\'d be happy to hear from you and see how we can help.');
  para('Please let us know a convenient time to connect. We look forward to staying in touch.');

  text.push('Kind regards,', 'Team ' + brand, '', footer.join(' | '));
  html.push(
    '<p style="margin:0">Kind regards,<br>Team ' + escapeHtml(brand) + '</p>',
    '<p style="margin:16px 0 0;font-size:13px;color:#475569">' + footer.map(escapeHtml).join(' &nbsp;|&nbsp; ') + '</p>'
  );

  return {
    subject: voucher
      ? 'Your ' + voucher.type + ' voucher from ' + brand + ' — ' + EMAIL_EVENT_NAME
      : 'Thank you for visiting ' + brand + ' at ' + EMAIL_EVENT_NAME,
    html: '<div style="font:15px/1.6 system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:560px">' + html.join('') + '</div>',
    text: text.join('\n'),
  };
}

/**
 * Optional WhatsApp confirmation, via Pabbly Connect -> Pabbly Chatflow.
 * Set `cphiPabblyWebhook` in the shared Settings tab to switch it on; the
 * doctor app's own `pabblyWebhook` row is left alone, so the two campaigns
 * can point at different workflows (or this one at none).
 *
 * Unlike the doctor app's version, this checks the response code. A paused
 * workflow or an exhausted Pabbly task quota answers with a non-2xx, and
 * swallowing that is exactly how WhatsApp messages stop arriving with
 * nothing in the logs to say why.
 */
function notifyPabbly(data, ref) {
  var settings = readSettings();
  if (!settings.cphiPabblyWebhook) {
    console.info('No cphiPabblyWebhook in Settings — skipping WhatsApp for ' + ref + '.');
    return;
  }

  var payload = {
    event: 'cphi_entry',
    ref: ref,
    name: data.name || '',
    phone: waNumber(data.phone),   // 919127072000 — what Chatflow wants
    phoneRaw: String(data.phone || ''),
    email: data.email || '',
    organization: data.organization || '',
    designation: data.designation || '',
    score: data.score,
    total: data.total,
    percent: data.percent,
    gift: data.gift || '',
    brandName: settings.brandName || 'Eqova Medicare',
    eventName: settings.cphiEventName || 'CPHI',
  };

  var res = UrlFetchApp.fetch(settings.cphiPabblyWebhook, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error('Pabbly webhook rejected ' + ref + ' with HTTP ' + code + ': ' +
      res.getContentText().slice(0, 300));
  }
}

/** Chatflow expects digits with country code and no +, e.g. 919127072000. */
function waNumber(phone) {
  var digits = digitsOnly(phone);
  if (digits.length === 10) return '91' + digits;            // bare Indian mobile
  if (digits.length === 11 && digits.charAt(0) === '0') return '91' + digits.slice(1);
  return digits;
}

// ============================================================
//  Sheets plumbing
// ============================================================

function contentSheet() {
  return CONTENT_SHEET_ID && CONTENT_SHEET_ID.indexOf('PASTE_') !== 0
    ? SpreadsheetApp.openById(CONTENT_SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function dataSheet() {
  return DATA_SHEET_ID && DATA_SHEET_ID.indexOf('PASTE_') !== 0
    ? SpreadsheetApp.openById(DATA_SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

/** Tolerant tab lookup: case-insensitive and ignores stray spaces. */
function tab(ss, name) {
  var sheets = ss.getSheets();
  var want = String(name).trim().toLowerCase();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === want) return sheets[i];
  }
  return null;
}

function entriesSheet() {
  var sheet = tab(dataSheet(), ENTRIES_TAB);
  if (!sheet) throw new Error('The ' + ENTRIES_TAB + ' tab does not exist. Run setupSheets once.');
  return sheet;
}

function readSettings() {
  var sheet = tab(dataSheet(), SETTINGS_TAB);
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    var key = String(r[0] || '').trim();
    if (key) out[key] = String(r[1] || '').trim();
  });
  return out;
}

/**
 * Run this ONCE from the editor. Creates the CphiEntries tab with its
 * header row, and adds the two CPHI rows to the shared Settings tab if
 * they are not there yet. Safe to re-run: it never overwrites existing
 * data, and never touches the doctor app's tabs.
 */
function setupSheets() {
  var ss = dataSheet();
  var sheet = tab(ss, ENTRIES_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(ENTRIES_TAB);
    sheet.appendRow(ENTRY_HEADERS);
    sheet.getRange(1, 1, 1, ENTRY_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    Logger.log('Created the ' + ENTRIES_TAB + ' tab.');
  } else {
    Logger.log('The ' + ENTRIES_TAB + ' tab already exists — data left as-is.');
  }

  // Make sure row 1 is the header, WITHOUT ever writing over data. Three cases:
  //  - row 1 already starts with the header: rewrite it in full, which on a
  //    tab made before Organization/Designation existed just adds those two;
  //  - row 1 is empty (a fresh hand-made tab): write the header into it;
  //  - row 1 holds DATA (a hand-made tab that took entries before this ever
  //    ran, so the first entry landed where the header belongs): insert a new
  //    row above it, so that entry moves down to row 2 intact.
  var firstCell = String(sheet.getRange(1, 1).getDisplayValue() || '').trim();
  if (firstCell && firstCell !== ENTRY_HEADERS[0]) {
    sheet.insertRowBefore(1);
    Logger.log('Row 1 held an entry, not a header — inserted a header row above it.');
  }
  sheet.getRange(1, 1, 1, ENTRY_HEADERS.length).setValues([ENTRY_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Outside the if, so it is applied even to a tab someone created by hand
  // before running this — which is exactly the case that used to slip
  // through. Sheets is eager about long digit strings and about anything
  // beginning with "+", so the phone column is forced to plain text.
  sheet.getRange(1, COL.phone + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  Logger.log('Phone column forced to plain text.');

  var settings = tab(ss, SETTINGS_TAB);
  if (settings) {
    var existing = readSettings();
    var wanted = [
      ['cphiEventName', 'CPHI'], ['cphiPabblyWebhook', ''],
      ['cphiEmailWebhook', ''], ['cphiContactPhone', ''],
      ['cphiContactEmail', 'info@eqova.in'], ['cphiWebsite', ''],
    ];
    wanted.forEach(function (pair) {
      if (!(pair[0] in existing)) {
        settings.appendRow(pair);
        Logger.log('Added Settings row: ' + pair[0]);
      }
    });
  } else {
    Logger.log('No ' + SETTINGS_TAB + ' tab found — brand name and email footer will fall back to defaults.');
  }

  var vouchers = readVouchers();
  Logger.log(vouchers
    ? 'Found the ' + VOUCHERS_TAB + ' tab: ' + vouchers.rows.filter(function (r) { return voucherStatus(vouchers, r) === 'AVAILABLE'; }).length + ' codes AVAILABLE.'
    : 'WARNING: no ' + VOUCHERS_TAB + ' tab (or a column is missing) — voucher prizes will send no code.');

  var content = tab(contentSheet(), QUESTIONS_TAB);
  Logger.log(content
    ? 'Found the ' + QUESTIONS_TAB + ' tab with ' + Math.max(0, content.getLastRow() - 1) + ' question rows.'
    : 'WARNING: no ' + QUESTIONS_TAB + ' tab in the content sheet — the quiz will have no questions.');
}

/**
 * One-time repair for rows written before sheetPhone() existed, whose phone
 * cell holds a broken formula instead of text (see phoneDigitsFromSheet).
 * Such a row is invisible to findEntry, so the visitor can spin again and
 * every later step appends a duplicate instead of upgrading their row.
 *
 * Run it manually from the editor after deploying. Safe to re-run: a row
 * already holding plain digits is left untouched.
 */
function repairEntryPhones() {
  var sheet = entriesSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Nothing to repair — no entries yet.');
    return;
  }

  var range = sheet.getRange(2, COL.phone + 1, lastRow - 1, 1);
  var display = range.getDisplayValues();
  var formulas = range.getFormulas();
  var fixed = 0;
  var unrecoverable = 0;

  for (var i = 0; i < display.length; i++) {
    var current = String(display[i][0] || '').trim();
    if (current && current === digitsOnly(current)) continue; // already plain digits

    var recovered = digitsOnly(formulas[i][0]) || digitsOnly(current);
    if (recovered.length >= 10) {
      sheet.getRange(i + 2, COL.phone + 1).setNumberFormat('@').setValue(recovered);
      fixed++;
    } else if (current) {
      Logger.log('Row ' + (i + 2) + ': could not recover a phone from "' + current + '"');
      unrecoverable++;
    }
  }

  Logger.log('Repaired ' + fixed + ' phone cell(s); ' + unrecoverable + ' could not be recovered.');
}

/** Run after editing QuestionsCPHI or Gifts to skip the cache TTL. */
function clearCaches() {
  var cache = CacheService.getScriptCache();
  cache.remove(QUESTIONS_CACHE_KEY);
  cache.remove(GIFTS_CACHE_KEY);
  Logger.log('Caches cleared.');
}

// ============================================================
//  Small helpers
// ============================================================

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rawJson(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function makeRef() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — read aloud at a noisy stall
  var out = '';
  for (var i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'CP-' + out;
}

function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/**
 * Google Sheets parses any cell that BEGINS with "+", "=", "-" or "@" as a
 * formula. The app sends "+91 9876543210", so writing it straight into the
 * sheet lands a broken formula in the cell: getDisplayValues() then returns
 * "#ERROR!", digitsOnly() on that returns "", and findEntry can never match
 * the row again — every later step appends a NEW row instead of upgrading
 * the one that is already there, and the one-prize-per-mobile check silently
 * passes everybody.
 *
 * Storing the digits alone sidesteps it entirely: "919876543210" can never
 * be read as a formula, and it is exactly the form findEntry compares
 * against, so what is stored and what is matched can never drift apart.
 */
function sheetPhone(value) {
  return digitsOnly(value);
}

/**
 * Free text typed by the public (name, email, organization, designation)
 * goes straight into the sheet, and Sheets runs anything beginning with
 * "=", "+", "-" or "@" as a formula — so "=IMPORTXML(...)" typed as an
 * organization would execute in your spreadsheet, and "+ QA Lead" would
 * land as #ERROR!. A leading apostrophe is Sheets' own "this is text"
 * marker: it is stored, never displayed, and the cell reads back exactly as
 * typed.
 */
function sheetText(value) {
  var text = String(value == null ? '' : value).trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

/**
 * Reads a phone back out of the sheet as its last 10 digits.
 *
 * The formula fallback is for rows written before sheetPhone existed: the
 * cell displays "#ERROR!" but its FORMULA text is still the original
 * "+91 9876543210", so the number is recoverable. Matching on the last 10
 * digits means "+91 98765 43210", "9876543210" and "0919876543210" are all
 * recognised as the same person — the same rule the doctor app settled on.
 */
function phoneDigitsFromSheet(displayValue, formulaValue) {
  var digits = digitsOnly(displayValue);
  if (digits.length < 10) digits = digitsOnly(formulaValue);
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseNullableInt(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return null;
  var n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

/** A missing or nonsense weight means "same odds as everything else". */
function parseWeight(value) {
  var n = Number(String(value == null ? '' : value).trim());
  return isFinite(n) && n > 0 ? n : 1;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

