import { motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { CONFIG } from '../config.js'

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

        <motion.div className="hero__actions" {...rise(0.28)}>
          <motion.button
            type="button"
            className="btn btn--gold btn--xl"
            onClick={() => setStep(STEPS.REGISTER)}
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
          >
            Test your knowledge
            <span className="btn__arrow" aria-hidden="true">→</span>
          </motion.button>
        </motion.div>
      </div>

      <TeaserBulb reduced={reduced} />
    </section>
  )
}

/* A decorative light bulb beside the headline — the "bright idea" of the
   quiz, drawn in the same navy and gold as the rest of the app. It glows
   gently; it is not interactive. */
function TeaserBulb({ reduced }) {
  return (
    <motion.div
      className="teaser"
      aria-hidden="true"
      initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: reduced ? 0 : 0.2, ease: EASE }}
    >
      <motion.span
        className="teaser__halo"
        animate={reduced ? undefined : { opacity: [0.65, 1, 0.65], scale: [0.96, 1.04, 0.96] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <svg className="teaser__bulb" viewBox="0 0 200 200">
        <defs>
          <radialGradient id="bulb-glass" cx="42%" cy="36%" r="70%">
            <stop offset="0%" stopColor="#fff4d6" />
            <stop offset="45%" stopColor="#ffc768" />
            <stop offset="100%" stopColor="#f4ac3c" />
          </radialGradient>
        </defs>
        {/* rays */}
        <g stroke="#ffc768" strokeWidth="5" strokeLinecap="round" opacity="0.85">
          <line x1="100" y1="6" x2="100" y2="22" />
          <line x1="36" y1="30" x2="47" y2="41" />
          <line x1="164" y1="30" x2="153" y2="41" />
          <line x1="10" y1="88" x2="26" y2="88" />
          <line x1="190" y1="88" x2="174" y2="88" />
        </g>
        {/* glass */}
        <path
          d="M100 30 C 66 30 44 55 44 86 C 44 106 54 120 66 132 C 72 138 75 145 75 152 L 125 152 C 125 145 128 138 134 132 C 146 120 156 106 156 86 C 156 55 134 30 100 30 Z"
          fill="url(#bulb-glass)"
          stroke="#04141e"
          strokeWidth="3"
        />
        {/* filament */}
        <path d="M86 150 L 86 112 L 94 100 L 100 112 L 106 100 L 114 112 L 114 150" fill="none" stroke="#114f6e" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {/* shine */}
        <path d="M70 70 C 74 56 84 48 96 46" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
        {/* base */}
        <rect x="74" y="152" width="52" height="12" rx="4" fill="#1a6b93" stroke="#04141e" strokeWidth="2" />
        <rect x="76" y="164" width="48" height="12" rx="4" fill="#114f6e" stroke="#04141e" strokeWidth="2" />
        <rect x="80" y="176" width="40" height="10" rx="4" fill="#0b3349" stroke="#04141e" strokeWidth="2" />
        <path d="M90 186 L 110 186 L 104 194 L 96 194 Z" fill="#0b3349" stroke="#04141e" strokeWidth="2" />
      </svg>
    </motion.div>
  )
}
