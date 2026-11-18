# Eqova Medicare — CPHI Quiz

A stall quiz for CPHI: three random pharma questions, a prize wheel, done in under
a minute. Built from the same bones as the doctor app in `D:\docquiz`, but this is
a **separate project with its own deployment** — nothing here changes that one.

```
Landing → Register → Quiz intro → 3 questions → Score → 🎡 Spin → Confirm details → Thank you
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

## The theme

Both brand values are sampled from `public/images/eqova-logo.png`:

- **navy `#0C3C54`** — the *eqova* wordmark. Carries every primary action, heading
  and the header rule.
- **gold `#F4AC3C`** — the cross device. Used as an accent only: progress bars,
  completed stepper dots, the score card, the wheel hub. Never a whole button, so
  it keeps its punch.
- **grey `#9CA4A4`** — the logo's grey, used for the consolation wheel slice.

The palette lives in `:root` in `src/styles/index.css`. The accent decisions are in
one clearly marked block at the **bottom** of that file, so they override the base
rules without those having to be rewritten — delete that block and you are back to a
plain navy theme.

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

## Prize rules

- **One prize per mobile number**, enforced server-side in `claimGift` under a script
  lock — not in the browser, so a second device or a cleared cache does not get a
  second spin.
- Stock is debited the instant the wheel settles, not when the visitor confirms their
  details, or a limited prize could go out more times than it has units.
- Out-of-stock and withdrawn prizes keep their slice on the wheel (so it does not
  visibly shrink mid-event) but can never be landed on.
- A score of **0 does not unlock a spin** — at least one correct answer is needed.

## Project layout

```
src/
├── config.js              brand, questions per quiz, the one endpoint
├── context/FlowContext    step machine, question bank, prize pool, score
├── pages/                 one file per step of the flow
├── components/
│   ├── SpinWheel.jsx      the wheel, painted in brand navy/gold
│   └── Stepper.jsx        the four phases
├── utils/api.js           every call to the Apps Script
├── data/questions.json    bundled fallback bank (51 questions)
└── styles/index.css       palette in :root, brand accents at the bottom

google-apps-script-cphi.gs        the whole backend
sheet-seed-QuestionsCPHI.tsv      paste into the QuestionsCPHI tab
```
