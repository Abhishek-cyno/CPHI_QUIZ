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
 *    prompt (Sheets, Gmail, external requests) as the account whose Gmail
 *    should send the confirmations.
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

// Confirmation email to the visitor, sent on the final submit. MailApp
// sends as whichever Google account holds the live DEPLOYMENT (not
// necessarily whoever owns this file) and there is no from-address
// override — so to send as a particular address, deploy from that account.
//
// Gmail's daily quota is ~100 recipients on a free account and 1,500 on
// Workspace. Each entry sends one mail to the visitor, plus one to
// `notifyEmail` if that Setting is filled in — so leaving notifyEmail
// blank doubles how many entries a day you can mail.
var SEND_EMAILS = true;

// How long the question bank and prize catalog may be served from cache.
// Run clearCaches() after editing a tab to make the change show up at once.
var QUESTIONS_CACHE_KEY = 'cphi_questions_v1';
var QUESTIONS_CACHE_TTL = 300;
var GIFTS_CACHE_KEY = 'cphi_gifts_v1';
var GIFTS_CACHE_TTL = 120;

var ENTRY_HEADERS = [
  'Entered At', 'Ref', 'Status', 'Name', 'Email', 'Phone',
  'Score', 'Total', 'Percent', 'Prize', 'Answers (JSON)',
];

// Column indexes into ENTRY_HEADERS, 0-based, used when reading rows back.
var COL = { ref: 1, status: 2, name: 3, email: 4, phone: 5, prize: 9 };

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
      data.name || '', data.email || '', sheetPhone(data.phone),
      '', '', '', '', '[]',
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
      if (stock !== null) sheet.getRange(i + 2, 8).setValue(stock - 1);

      var claimRow = [
        new Date(), prior ? prior.ref : makeRef(), 'prize-claimed',
        data.name || '', data.email || '', sheetPhone(data.phone),
        '', '', '', title, '[]',
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
      data.name || '', data.email || '', sheetPhone(data.phone),
      data.score, data.total, data.percent,
      data.gift || (existing ? existing.prize : '') || '',
      JSON.stringify(data.answers || []),
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
      sendEntryEmails(data, ref);
    } catch (mailErr) {
      // Most often this is the daily Gmail quota, which resets around
      // midnight Pacific — the symptom is mail working in the morning and
      // going quiet later in the day. Logged loudly because the visitor
      // still sees a success screen either way.
      console.error('EMAIL FAILED for ' + ref + ': ' + mailErr +
        ' (remaining quota today: ' + safeQuota() + ')');
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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.email || '').trim())) return 'A valid email is required.';
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

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var status = String(r[COL.status] || '').trim().toLowerCase();
    if (status === 'cancelled') continue;

    var rowEmail = String(r[COL.email] || '').trim().toLowerCase();
    var rowPhone = phoneDigitsFromSheet(r[COL.phone], phoneFormulas[i][0]);

    if ((normEmail && rowEmail === normEmail) || (normPhone && rowPhone === normPhone)) {
      return {
        row: i + 2,
        ref: r[COL.ref],
        status: status,
        name: String(r[COL.name] || ''),
        prize: String(r[COL.prize] || ''),
      };
    }
  }

  return null;
}

// ============================================================
//  Email + WhatsApp
// ============================================================

function sendEntryEmails(data, ref) {
  var settings = readSettings();
  var brand = settings.brandName || 'Eqova Medicare';
  var event = settings.cphiEventName || 'CPHI';

  MailApp.sendEmail({
    to: data.email,
    name: brand,
    subject: 'Your ' + event + ' quiz entry is confirmed — ' + ref,
    htmlBody: entryEmailHtml(data, ref, brand, event),
    body: [
      'Hi ' + (data.name || 'there') + ',',
      '',
      'Thanks for taking the ' + brand + ' quiz at ' + event + '!',
      '',
      'Your score: ' + data.score + '/' + data.total + ' (' + data.percent + '%)',
      'Your prize: ' + (data.gift || '—'),
      'Reference: ' + ref,
      '',
      'Show this reference at our stall to collect your prize.',
      '',
      brand,
    ].join('\n'),
  });

  // Each of these costs another recipient against the daily quota, so a
  // blank notifyEmail doubles how many entries a day can be mailed.
  if (settings.notifyEmail) {
    MailApp.sendEmail({
      to: settings.notifyEmail,
      name: brand + ' ' + event,
      subject: 'New ' + event + ' entry: ' + (data.name || 'Visitor'),
      htmlBody: [
        '<h3>New ' + escapeHtml(event) + ' quiz entry</h3>',
        '<table cellpadding="6" style="border-collapse:collapse;font:14px system-ui">',
        row('Reference', ref),
        row('Name', data.name),
        row('Email', data.email),
        row('WhatsApp', data.phone),
        row('Quiz score', data.score + '/' + data.total + ' (' + data.percent + '%)'),
        row('Prize to hand over', data.gift || '—'),
        '</table>',
      ].join(''),
    });
  }
}

function entryEmailHtml(data, ref, brand, event) {
  return [
    '<div style="font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:520px">',
    '<div style="background:#0c3c54;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #f4ac3c">',
    '<div style="font-size:20px;font-weight:700">Entry confirmed ✓</div>',
    '<div style="opacity:.85;font-size:13px;margin-top:4px">' + escapeHtml(brand) + ' · ' + escapeHtml(event) + '</div>',
    '</div>',
    '<div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">',
    '<p>Hi ' + escapeHtml(data.name || 'there') + ',</p>',
    '<p>Thanks for taking our quiz! Here is how you did:</p>',
    '<table cellpadding="8" style="border-collapse:collapse;background:#fef8ed;border-radius:10px;width:100%;margin:16px 0">',
    row('✅ Score', data.score + ' / ' + data.total + ' (' + data.percent + '%)'),
    row('🎁 Prize', data.gift || '—'),
    row('#️⃣ Reference', ref),
    '</table>',
    '<p style="color:#64748b;font-size:13px">Show this reference at the ' + escapeHtml(brand) +
      ' stall to collect your prize. Reply to this email if you need a hand.</p>',
    '<p style="margin-bottom:0">— ' + escapeHtml(brand) + '</p>',
    '</div></div>',
  ].join('');
}

function row(label, value) {
  return '<tr><td style="color:#64748b">' + label + '</td><td><b>' +
    escapeHtml(String(value == null ? '' : value)) + '</b></td></tr>';
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

  // Outside the if, so it is applied even to a tab someone created by hand
  // before running this — which is exactly the case that used to slip
  // through. Sheets is eager about long digit strings and about anything
  // beginning with "+", so the phone column is forced to plain text.
  sheet.getRange(1, COL.phone + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  Logger.log('Phone column forced to plain text.');

  var settings = tab(ss, SETTINGS_TAB);
  if (settings) {
    var existing = readSettings();
    var wanted = [['cphiEventName', 'CPHI'], ['cphiPabblyWebhook', '']];
    wanted.forEach(function (pair) {
      if (!(pair[0] in existing)) {
        settings.appendRow(pair);
        Logger.log('Added Settings row: ' + pair[0]);
      }
    });
  } else {
    Logger.log('No ' + SETTINGS_TAB + ' tab found — brand name and notifyEmail will fall back to defaults.');
  }

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

/** Used only in the email failure log, so it must never throw itself. */
function safeQuota() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return 'unknown'; }
}
