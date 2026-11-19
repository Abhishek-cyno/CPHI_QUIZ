import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { pickRandom } from '../utils/shuffle.js'
import { fetchQuestions, fetchGifts } from '../utils/api.js'
import { capitalizeName } from '../utils/formatName.js'
import { CONFIG } from '../config.js'
import bundledQuestions from '../data/questions.json'

const FlowContext = createContext(null)

const EMPTY_VISITOR = { name: '', mobile: '', email: '', organization: '', designation: '' }
const EMPTY_ENTRY = { ref: '', email: '', phone: '' }
const EMPTY_GIFTS = { superpremium: [], premium: [], standard: [], consolation: [] }

// Apps Script can take 5–30s to answer a cold request, so the last good copy
// of each sheet is kept on the device and shown instantly while a fresh copy
// loads in the background.
const QUESTIONS_CACHE_KEY = 'cphiquiz_questions_v1'
const GIFTS_CACHE_KEY = 'cphiquiz_gifts_v1'

function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked — the app still works, just without the cache.
  }
}

function hasGifts(g) {
  return !!(g && g.premium?.length && g.standard?.length)
}

function hasQuestions(q) {
  return Array.isArray(q) && q.length > 0
}

export const STEPS = {
  LANDING: 'landing',
  REGISTER: 'register',
  QUIZINTRO: 'quizintro',
  QUIZ: 'quiz',
  COMPLETE: 'complete',
  GIFT: 'gift',
  THANKYOU: 'thankyou',
}

export function FlowProvider({ children }) {
  const [step, setStep] = useState(STEPS.LANDING)
  const [visitorRaw, setVisitorRaw] = useState(EMPTY_VISITOR)
  // Single choke point for the visitor's name, so every screen that greets
  // them shows it capitalised without each one having to remember to.
  const setVisitor = useCallback(
    (next) => setVisitorRaw({ ...next, name: capitalizeName(next.name).trim() }),
    []
  )

  const [questions, setQuestions] = useState([]) // the 3 picked for this run
  const [answers, setAnswers] = useState([])     // { questionId, question, chosen, correct }
  const [gift, setGift] = useState(null)
  // Filled in by the result page once the server confirms the entry — `ref` is
  // what the visitor quotes when collecting their prize.
  const [entry, setEntry] = useState(EMPTY_ENTRY)

  // The question bank lives in the Sheet's QuestionsCPHI tab so it can be
  // edited without a redeploy (see utils/api.js). The bundled JSON is the
  // floor underneath it, used until the fetch lands and if it never does —
  // which means the quiz is playable from the very first paint.
  const [bank, setBank] = useState(() => readCache(QUESTIONS_CACHE_KEY) || bundledQuestions)

  // Prize wheel catalog — Sheet only, no bundled copy. See fetchGifts.
  const [cachedGifts] = useState(() => {
    const g = readCache(GIFTS_CACHE_KEY)
    return hasGifts(g) ? g : null
  })
  const [gifts, setGifts] = useState(cachedGifts || EMPTY_GIFTS)
  const [giftsLoading, setGiftsLoading] = useState(!cachedGifts)

  // A failed fetch comes back empty; never let that wipe out a good copy.
  const applyGifts = useCallback((giftData) => {
    if (hasGifts(giftData)) {
      setGifts(giftData)
      writeCache(GIFTS_CACHE_KEY, giftData)
    }
    setGiftsLoading(false)
  }, [])

  const reloadGifts = useCallback(async () => {
    const giftData = await fetchGifts()
    applyGifts(giftData)
    return giftData
  }, [applyGifts])

  // The two sheets load independently so the faster one isn't held back by
  // the slower, and neither blocks the landing page.
  useEffect(() => {
    let active = true

    fetchQuestions().then(({ questions: remote, source }) => {
      if (!active || source !== 'remote' || !hasQuestions(remote)) return
      setBank(remote)
      writeCache(QUESTIONS_CACHE_KEY, remote)
    })

    fetchGifts().then((giftData) => {
      if (active) applyGifts(giftData)
    })

    return () => { active = false }
  }, [applyGifts])

  // Build the randomised quiz for this visitor. Every visitor draws from
  // the same single bank — there are no specialties or categories here,
  // so the only thing that differs between two people is the draw.
  const buildQuiz = useCallback(() => {
    setQuestions(pickRandom(bank, CONFIG.questionsPerQuiz))
    setAnswers([])
  }, [bank])

  const recordAnswer = useCallback((entryRow) => {
    setAnswers((prev) => [...prev, entryRow])
  }, [])

  const score = useMemo(() => answers.filter((a) => a.correct).length, [answers])

  // One pool for everyone: there is no clinic-owner split in this campaign,
  // so every tier on the wheel is on offer to every visitor.
  const giftWheel = useMemo(
    () => [...gifts.superpremium, ...gifts.premium, ...gifts.standard, ...gifts.consolation],
    [gifts]
  )

  // stock === 0 means out of stock, and active === false means withdrawn.
  // Either way the prize keeps its slice on `giftWheel` above (so the wheel
  // doesn't visibly shrink mid-event) but must never be the one the wheel
  // actually lands on — see pickWinnerIndex in utils/wheel.js, which only
  // ever picks among `winnableGifts`. The server enforces the same rule in
  // claimGift, which is the one that counts.
  const winnableGifts = useMemo(
    () => giftWheel.filter((g) => g.active !== false && g.stock !== 0),
    [giftWheel]
  )

  const reset = useCallback(() => {
    setStep(STEPS.LANDING)
    setVisitorRaw(EMPTY_VISITOR)
    setQuestions([])
    setAnswers([])
    setGift(null)
    setEntry(EMPTY_ENTRY)
  }, [])

  const value = {
    step, setStep,
    visitor: visitorRaw, setVisitor,
    bank,
    questions, buildQuiz,
    answers, recordAnswer,
    score,
    gift, setGift,
    gifts, giftWheel, winnableGifts, giftsLoading, reloadGifts,
    entry, setEntry,
    reset,
  }

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow() {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow must be used inside FlowProvider')
  return ctx
}
