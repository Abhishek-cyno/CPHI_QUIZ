import { useReducedMotion } from 'framer-motion'
import { Reveal, RevealGroup, RevealItem } from './motion/Reveal.jsx'
import { ClipboardIcon, EcgIcon, GiftIcon } from './hero/MedicalIcons.jsx'
import { EASE_OUT } from '../animations/motion.js'

/* =========================================================
   HowItWorks — three step cards that fade up on scroll with a
   staggered delay, then lift on hover.

   The hover lift is Framer Motion rather than CSS because the
   reveal already owns the card's inline transform; a CSS
   :hover transform would simply be outranked by it.
   ========================================================= */

const STEPS = [
  {
    Icon: ClipboardIcon,
    tone: 'navy',
    step: '01',
    title: 'Tell us about you',
    text: 'Name, mobile and email — that is the whole form.',
  },
  {
    Icon: EcgIcon,
    tone: 'gold',
    step: '02',
    title: 'Answer 3 questions',
    text: 'Three random questions on pharmacology, formulation and regulation.',
  },
  {
    Icon: GiftIcon,
    tone: 'slate',
    step: '03',
    title: 'Spin & win your reward',
    text: 'Spin the wheel and collect your prize at our stall.',
  },
]

export default function HowItWorks({ onProceed }) {
  const reduced = useReducedMotion()

  const hover = {
    y: reduced ? 0 : -5,
    boxShadow: '0 28px 46px -28px rgba(12, 60, 84, 0.45)',
  }

  return (
    <section className="how" id="how-it-works">
      <Reveal as="div" className="how__head">
        <span className="how__eyebrow">How It Works</span>
        <h2 className="how__title">Three steps. Under a minute.</h2>
        <p className="how__lede">
          No paperwork, no long forms — just your knowledge and a reward you spin for.
        </p>
      </Reveal>

      <RevealGroup className="how__grid" stagger={0.12}>
        {STEPS.map(({ Icon, tone, step, title, text }) => (
          <RevealItem
            key={step}
            className={`how__card how__card--${tone}`}
            whileHover={hover}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            <span className="how__icon">
              <Icon width="22" height="22" />
            </span>
            <span className="how__step">{step}</span>
            <h3 className="how__card-title">{title}</h3>
            <p className="how__card-text">{text}</p>
          </RevealItem>
        ))}
      </RevealGroup>

      {onProceed && (
        <Reveal as="div" className="how__actions" delay={0.1}>
          <button type="button" className="btn btn--primary btn--lg how__proceed" onClick={onProceed}>
            Proceed
            <span className="btn__arrow" aria-hidden="true">→</span>
          </button>
        </Reveal>
      )}
    </section>
  )
}
