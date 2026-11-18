import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from './context/FlowContext.jsx'
import { CONFIG } from './config.js'
import Backdrop from './components/Backdrop.jsx'
import ProgressRail from './components/ProgressRail.jsx'

import LandingPage from './pages/LandingPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import QuizIntroPage from './pages/QuizIntroPage.jsx'
import QuizPage from './pages/QuizPage.jsx'
import CompletePage from './pages/CompletePage.jsx'
import GiftPage from './pages/GiftPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import ThankYouPage from './pages/ThankYouPage.jsx'

const screens = {
  [STEPS.LANDING]: LandingPage,
  [STEPS.REGISTER]: RegisterPage,
  [STEPS.QUIZINTRO]: QuizIntroPage,
  [STEPS.QUIZ]: QuizPage,
  [STEPS.COMPLETE]: CompletePage,
  [STEPS.GIFT]: GiftPage,
  [STEPS.CONTACT]: ContactPage,
  [STEPS.THANKYOU]: ThankYouPage,
}

export default function App() {
  const { step, reset } = useFlow()
  const reduced = useReducedMotion()
  const Screen = screens[step] || LandingPage

  return (
    <div className="shell">
      <Backdrop />

      <header className="topbar">
        {/* The logo is navy-on-white artwork, so on this dark shell it sits
            on its own light chip rather than being recoloured. Tapping it is
            the stall attendant's quick way back to the start screen. */}
        <button type="button" className="topbar__logo" onClick={reset} aria-label="Back to start">
          <img src="/images/eqova-logo.png" alt={CONFIG.brandName} />
        </button>
        <span className="topbar__event">
          <span className="topbar__live" aria-hidden="true" />
          Live at {CONFIG.eventName}
        </span>
      </header>

      <ProgressRail step={step} />

      <main className="stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="stage__screen"
            initial={{ opacity: 0, y: reduced ? 0 : 18, scale: reduced ? 1 : 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduced ? 0 : -12 }}
            transition={{ duration: reduced ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <Screen />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="credit">
        <span className="credit__chip">
          <img src="/images/cyno-logo.png" alt="" />
        </span>
        Powered by <strong>Cyno Pharma</strong>
      </footer>
    </div>
  )
}
