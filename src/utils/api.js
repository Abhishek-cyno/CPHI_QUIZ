import { CONFIG } from '../config.js'

/**
 * Client for the CPHI Apps Script (google-apps-script-cphi.gs).
 *
 * Note the deliberate `text/plain` content type on every POST. A JSON
 * content type would make the browser fire a CORS preflight, which Apps
 * Script cannot answer — so the request would die before it ever ran.
 * text/plain keeps it a "simple request", and the script parses the body
 * as JSON regardless. That is also why we can actually READ the response
 * here, which matters: the response is how we learn that a prize was
 * already claimed or has just run out.
 */

function get(action, params = {}) {
  const query = new URLSearchParams({ action, ...params, _: Date.now() })
  return fetch(`${CONFIG.apiEndpoint}?${query}`, { cache: 'no-store' })
}

function post(body) {
  return fetch(CONFIG.apiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  })
}

/**
 * The question bank, from the Sheet's QuestionsCPHI tab. Edit the tab and
 * every visitor gets the new questions within the script's cache TTL — no
 * redeploy. Falls back to the bundled copy in src/data/questions.json if
 * the endpoint is unset, unreachable, or returns something unexpected, so
 * a Sheet problem can never block the quiz.
 */
export async function fetchQuestions() {
  if (!CONFIG.apiEndpoint) return { questions: [], source: 'bundled' }

  try {
    const res = await get('questions')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.ok || !Array.isArray(data.questions) || !data.questions.length) {
      throw new Error('Unexpected response shape')
    }
    return { questions: data.questions, source: 'remote' }
  } catch (e) {
    console.warn('Falling back to the bundled question bank:', e)
    return { questions: [], source: 'bundled' }
  }
}

const EMPTY_GIFTS = { superpremium: [], premium: [], standard: [], consolation: [] }

// premium and standard stay mandatory: an empty one of those means the
// wheel has nothing real on it. superpremium/consolation are optional
// tiers — a sheet that hasn't added them yet still has a working wheel,
// just without a jackpot or a no-win slice.
function isValidGifts(g) {
  return g && Array.isArray(g.premium) && g.premium.length > 0 &&
    Array.isArray(g.standard) && g.standard.length > 0
}

/**
 * The prize catalog, from the Sheet's Gifts tab — shared with the doctor
 * app, so stock runs down across both. No bundled fallback on purpose: an
 * unreachable endpoint leaves the wheel empty rather than quietly serving
 * stale hard-coded prizes that nobody can actually hand over.
 */
export async function fetchGifts() {
  if (!CONFIG.apiEndpoint) {
    console.error('Cannot load gifts: apiEndpoint is not configured.')
    return EMPTY_GIFTS
  }

  try {
    const res = await get('gifts')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.ok || !isValidGifts(data.gifts)) throw new Error('Unexpected response shape')
    return {
      superpremium: data.gifts.superpremium || [],
      premium: data.gifts.premium,
      standard: data.gifts.standard,
      consolation: data.gifts.consolation || [],
    }
  } catch (e) {
    console.error('Could not load gifts from the sheet:', e)
    return EMPTY_GIFTS
  }
}

// Started at registration so the answer is usually ready by the time the
// gift page mounts. Consumed once, so a retry always hits the server fresh.
const prefetched = new Map()

export function prefetchEligibility(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 10) return
  prefetched.set(digits, requestEligibility(digits))
}

/**
 * Whether this mobile number may still spin. The Sheet is the shared
 * source of truth, so this also catches someone coming back on a
 * different phone or browser to try for a second prize.
 */
export function checkEligibility(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  const pending = prefetched.get(digits)
  if (pending) {
    prefetched.delete(digits)
    return pending
  }
  return requestEligibility(phone)
}

async function requestEligibility(phone) {
  if (!CONFIG.apiEndpoint) {
    return { ok: false, reason: 'config', error: 'Prize validation is not configured.' }
  }

  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 10) {
    return { ok: false, reason: 'invalid', error: 'Please enter a valid mobile number.' }
  }

  try {
    const res = await get('eligibility', { phone: digits })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.warn('Could not validate prize eligibility', e)
    return {
      ok: false,
      reason: 'network',
      error: "We couldn't validate prize eligibility. Please check your connection and try again.",
    }
  }
}

/**
 * Saves name/mobile/email the instant the registration form is submitted —
 * before the quiz even starts — so the Sheet has a row for this visitor
 * from the very first step. Every later write for this phone number
 * (claimGift, submitEntry) finds that same row and upgrades it in place
 * rather than adding another.
 *
 * Best-effort: a network hiccup here shouldn't hold up the quiz, it just
 * means the row starts later, at whichever step first succeeds.
 */
export async function registerVisitor(visitor) {
  if (!CONFIG.apiEndpoint) return { ok: false, reason: 'config' }

  try {
    const res = await post({
      action: 'register',
      name: visitor?.name || '',
      phone: visitor?.mobile || '',
      email: visitor?.email || '',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.warn('Could not save registration details', e)
    return { ok: false, reason: 'network' }
  }
}

/**
 * Spends one unit of a prize's stock the moment the wheel lands on it (see
 * GiftPage.jsx) — this is what lets a limited prize actually run out across
 * everyone spinning, not just this one browser tab.
 */
export async function claimGift(giftId, visitor) {
  if (!CONFIG.apiEndpoint || !giftId) return { ok: false }

  try {
    const res = await post({
      action: 'claimGift',
      id: giftId,
      name: visitor?.name || '',
      phone: visitor?.mobile || '',
      email: visitor?.email || '',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.warn('Could not record prize claim', e)
    return { ok: false, reason: 'network' }
  }
}

/**
 * The final write: contact details, quiz result and the prize won, all onto
 * the one row this visitor has had since registration. Resolves with the
 * server's verdict rather than throwing — `alreadyEntered` is an expected
 * outcome, not an error.
 */
export async function submitEntry(payload) {
  if (!CONFIG.apiEndpoint) {
    return { ok: false, reason: 'config', error: 'The entry service is not configured.' }
  }

  try {
    const res = await post({ action: 'submit', ...payload })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.warn('Submitting entry failed', e)
    return {
      ok: false,
      reason: 'network',
      error: "We couldn't reach the server. Please check your connection and try again.",
    }
  }
}
