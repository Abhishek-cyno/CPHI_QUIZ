import { useState } from 'react'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import { capitalizeName } from '../utils/formatName.js'
import { registerVisitor, prefetchEligibility } from '../utils/api.js'
import PhoneInput from '../components/PhoneInput.jsx'
import { splitPhone, joinPhone } from '../utils/phone.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Name, mobile, organization, designation, and an optional email.
 *
 * Every question comes from one shared bank, so nothing here changes what
 * the visitor is asked — organization and designation are for the stall
 * team's follow-up. Email is optional: the on-screen result is the visitor's
 * real record, and a confirmation mail is a bonus for those who want one.
 */
export default function RegisterPage() {
  const { setStep, visitor, setVisitor } = useFlow()
  const [name, setName] = useState(visitor.name)
  const [countryCode, setCountryCode] = useState(() => splitPhone(visitor.mobile).code)
  const [mobile, setMobile] = useState(() => splitPhone(visitor.mobile).number)
  const [organization, setOrganization] = useState(visitor.organization)
  const [designation, setDesignation] = useState(visitor.designation)
  const [email, setEmail] = useState(visitor.email)
  const [error, setError] = useState('')

  function onSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter your name.')
    if (mobile.length !== 10) return setError('Please enter a valid 10-digit mobile number.')
    if (!organization.trim()) return setError('Please enter your organization.')
    if (!designation.trim()) return setError('Please enter your designation.')
    // Optional, but if something is typed it has to be an address.
    if (email.trim() && !EMAIL_RE.test(email.trim())) return setError('That email address doesn’t look right — fix it or leave it blank.')
    setError('')

    const details = {
      name: capitalizeName(name).trim(),
      mobile: joinPhone(countryCode, mobile),
      organization: organization.trim(),
      designation: designation.trim(),
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
        <p className="panel__sub">So we know who to hand your prize to.</p>
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

        <div className="form__pair">
          <label className="field">
            <span className="field__label">Organization</span>
            <input
              className="field__input"
              type="text"
              placeholder="Hospital or institute"
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
              placeholder="e.g. Senior Resident"
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
