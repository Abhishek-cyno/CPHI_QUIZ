import { useState } from 'react'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { capitalizeName } from '../utils/formatName.js'
import { registerVisitor, prefetchEligibility } from '../utils/api.js'
import PhoneInput from '../components/PhoneInput.jsx'
import { splitPhone, joinPhone } from '../utils/phone.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Name, mobile and email — that is the whole form. Every question comes
 * from one shared bank, so there is nothing to branch on and nothing more
 * to ask. Email is collected here (not at the end) so the entry is complete
 * from the first submit, and the screen after the wheel is a confirmation
 * rather than a second round of typing.
 */
export default function RegisterPage() {
  const { setStep, visitor, setVisitor } = useFlow()
  const [name, setName] = useState(visitor.name)
  const [countryCode, setCountryCode] = useState(() => splitPhone(visitor.mobile).code)
  const [mobile, setMobile] = useState(() => splitPhone(visitor.mobile).number)
  const [email, setEmail] = useState(visitor.email)
  const [error, setError] = useState('')

  function onSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter your name.')
    if (mobile.length !== 10) return setError('Please enter a valid 10-digit mobile number.')
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.')
    setError('')

    const details = {
      name: capitalizeName(name).trim(),
      mobile: joinPhone(countryCode, mobile),
      email: email.trim(),
    }
    setVisitor(details)
    // Best-effort, not awaited: this puts the visitor's first row in the
    // Sheet, but a slow request shouldn't hold up the quiz — the claim and
    // submit steps create the row themselves if this one never lands.
    registerVisitor(details)
    prefetchEligibility(details.mobile)
    setStep(STEPS.QUIZINTRO)
  }

  return (
    <div className="panel panel--narrow">
      <header className="panel__head">
        <span className="kicker">Step 01</span>
        <h2 className="panel__title">Who's playing?</h2>
        <p className="panel__sub">We use these to send your confirmation and hand over your prize.</p>
      </header>

      <form className="form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field__label">Full name</span>
          <input
            className="field__input"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(capitalizeName(e.target.value))}
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
          />
        </label>

        <PhoneInput
          id="register-mobile"
          label="Mobile number"
          hint="one prize per number"
          code={countryCode}
          number={mobile}
          onCodeChange={setCountryCode}
          onNumberChange={setMobile}
        />

        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="field__input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        {error && <p className="alert alert--bad" role="alert">{error}</p>}

        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={() => setStep(STEPS.LANDING)}>
            Back
          </button>
          <button type="submit" className="btn btn--gold">
            Continue <span className="btn__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </div>
  )
}
