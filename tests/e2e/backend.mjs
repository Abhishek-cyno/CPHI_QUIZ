// Stands in for the Apps Script web app during browser tests: every request
// to script.google.com is answered here, so nothing reaches the live Sheet.
// Returns the list of POST bodies the app sent, for assertions.
import { readFileSync } from 'node:fs'

export const QUESTIONS = JSON.parse(readFileSync(new URL('../../src/data/questions.json', import.meta.url), 'utf8'))
export const GIFTS = JSON.parse(readFileSync(new URL('../fixtures/gifts.json', import.meta.url), 'utf8'))
export const REF = 'CP-TEST01'

export async function fakeBackend(page, { eligible = true, failFirstSubmit = false } = {}) {
  const posts = []
  await page.route('**/script.google.com/**', async (route) => {
    const req = route.request()
    let body
    if (req.method() === 'GET') {
      const action = new URL(req.url()).searchParams.get('action')
      body =
        action === 'questions' ? { ok: true, questions: QUESTIONS }
        : action === 'gifts' ? { ok: true, gifts: GIFTS }
        : action === 'eligibility' ? { ok: true, eligible, ref: eligible ? '' : 'CP-OLD001' }
        : { ok: false, error: `Unknown action: ${action}` }
    } else {
      const data = JSON.parse(req.postData() || '{}')
      posts.push(data)
      const submits = posts.filter((p) => p.action === 'submit').length
      body = data.action === 'submit' && failFirstSubmit && submits === 1
        ? { ok: false, reason: 'busy', error: 'Server busy, please try again.' }
        : { ok: true, ref: REF }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    })
  })
  return posts
}
