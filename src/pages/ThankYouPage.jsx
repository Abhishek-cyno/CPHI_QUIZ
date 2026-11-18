import { motion, useReducedMotion } from 'framer-motion'
import { useFlow } from '../context/FlowContext.jsx'
import { CONFIG } from '../config.js'

/**
 * End of the flow. ContactPage already made the authoritative write, so
 * there is nothing to save here — this screen exists to show the entry
 * reference, styled as a ticket because that is literally what it is: the
 * thing the visitor shows at the stall to collect their prize.
 */
export default function ThankYouPage() {
  const { visitor, gift, entry, score, questions, reset } = useFlow()
  const reduced = useReducedMotion()
  const isDud = gift?.tier === 'consolation'

  return (
    <div className="finale">
      <motion.article
        className="ticket"
        initial={{ opacity: 0, y: reduced ? 0 : 40, rotate: reduced ? 0 : -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        aria-label="Your prize ticket"
      >
        <div className="ticket__main">
          <div className="ticket__brand">
            <span>{CONFIG.brandName}</span>
            <span>{CONFIG.eventName} Quiz</span>
          </div>

          {gift && (
            <div className="ticket__prize">
              <span className="ticket__emoji" aria-hidden="true">{gift.emoji}</span>
              <span>
                <span className="ticket__label">{isDud ? 'Result' : 'Prize'}</span>
                <span className="ticket__title">{gift.title}</span>
              </span>
            </div>
          )}

          <dl className="ticket__meta">
            <div>
              <dt>Name</dt>
              <dd>{visitor.name || '—'}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{score}/{questions.length}</dd>
            </div>
          </dl>
        </div>

        <div className="ticket__stub">
          <span className="ticket__label">Reference</span>
          <span className="ticket__ref">{entry.ref || '—'}</span>
          <span className="ticket__hint">
            {isDud ? 'Thanks for playing!' : 'Show this at the Eqova stall'}
          </span>
        </div>
      </motion.article>

      <p className="finale__note">
        A copy is on its way to <strong>{entry.email || visitor.email}</strong>.
      </p>

      <button className="btn btn--gold btn--xl" onClick={reset}>
        Done — next player <span className="btn__arrow" aria-hidden="true">↻</span>
      </button>
    </div>
  )
}
