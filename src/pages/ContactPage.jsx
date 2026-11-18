import { useState } from 'react'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { submitEntry } from '../utils/api.js'
import LoadingOverlay from '../components/motion/LoadingOverlay.jsx'
import { capitalizeName } from '../utils/formatName.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * The last step before Thank You, and the write that actually matters: the
 * registration row so far holds only name/mobile/email, and this is what
 * adds the quiz result and the prize to it.
 *
 * Everything is pre-filled from the registration form, so for most people
 * this is a read-and-confirm rather than a second round of typing — but
 * the fields stay editable, because the stall is exactly where someone
 * notices they fat-fingered their own email.
 */
export default function ContactPage() {
  const { visitor, gift, score, questions, answers, setEntry, setStep } = useFlow()

  const [name, setName] = useState(visitor.name || '')
  const [email, setEmail] = useState(visitor.email || '')
  const [phone, setPhone] = useState(visitor.mobile || '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function onConfirm() {
    if (!name.trim()) return setFormError('Please enter your name.')
    if (!EMAIL_RE.test(email.trim())) return setFormError('Please enter a valid email address.')
    if (phone.replace(/\D/g, '').length < 10) return setFormError('Please enter a valid WhatsApp number.')

    setFormError('')
    setSubmitting(true)

    const total = questions.length
    const result = await submitEntry({
      name: capitalizeName(name).trim(),
      email: email.trim(),
      phone: phone.trim(),
      score,
      total,
      percent: total ? Math.round((score / total) * 100) : 0,
      gift: gift?.title || '',
      answers,
    })

    setSubmitting(false)

    if (result.ok) {
      setEntry({ ref: result.ref || '', email: email.trim(), phone: phone.trim() })
      setStep(STEPS.THANKYOU)
      return
    }

    setFormError(result.error || 'Something went wrong. Please try again.')
  }

  const ready = name.trim() && email.trim() && phone.trim()

  return (
    <div className="card center-narrow">
      <LoadingOverlay show={submitting} />

      <div style={{ textAlign: 'center' }}>
        <h2 className="card__title">Almost done — confirm your details</h2>
        <p className="card__sub" style={{ margin: '6px auto 0' }}>
          We'll use these to hand over <strong>{gift?.title}</strong>. Change anything that doesn't look right.
        </p>
      </div>

      <form className="form" onSubmit={(e) => { e.preventDefault(); onConfirm() }}>
        <label className="field">
          <span className="field__label">Full Name</span>
          <input
            className="field__input"
            type="text"
            placeholder="Shivangi Mittal"
            value={name}
            onChange={(e) => setName(capitalizeName(e.target.value))}
            autoCapitalize="words"
          />
        </label>

        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="field__input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">
            WhatsApp Number <span className="field__hint">(for prize updates)</span>
          </span>
          <input
            className="field__input"
            type="tel"
            inputMode="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        {formError && <p className="form__error">{formError}</p>}

        <div className="form__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setStep(STEPS.GIFT)} disabled={submitting}>
            Back
          </button>
          <button type="submit" className="btn btn--primary" disabled={!ready || submitting}>
            {submitting ? 'Saving…' : 'Confirm'} <span className="btn__arrow">→</span>
          </button>
        </div>
      </form>
    </div>
  )
}
