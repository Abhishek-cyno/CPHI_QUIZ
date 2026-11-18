import { motion, useReducedMotion } from 'framer-motion'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { CONFIG } from '../config.js'
import GradientOrbs from '../components/motion/GradientOrbs.jsx'
import { RevealGroup, RevealItem } from '../components/motion/Reveal.jsx'
import HeroScene from '../components/hero/HeroScene.jsx'
import HowItWorks from '../components/HowItWorks.jsx'
import { BoltIcon, GiftIcon, UsersIcon, ShieldIcon, ClipboardIcon } from '../components/hero/MedicalIcons.jsx'
import { EASE_OUT } from '../animations/motion.js'

// Decorative faint crosses scattered across the hero background.
const CROSSES = [
  { top: '14%', left: '46%', size: 46, o: 0.5 },
  { top: '58%', left: '40%', size: 60, o: 0.45 },
  { top: '30%', left: '70%', size: 40, o: 0.4 },
  { top: '74%', left: '66%', size: 34, o: 0.5 },
  { top: '10%', left: '86%', size: 30, o: 0.4 },
  { top: '86%', left: '52%', size: 26, o: 0.4 },
]

const PERKS = [
  { Icon: BoltIcon, tone: 'navy', title: 'Quick & Easy', text: 'Just 1 minute' },
  { Icon: GiftIcon, tone: 'gold', title: 'Exciting Rewards', text: 'Spin the wheel to win' },
  { Icon: UsersIcon, tone: 'slate', title: 'For the Industry', text: 'Pharma, by pharma' },
]

/* The CTA's rest/hover/tap states. Declared as variants so the arrow —
   which declares matching variants — follows the button's gesture state
   without any extra wiring. */
const ctaVariants = (reduced) => ({
  rest: { y: 0, boxShadow: '0 12px 24px -12px rgba(12, 60, 84, 0.9)' },
  hover: {
    y: reduced ? 0 : -3,
    boxShadow: '0 22px 38px -14px rgba(12, 60, 84, 0.65)',
    transition: { duration: 0.25, ease: EASE_OUT },
  },
  tap: { y: reduced ? 0 : -1, scale: reduced ? 1 : 0.985, transition: { duration: 0.12 } },
})

const arrowVariants = (reduced) => ({
  rest: { x: 0 },
  hover: { x: reduced ? 0 : 4, transition: { duration: 0.25, ease: EASE_OUT } },
})

export default function LandingPage() {
  const { setStep } = useFlow()
  const reduced = useReducedMotion()

  const scrollToHow = () => {
    document
      .getElementById('how-it-works')
      ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="landing">
      <section className="landing-hero">
        <GradientOrbs />

        <div className="landing-hero__bg" aria-hidden="true">
          {CROSSES.map((c, i) => (
            <span
              key={i}
              className="landing-hero__cross"
              style={{ top: c.top, left: c.left, width: c.size, height: c.size, opacity: c.o }}
            />
          ))}
        </div>

        {/* Hero copy — one orchestrator, everything below it staggers in on load. */}
        <RevealGroup className="landing-hero__content" on="load" stagger={0.11} delayChildren={0.1}>
          <RevealItem as="span" className="landing-hero__badge">
            <ShieldIcon width="15" height="15" />
            {CONFIG.eventName} · {CONFIG.brandName}
          </RevealItem>

          <RevealItem as="h1" className="landing-hero__title" y={24}>
            Test Your Pharma
            <br />
            <span>Knowledge.</span>
          </RevealItem>

          <RevealItem as="p" className="landing-hero__lede">
            Answer three short questions on pharmacology, formulation and regulation
            <br />
            then spin the wheel to claim your reward. It will take less than a minute.
          </RevealItem>

          <RevealItem className="landing-hero__perks">
            {PERKS.map(({ Icon, tone, title, text }) => (
              <span className="perk" key={title}>
                <span className={`perk__icon perk__icon--${tone}`}>
                  <Icon width="18" height="18" />
                </span>
                <span className="perk__copy">
                  <b>{title}</b>
                  <small>{text}</small>
                </span>
              </span>
            ))}
          </RevealItem>

          <RevealItem className="landing-hero__actions">
            <motion.button
              type="button"
              className="btn btn--primary btn--lg landing-hero__btn"
              onClick={() => setStep(STEPS.REGISTER)}
              variants={ctaVariants(reduced)}
              initial="rest"
              animate="rest"
              whileHover="hover"
              whileFocus="hover"
              whileTap="tap"
            >
              Start Now
              <motion.span className="btn__arrow" variants={arrowVariants(reduced)} aria-hidden="true">
                →
              </motion.span>
            </motion.button>

            <button type="button" className="btn btn--quiet" onClick={scrollToHow}>
              <ClipboardIcon width="20" height="20" />
              Know How It Works
            </button>
          </RevealItem>
        </RevealGroup>

        <div className="landing-hero__art">
          <HeroScene />
        </div>
      </section>

      <HowItWorks onProceed={() => setStep(STEPS.REGISTER)} />
    </div>
  )
}
