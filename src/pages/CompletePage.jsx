import { motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'

const SIZE = 180
const STROKE = 12
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function CompletePage() {
  const { score, questions, visitor, setStep } = useFlow()
  const reduced = useReducedMotion()
  const total = questions.length
  const ratio = total ? score / total : 0
  const firstName = visitor.name.split(' ')[0]

  const headline =
    ratio === 1 ? 'Perfect score!' :
    ratio >= 0.67 ? 'Nicely done!' :
    'You unlocked a spin!'

  return (
    <div className="panel panel--narrow panel--center">
      <span className="kicker">Your score</span>

      <div className="score">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle className="score__track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
          <motion.circle
            className="score__arc"
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - ratio) }}
            transition={{ duration: reduced ? 0 : 1.2, delay: reduced ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <span className="score__value">
          {score}<small>/{total}</small>
        </span>
      </div>

      <h2 className="panel__title">{headline}</h2>
      <p className="panel__sub">
        {firstName ? `${firstName}, you` : 'You'} got {score} of {total} right. That's enough to spin the prize wheel.
      </p>

      <div className="actions actions--single">
        <button className="btn btn--gold btn--xl" onClick={() => setStep(STEPS.GIFT)}>
          Spin the wheel <span className="btn__arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}
