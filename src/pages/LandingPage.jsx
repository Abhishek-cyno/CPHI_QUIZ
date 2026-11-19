import { motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { CONFIG } from '../config.js'

const RULES = [
  { value: String(CONFIG.questionsPerQuiz), label: 'Questions', note: 'drawn at random' },
  { value: 'No', label: 'Time limit', note: 'play at your pace' },
  { value: '1', label: 'Spin', note: 'to win a prize' },
]

const EASE = [0.16, 1, 0.3, 1]

export default function LandingPage() {
  const { setStep } = useFlow()
  const reduced = useReducedMotion()

  const rise = (delay) => ({
    initial: { opacity: 0, y: reduced ? 0 : 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay: reduced ? 0 : delay, ease: EASE },
  })

  return (
    <section className="hero">
      <div className="hero__copy">
        <motion.span className="eyebrow" {...rise(0.05)}>
          {CONFIG.brandName} · {CONFIG.eventName} Quiz
        </motion.span>

        <motion.h1 className="hero__title" {...rise(0.12)}>
          Think you know
          <br />
          <span className="hero__accent">
            pharma?
            <svg className="hero__underline" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 13 C 70 4, 150 4, 297 10" />
            </svg>
          </span>
        </motion.h1>

        <motion.p className="hero__lede" {...rise(0.2)}>
          Answer three pharma questions at your own pace. Get even one right
          and you spin the wheel for a prize.
        </motion.p>

        <motion.div className="hero__actions" {...rise(0.28)}>
          <motion.button
            type="button"
            className="btn btn--gold btn--xl"
            onClick={() => setStep(STEPS.REGISTER)}
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
          >
            Play now
            <span className="btn__arrow" aria-hidden="true">→</span>
          </motion.button>
        </motion.div>

        <motion.ul className="rules" {...rise(0.36)}>
          {RULES.map((r) => (
            <li key={r.label} className="rules__item">
              <span className="rules__value">{r.value}</span>
              <span className="rules__label">{r.label}</span>
              <span className="rules__note">{r.note}</span>
            </li>
          ))}
        </motion.ul>
      </div>

      <TeaserWheel reduced={reduced} />
    </section>
  )
}

/* A decorative wheel that turns slowly behind the headline on wide screens
   — a promise of what's at the end, drawn in the same navy/gold as the real
   one. Not interactive and not the real prize list; just the shape. */
const TEASER_SLICES = 12
const TEASER_COLORS = ['#f4ac3c', '#114f6e', '#ffc768', '#0b3349', '#e8eef2', '#1a6b93']

function TeaserWheel({ reduced }) {
  const C = 100
  const R = 92
  const step = 360 / TEASER_SLICES

  const wedge = (i) => {
    const a0 = (i * step - 90) * (Math.PI / 180)
    const a1 = ((i + 1) * step - 90) * (Math.PI / 180)
    return `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`
  }

  return (
    <motion.div
      className="teaser"
      aria-hidden="true"
      initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: reduced ? 0 : 0.2, ease: EASE }}
    >
      <span className="teaser__halo" />
      <motion.svg
        className="teaser__disc"
        viewBox="0 0 200 200"
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      >
        {Array.from({ length: TEASER_SLICES }).map((_, i) => (
          <path key={i} d={wedge(i)} fill={TEASER_COLORS[i % TEASER_COLORS.length]} stroke="#04141e" strokeWidth="1.2" />
        ))}
        <circle cx={C} cy={C} r={R} fill="none" stroke="#f4ac3c" strokeWidth="3" />
      </motion.svg>
      <span className="teaser__hub">?</span>
      <span className="teaser__pointer" />
    </motion.div>
  )
}
