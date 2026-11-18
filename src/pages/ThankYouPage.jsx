import { motion } from 'framer-motion'
import { useFlow } from '../context/FlowContext.jsx'
import Float from '../components/motion/Float.jsx'
import meetImg from '../assets/meet.png'

/**
 * End of the flow. ContactPage already made the authoritative write into
 * the Sheet, so there is nothing to save here — this screen exists to show
 * the entry reference, which is what the visitor quotes at the stall to
 * collect their prize.
 */
export default function ThankYouPage() {
  const { visitor, gift, entry, reset } = useFlow()

  return (
    <div className="scheduled">
      <div className="scheduled__art">
        <Float amplitude={6} duration={6.5}>
          <img className="art" src={meetImg} alt="" />
        </Float>
      </div>

      <div className="scheduled__main">
        <motion.div
          className="success-check"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 160, delay: 0.1 }}
        >
          ✓
        </motion.div>

        <h2 className="card__title">Thank You for Participating! 🎉</h2>
        <p className="card__sub">
          Thanks{visitor.name ? `, ${visitor.name}` : ''} — your entry has been recorded.
          Show the reference below at our stall to collect your prize.
        </p>

        {(gift || entry.ref) && (
          <motion.div
            className="booking-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {gift && (
              <div className="details__row">
                <span className="ico">{gift.emoji}</span>
                <span>{gift.tier === 'consolation' ? 'Result' : 'Your prize'}</span>
                <b style={{ marginLeft: 'auto' }}>{gift.title}</b>
              </div>
            )}
            {gift && gift.tier !== 'consolation' && (
              <div className="details__row">
                <span className="ico">🎪</span> <span>Collect at</span>
                <b style={{ marginLeft: 'auto' }}>The Eqova stall</b>
              </div>
            )}
            {entry.ref && (
              <div className="details__row">
                <span className="ico">#️⃣</span> <span>Reference</span>
                <b style={{ marginLeft: 'auto' }}>{entry.ref}</b>
              </div>
            )}
          </motion.div>
        )}

        <button className="btn btn--primary btn--lg" onClick={reset}>
          Go to Home
        </button>
      </div>
    </div>
  )
}
