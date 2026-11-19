import { useState } from 'react'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { submitEntry } from '../utils/api.js'
import LoadingOverlay from '../components/motion/LoadingOverlay.jsx'
import { capitalizeName } from '../utils/formatName.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * The last step before the ticket, and the write that actually matters: the
 * registration row so far holds only name/mobile/email, and this is what
 * adds the quiz result and the prize to it.
 *
 * Everything is pre-filled from registration, so for most people this is a
 * read-and-confirm — but the fields stay editable, because the stall is
 * exactly where someone notices they mistyped their own email.
 */
export default function ContactPage() {
  const { visitor, gift, score, questions, answers, setEntry, setStep } = useFlow()

  const [name, setName] = useState(visitor.name || '')
  const [organization, setOrganization] = useState(visitor.organization || '')
  const [designation, setDesignation] = useState(visitor.designation || '')
  const [email, setEmail] = useState(visitor.email || '')
  const [phone, setPhone] = useState(visitor.mobile || '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function onConfirm(e) {
    e.preventDefault()
    if (!name.trim()) return setFormError('Please enter your name.')
    if (!organization.trim()) return setFormError('Please enter your organization.')
    if (!designation.trim()) return setFormError('Please enter your designation.')
    if (email.trim() && !EMAIL_RE.test(email.trim())) return setFormError('That email address doesn’t look right — fix it or leave it blank.')
    if (phone.replace(/\D/g, '').length < 10) return setFormError('Please enter a valid WhatsApp number.')

    setFormError('')
    setSubmitting(true)

    const total = questions.length
    const result = await submitEntry({
      name: capitalizeName(name).trim(),
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim(),
      designation: designation.trim(),
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

  // Email is optional, so it is deliberately not part of this check.
  const ready = name.trim() && phone.trim() && organization.trim() && designation.trim()

  return (
    <div className="panel panel--narrow">
      <LoadingOverlay show={submitting} />

      <header className="panel__head">
        <span className="kicker">Step 04</span>
        <h2 className="panel__title">Check your details</h2>
        <p className="panel__sub">These go on your prize ticket. Fix anything that's off.</p>
      </header>

      {gift && (
        <div className="summary">
          <span className="summary__emoji" aria-hidden="true">{gift.emoji}</span>
          <span className="summary__text">
            <span className="summary__label">{gift.tier === 'consolation' ? 'Result' : 'Prize'}</span>
            <span className="summary__title">{gift.title}</span>
          </span>
          <span className="summary__score">{score}/{questions.length}</span>
        </div>
      )}

      <form className="form" onSubmit={onConfirm} noValidate>
        <label className="field">
          <span className="field__label">Full name</span>
          <input
            className="field__input"
            type="text"
            value={name}
            onChange={(e) => setName(capitalizeName(e.target.value))}
            autoCapitalize="words"
            autoComplete="name"
          />
        </label>

        <div className="form__pair">
          <label className="field">
            <span className="field__label">Organization</span>
            <input
              className="field__input"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              autoComplete="organization"
            />
          </label>

          <label className="field">
            <span className="field__label">Designation</span>
            <input
              className="field__input"
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              autoComplete="organization-title"
            />
          </label>
        </div>

        <label className="field">
          <span className="field__label">
            Email <span className="field__hint">optional — for a confirmation</span>
          </span>
          <input
            className="field__input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span className="field__label">
            WhatsApp number <span className="field__hint">for prize updates</span>
          </span>
          <input
            className="field__input"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>

        {formError && <p className="alert alert--bad" role="alert">{formError}</p>}

        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={() => setStep(STEPS.GIFT)} disabled={submitting}>
            Back
          </button>
          <button type="submit" className="btn btn--gold" disabled={!ready || submitting}>
            {submitting ? 'Saving…' : 'Get my ticket'} <span className="btn__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </div>
  )
}
