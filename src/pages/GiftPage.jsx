import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import SpinWheel from '../components/SpinWheel.jsx'
import LoadingOverlay from '../components/motion/LoadingOverlay.jsx'
import { checkEligibility, claimGift } from '../utils/api.js'
import { CONFIG } from '../config.js'

/**
 * Owns the eligibility check so the loading overlay can stay mounted across
 * the checking -> result switch — that's what lets it finish at 100% and fade
 * out, instead of vanishing the instant the screen underneath changes.
 */
export default function GiftPage() {
  const { score, visitor, giftsLoading } = useFlow()
  const [eligibility, setEligibility] = useState({ status: 'checking', error: '' })
  const [eligibilityRetry, setEligibilityRetry] = useState(0)

  useEffect(() => {
    let active = true
    checkEligibility(visitor.mobile).then((result) => {
      if (!active) return
      if (result.ok) {
        setEligibility({ status: result.eligible ? 'eligible' : 'already-won', error: '' })
      } else {
        setEligibility({ status: 'error', error: result.error || 'We could not validate prize eligibility.' })
      }
    })
    return () => { active = false }
  }, [visitor.mobile, eligibilityRetry])

  // Too low a score never reaches the wheel, so there is nothing to check for.
  const checking = score >= CONFIG.minCorrectToSpin && (eligibility.status === 'checking' || giftsLoading)

  function retry() {
    setEligibility({ status: 'checking', error: '' })
    setEligibilityRetry((count) => count + 1)
  }

  return (
    <>
      <LoadingOverlay show={checking} />
      <GiftScreen eligibility={eligibility} onRetry={retry} checking={checking} />
    </>
  )
}

/** The three ways the wheel can be withheld, in one consistent shape. */
function Notice({ icon, title, children, action }) {
  // One button is centred on its own; two sit side by side.
  const single = !Array.isArray(action)
  return (
    <div className="panel panel--narrow panel--center">
      <span className="notice__icon" aria-hidden="true">{icon}</span>
      <h2 className="panel__title">{title}</h2>
      <p className="panel__sub">{children}</p>
      <div className={`actions ${single ? 'actions--single' : ''}`}>{action}</div>
    </div>
  )
}

function GiftScreen({ eligibility, onRetry, checking }) {
  const { score, gift, setGift, setStep, giftWheel, winnableGifts, reloadGifts, visitor, buildQuiz, reset } = useFlow()
  const [spinning, setSpinning] = useState(false)
  const [claimError, setClaimError] = useState('')
  const claimRef = useRef(null)

  if (score < CONFIG.minCorrectToSpin) {
    return (
      <Notice
        icon="🔒"
        title="So close!"
        action={[
          <button key="leave" className="btn btn--ghost" onClick={reset}>Leave</button>,
          <button
            key="retry"
            className="btn btn--gold"
            onClick={() => { buildQuiz(); setStep(STEPS.QUIZ) }}
          >
            Try again <span className="btn__arrow" aria-hidden="true">→</span>
          </button>,
        ]}
      >
        You need at least two right answers to unlock the prizes. Do you want to try again?
      </Notice>
    )
  }

  // The loading overlay (see GiftPage) covers the screen while this runs.
  if (checking) return null

  if (eligibility.status === 'already-won') {
    return (
      <Notice
        icon="🎟️"
        title="You've already won"
        action={<button className="btn btn--gold" onClick={() => setStep(STEPS.LANDING)}>Back to start</button>}
      >
        This mobile number has already claimed a prize. Thanks for playing again — it's one prize per person.
      </Notice>
    )
  }

  if (eligibility.status === 'error') {
    return (
      <Notice
        icon="📡"
        title="Couldn't reach the prize desk"
        action={<button className="btn btn--gold" onClick={onRetry}>Try again</button>}
      >
        {eligibility.error}
      </Notice>
    )
  }

  // The claim is fired as the wheel starts turning, so the server round-trip
  // overlaps the spin animation instead of starting after it.
  function onSpinStart(target) {
    setClaimError('')
    setSpinning(true)
    claimRef.current = claimGift(target.id, visitor)
  }

  async function onResult(won) {
    // The Sheet is the source of truth. Do not announce a win until its
    // locked claim endpoint has reserved stock for this exact prize.
    const claim = await (claimRef.current || claimGift(won.id, visitor))
    claimRef.current = null
    setSpinning(false)
    if (claim.ok) {
      setGift(won)
      return
    }

    // Another spin may have claimed the final unit while this wheel was
    // animating. Refresh so exhausted rows drop out before the retry.
    await reloadGifts()
    setClaimError(
      claim.reason === 'outofstock'
        ? 'That prize was just claimed by someone else. The wheel has been refreshed — please spin again.'
        : 'We could not reserve that prize. Please check your connection and spin again.'
    )
  }

  const isSuper = gift?.tier === 'superpremium'
  const isConsolation = gift?.tier === 'consolation'

  return (
    <div className="panel spin">
      <div className="spin__wheel">
        <Marquee lit={spinning || !!gift}>
          {/* One pool for everyone — `winnable` only drops prizes that are
              out of stock or withdrawn. One spin per visitor: `disabled`
              stops a re-roll after stepping back from the next screen. */}
          <SpinWheel
            items={giftWheel}
            winnable={winnableGifts}
            spinning={spinning}
            disabled={!!gift}
            result={gift}
            onSpinStart={onSpinStart}
            onResult={onResult}
          />
        </Marquee>
      </div>

      {/* Text, result and buttons sit beside the wheel on wide screens so a
          768px-tall stall tablet never has to scroll to find Continue. */}
      <div className="spin__side">
        <header className="panel__head">
          <span className="kicker">Step 03</span>
          <h2 className="panel__title">
            {isSuper ? 'JACKPOT!' : isConsolation ? 'Unlucky this time' : gift ? 'You won!' : 'Spin to win'}
          </h2>
          <p className="panel__sub">
            {gift
              ? isConsolation
                ? 'The wheel didn’t land on a prize — thanks for playing!'
                : 'Tap Continue to claim it.'
              : spinning
              ? 'Round and round it goes…'
              : 'Tap SPIN in the middle of the wheel.'}
          </p>
        </header>

        <AnimatePresence>
          {gift && (
            <motion.div
              className={`prize ${isSuper ? 'prize--super' : ''} ${isConsolation ? 'prize--dud' : ''}`}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            >
              <span className="prize__emoji">{gift.emoji}</span>
              <span className="prize__text">
                <span className="prize__label">{isConsolation ? 'Result' : isSuper ? 'Jackpot prize' : 'Your prize'}</span>
                <span className="prize__title">{gift.title}</span>
                {gift.desc && <span className="prize__desc">{gift.desc}</span>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {claimError && <p className="alert alert--bad" role="alert">{claimError}</p>}

        <div className="actions">
          <button className="btn btn--ghost" onClick={() => setStep(STEPS.COMPLETE)} disabled={spinning}>
            Back
          </button>
          <button className="btn btn--gold" disabled={!gift || spinning} onClick={() => setStep(STEPS.THANKYOU)}>
            Continue <span className="btn__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* Game-show bulbs around the wheel. They idle with a slow alternating glow
   and chase faster while the wheel is spinning or has just paid out. */
const BULBS = 28

function Marquee({ lit, children }) {
  const reduced = useReducedMotion()
  return (
    <div className={`marquee ${lit && !reduced ? 'marquee--lit' : ''}`}>
      <div className="marquee__ring" aria-hidden="true">
        {Array.from({ length: BULBS }).map((_, i) => (
          <span
            key={i}
            className={`marquee__bulb ${i % 2 ? 'marquee__bulb--odd' : ''}`}
            style={{ transform: `rotate(${(i * 360) / BULBS}deg) translateY(calc(var(--marquee-r) * -1))` }}
          />
        ))}
      </div>
      <div className="marquee__wheel">{children}</div>
    </div>
  )
}
