# Eqova Medicare — CPHI Quiz

A stall quiz for CPHI: three random pharma questions with no time limit, then a
prize wheel. Built from the same bones as the doctor app in `D:\docquiz`, but this is
a **separate project with its own deployment** — nothing here changes that one.

```
Landing → Register → 3 questions → Score (2+ right) → 🎡 Spin → What you won
```

## What is different from the doctor app

| | Doctor app (`docquiz`) | This app (`cphiquiz`) |
|---|---|---|
| Audience | Doctors, by specialty | Anyone at the CPHI stall |
| Question routing | Per specialty + category | One shared bank, random draw |
| Register form | Name, mobile, specialty, category, clinic | Name, mobile, email |
| Branch after the wheel | Clinic owners book a rep visit; others leave contact details | Everyone confirms details, no booking |
| Prize pool | Split by clinic ownership | One pool for everyone |
| Backend | Three Apps Scripts (content, booking, responses) | One Apps Script |
| Theme | Clinical blue `#2563eb` | Eqova navy `#0C3C54` + gold `#F4AC3C` |

There is no slot picker, no Calendar invite and no `?skipquiz=1` variant here — all
of that only existed to get a rep in front of a doctor.

## The look

Deliberately **not** the medicon design. Same flow, different room: medicon is a
light clinical page with a doctor illustration; this is a dark event-kiosk built for a
tablet on a stall.

| | Medicon | CPHI |
|---|---|---|
| Canvas | Light, white cards | Deep Eqova navy, glass panels, faint hexagon lattice, drifting capsules |
| Type | Inter throughout | Sora headlines, Inter body, JetBrains Mono for codes and labels |
| Landing | Copy + doctor illustration + how-it-works section | One screen: oversized headline + a slowly turning prize wheel |
| Progress | Numbered dot stepper | Four-segment level bar that fills gold |
| Quiz | Stacked options + side progress card | 2×2 answer tiles, result pips per question |
| Score | Trophy + number | Animated gold score ring |
| Wheel | Plain wheel in a card | Wheel inside a ring of marquee bulbs that chase while it spins, controls beside it |
| Finish | Contact form, then thank-you card | No second form: straight to a plain "you won" card, saved in the background from the registration details |

Brand values are sampled from `public/images/eqova-logo.png`: navy `#0C3C54` is the
room, gold `#F4AC3C` is reserved for anything you press and anything you win, grey
`#9CA4A4` is the consolation slice. All tokens are in `:root` at the top of
`src/styles/index.css`.

Checked at 1024×768 (stall tablet, the whole wheel screen fits without scrolling)
and 390×844 (a visitor's phone), with no horizontal overflow at either — including
mid-spin, when the rotating wheel briefly reports a larger box.

## CI/CD

`.github/workflows/ci-cd.yml` runs on every push and pull request:

```
test    content checks → unit tests → build → browser tests (tablet + phone)
  │       uploads the exact build that passed
deploy  main only, and only if test passed:
          copy that build to /var/www/quiz on Lightsail
          → check quiz.eqova.in now serves it, and medicon.eqova.in still answers 200
```

A pull request gets the full test run but is never deployed. A failing test on
`main` stops the deploy, so the live site keeps the last good version.

| Command | What it checks |
|---|---|
| `npm run check` | every question has 4 options and a valid answer; the Sheet seed TSV matches `questions.json`; the Apps Script parses; **no real spreadsheet IDs are committed** (this repo is public); `apiEndpoint` is an Apps Script URL |
| `npm test` | the wheel never lands on an out-of-stock or withdrawn prize and follows the weights; phone handling; and the **real Apps Script** run against a fake Sheet — one row per visitor, digits-only phones, one prize per mobile, optional email, formula-safe text, the header-less-tab repair |
| `npm run test:e2e` | the full visitor journey in Chromium at 1024×768 and 390×844, with the Apps Script faked so tests never write to the live Sheet |
| `npm run ci` | all of the above, in order |

Browser tests locally: run `npm run build` first, and set `PW_CHANNEL=msedge` (or
`chrome`) to use an installed browser instead of downloading Playwright's.

The deploy target is fixed in the workflow, not a secret: the server also hosts
medicon, and the copy deletes anything not in the build. Secrets needed:
`SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USERNAME`.

## Setup

```bash
npm install
npm run dev
```

The app runs on the bundled question bank (`src/data/questions.json`, 51 questions)
with no backend at all — enough to work on the quiz itself. The **wheel needs the
backend**: prizes only ever come from the Sheet, never from bundled defaults, because
a prize nobody can record is a prize nobody can hand over.

To wire up the backend, follow the setup block at the top of
`google-apps-script-cphi.gs`, then paste the Web App URL into
`src/config.js` → `apiEndpoint`.

## The Google Sheets

This app shares the doctor app's two spreadsheets and adds one tab to each. It never
reads or writes the doctor app's own tabs.

```
CONTENT sheet                      DATA sheet
├── Specialties     ← docquiz      ├── Bookings        ← docquiz
├── Questions       ← docquiz      ├── Availability    ← docquiz
└── QuestionsCPHI   ← THIS APP     ├── Blackouts       ← docquiz
                                   ├── Gifts           ← SHARED
                                   ├── Settings        ← SHARED
                                   └── CphiEntries     ← THIS APP
```

**`QuestionsCPHI`** — `id | question | option1 | option2 | option3 | option4 | answer`,
where `answer` is the 0-based index (0–3) of the correct option. Paste
`sheet-seed-QuestionsCPHI.tsv` straight in; it is the 51 questions from
*quiz question cphi.docx*, with the correct answers taken from the orange
highlighting in that document.

**`CphiEntries`** — created for you by `setupSheets`. One row per visitor, upgraded
in place across the three writes (`registered` → `prize-claimed` → `entered`) rather
than one row per step.

**`Gifts` is shared with the doctor app**, so a limited prize runs down across *both*
campaigns — one physical box of prizes, one stock count. If the two should have
independent prizes, copy the tab to `GiftsCPHI` and change `GIFTS_TAB` in the script.

**`Settings` is shared too.** `setupSheets` adds two rows to it and touches nothing
else:

| Key | What it does |
|---|---|
| `cphiEventName` | Event name in emails and the header tag. Defaults to `CPHI`. |
| `cphiPabblyWebhook` | Optional. Pabbly Connect webhook for a WhatsApp confirmation. Leave blank to skip WhatsApp entirely. |

It is a **separate key** from the doctor app's `pabblyWebhook`, so the two campaigns
can point at different workflows, or this one at none.

## Editing questions without a redeploy

Edit the `QuestionsCPHI` tab. Changes show up within 5 minutes (the script's cache
TTL), or immediately if you run `clearCaches` from the Apps Script editor.

A malformed row — blank question, a missing option, an `answer` outside 0–3 — is
skipped with a warning in the execution log rather than being served as a question
that can never be answered correctly.

## After editing the Apps Script

**Saving the file does not change what the live URL runs.** An `/exec` URL serves the
version pinned when it was deployed. After any edit:

> Deploy ▸ Manage deployments ▸ (pencil) ▸ Version: **New version** ▸ Deploy

The URL stays the same. Skipping this is the single most common reason an Apps Script
change appears to do nothing.

## Email, and why it goes quiet

`MailApp` sends as whichever Google account holds the **live deployment** — not
necessarily whoever owns the script file — and there is no from-address override. To
send as a particular address, deploy from that account.

Gmail's quota is **~100 recipients/day on a free account, 1,500 on Workspace**. Each
entry sends one mail to the visitor plus one to `notifyEmail` if that Setting is
filled in, so leaving `notifyEmail` blank doubles how many entries a day you can mail.
Hitting the quota looks exactly like success from the visitor's side, which is why
`submitEntry` logs the failure *and the remaining quota* when a send throws — check
the Apps Script **Executions** view if mail stops arriving.

Two deliberate differences from the doctor app's script, both fixing ways it went
silently quiet:

- A **repeat submit** (same phone or email, already entered) still re-sends the
  confirmation and returns the original reference. The doctor app returns early and
  sends nothing, which is why someone replaying the quiz saw a success screen and
  never got an email.
- The **Pabbly response code is checked**. A paused workflow or an exhausted task
  quota answers with a non-2xx; swallowing that is how WhatsApp messages stop
  arriving with nothing in the logs to explain it. A missing webhook setting is
  logged too, rather than returning silently.

## The phone column is plain text on purpose

Google Sheets parses any cell beginning with `+`, `=`, `-` or `@` as a formula. The
app sends phone numbers as `+91 9876543210`, so writing that straight into a cell
lands a **broken formula** there: the cell reads `#ERROR!`, and the row becomes
invisible to `findEntry` — every later step then appends a new row instead of
upgrading the existing one, and the one-prize-per-mobile check silently passes
everybody.

Three things guard against it:

- `sheetPhone()` stores the digits alone (`919876543210`), which can never be read
  as a formula and is exactly the form the matching compares against.
- `setupSheets` forces the phone column to plain text **every time it runs**, not
  just when it creates the tab — a tab someone made by hand is covered too.
- `phoneDigitsFromSheet()` falls back to the cell's formula text, so rows written
  before this was fixed are still recoverable.

If you have broken rows, run **`repairEntryPhones`** once from the editor. It
rewrites recoverable cells as plain digits and leaves anything already correct
alone, so it is safe to re-run.

Matching is on the **last 10 digits**, so `+91 98765 43210`, `9876543210` and
`09876543210` are all recognised as the same person.

## Prize rules

- **One prize per mobile number**, enforced server-side in `claimGift` under a script
  lock — not in the browser, so a second device or a cleared cache does not get a
  second spin.
- Stock is debited the instant the wheel settles, not when the visitor confirms their
  details, or a limited prize could go out more times than it has units.
- Out-of-stock and withdrawn prizes keep their slice on the wheel (so it does not
  visibly shrink mid-event) but can never be landed on.
- **At least 2 of 3 correct answers** are needed to unlock a spin (`minCorrectToSpin` in `src/config.js`).

## Project layout

```
src/
├── config.js              brand, questions per quiz, the one endpoint
├── context/FlowContext    step machine, question bank, prize pool, score
├── pages/                 one file per step of the flow
├── components/
│   ├── Backdrop.jsx       glow, hexagon lattice, drifting capsules
│   ├── ProgressRail.jsx   the four-segment level bar
│   └── SpinWheel.jsx      the wheel (GiftPage wraps it in marquee bulbs)
├── utils/api.js           every call to the Apps Script
├── data/questions.json    bundled fallback bank (51 questions)
└── styles/index.css       the whole look; tokens in :root

google-apps-script-cphi.gs        the whole backend
sheet-seed-QuestionsCPHI.tsv      paste into the QuestionsCPHI tab
```
