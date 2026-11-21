import { motion } from 'framer-motion'
import { STEPS } from '../context/FlowContext.jsx'

/* =========================================================
   ProgressRail — four thin segments under the top bar
   ---------------------------------------------------------
   Replaces the numbered dot stepper with something closer to
   a game's level bar: each phase is a segment that fills gold
   as the visitor moves through it. Every visitor walks the
   same four phases, so the rail never changes shape mid-run.
   ========================================================= */

const PHASES = ['Details', 'Quiz', 'Spin', 'Prize']

// How far through the whole run each step is: [phase index, fill of that phase].
const STEP_POSITION = {
  [STEPS.REGISTER]: [0, 0.5],
  [STEPS.QUIZ]: [1, 0.55],
  [STEPS.COMPLETE]: [1, 1],
  [STEPS.GIFT]: [2, 0.5],
  [STEPS.THANKYOU]: [3, 1],
}

export default function ProgressRail({ step }) {
  const position = STEP_POSITION[step]
  if (!position) return null // the landing screen has no rail
  const [phase, fill] = position

  return (
    <nav className="rail" aria-label="Progress">
      <ol className="rail__track">
        {PHASES.map((label, i) => {
          const amount = i < phase ? 1 : i === phase ? fill : 0
          const state = i < phase || (i === phase && fill === 1) ? 'done' : i === phase ? 'current' : 'todo'
          return (
            <li
              key={label}
              className={`rail__seg rail__seg--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="rail__bar">
                <motion.span
                  className="rail__fill"
                  initial={false}
                  animate={{ scaleX: amount }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
              <span className="rail__label">
                <span className="rail__num">{String(i + 1).padStart(2, '0')}</span>
                {label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
