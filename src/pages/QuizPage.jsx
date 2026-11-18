import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'

const LETTERS = ['A', 'B', 'C', 'D']

export default function QuizPage() {
  const { questions, recordAnswer, setStep } = useFlow()
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [locked, setLocked] = useState(false)
  // Tracked per answer, so the dots above the question can show each
  // result as it happens rather than only a running total.
  const [results, setResults] = useState([])

  const current = questions[index]
  if (!current) return null

  const total = questions.length
  const isLast = index + 1 === total
  const gotIt = selected === current.answer

  function choose(optionIndex) {
    if (locked) return
    const correct = optionIndex === current.answer
    setSelected(optionIndex)
    setLocked(true)
    setResults((prev) => [...prev, correct])
    recordAnswer({ questionId: current.id, question: current.q, chosen: optionIndex, correct })
  }

  function next() {
    if (!isLast) {
      setIndex(index + 1)
      setSelected(null)
      setLocked(false)
      return
    }
    // A score of zero goes straight to the gift screen's "try again" state
    // instead of celebrating a result there is nothing to spin for.
    setStep(results.some(Boolean) ? STEPS.COMPLETE : STEPS.GIFT)
  }

  function optionState(i) {
    if (!locked) return ''
    if (i === current.answer) return 'is-correct'
    if (i === selected) return 'is-wrong'
    return 'is-dim'
  }

  return (
    <div className="panel panel--wide quiz">
      <div className="quiz__top">
        <span className="kicker">
          Question {index + 1} <span className="kicker__of">/ {total}</span>
        </span>
        <ol className="pips" aria-label="Answers so far">
          {questions.map((q, i) => {
            const state = i < results.length ? (results[i] ? 'right' : 'wrong') : i === index ? 'now' : 'next'
            return <li key={q.id} className={`pips__pip pips__pip--${state}`} />
          })}
        </ol>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, x: reduced ? 0 : 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduced ? 0 : -28 }}
          transition={{ duration: 0.28 }}
        >
          <h2 className="quiz__question">{current.q}</h2>

          <div className="choices">
            {current.options.map((opt, i) => (
              <motion.button
                key={i}
                type="button"
                className={`choice ${optionState(i)}`}
                onClick={() => choose(i)}
                disabled={locked}
                whileTap={!locked && !reduced ? { scale: 0.98 } : undefined}
              >
                <span className="choice__key">{LETTERS[i]}</span>
                <span className="choice__text">{opt}</span>
                {locked && i === current.answer && <span className="choice__mark" aria-label="Correct answer">✓</span>}
                {locked && i === selected && !gotIt && <span className="choice__mark" aria-label="Your answer">✕</span>}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="quiz__bottom">
        <AnimatePresence>
          {locked && (
            <motion.p
              className={`verdict ${gotIt ? 'verdict--right' : 'verdict--wrong'}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
            >
              {gotIt ? 'Correct!' : `Not quite — it's ${LETTERS[current.answer]}.`}
            </motion.p>
          )}
        </AnimatePresence>

        <button className="btn btn--gold" onClick={next} disabled={!locked}>
          {isLast ? 'See my score' : 'Next question'} <span className="btn__arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}
