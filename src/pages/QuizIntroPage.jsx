import { motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { CONFIG } from '../config.js'

export default function QuizIntroPage() {
  const { setStep, visitor, buildQuiz, bank } = useFlow()
  const reduced = useReducedMotion()
  const firstName = visitor.name.split(' ')[0]

  const STATS = [
    { value: CONFIG.questionsPerQuiz, label: 'questions', note: `random from ${bank.length}` },
    { value: 4, label: 'options each', note: 'one is right' },
    { value: 1, label: 'right answer', note: 'unlocks the wheel' },
  ]

  function start() {
    buildQuiz()
    setStep(STEPS.QUIZ)
  }

  return (
    <div className="panel panel--narrow panel--center">
      <header className="panel__head">
        <span className="kicker">Step 02</span>
        <h2 className="panel__title">
          {firstName ? `Ready, ${firstName}?` : 'Ready?'}
        </h2>
        <p className="panel__sub">
          No timer and no negative marking. You'll see whether you got it right straight after each answer.
        </p>
      </header>

      <ul className="stats">
        {STATS.map((s, i) => (
          <motion.li
            key={s.label}
            className="stats__item"
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 0.1 + i * 0.08, duration: 0.5 }}
          >
            <span className="stats__value">{s.value}</span>
            <span className="stats__label">{s.label}</span>
            <span className="stats__note">{s.note}</span>
          </motion.li>
        ))}
      </ul>

      <div className="actions">
        <button className="btn btn--ghost" onClick={() => setStep(STEPS.REGISTER)}>Back</button>
        <button className="btn btn--gold" onClick={start}>
          Start the quiz <span className="btn__arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}
