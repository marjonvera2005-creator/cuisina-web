import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'
import { errorMessage, isConfigured } from '../lib/supabase'
import { CuisinaLoader, Logo, NotConfigured } from './Brand'

const PASSWORD_HINT = 'At least 8 characters, with a symbol such as @'

/** Rule for NEW accounts only (same as the phone app's password_rule.dart). */
function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters for your password.'
  if (!/[^A-Za-z0-9\s]/.test(password)) return 'Add a symbol to your password, such as @, #, ! or $.'
  if (!confirm) return 'Please type your password again in Confirm password.'
  if (password !== confirm) return 'The passwords do not match.'
  return null
}

type Props = {
  role: Role
  title: string
  subtitle: string
  /** Owner portal lets new caterers register; the administrator portal never does. */
  allowSignUp?: boolean
  children: ReactNode
}

/** Renders the sign-in screen until the visitor holds the required role, then the portal itself. */
export function PortalGate({ role, title, subtitle, allowSignUp, children }: Props) {
  const auth = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // Email verification: the address waiting for its code (sign-up, or a login before confirming).
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [code, setCode] = useState('')

  if (!isConfigured) return <NotConfigured />
  if (auth.loading) return <main className="admin-loading" role="status"><div className="loading-stack"><CuisinaLoader size={88} /><span>Loading Cuisina…</span></div></main>
  if (auth.session && auth.hasRole(role)) return <>{children}</>

  async function submit(event: FormEvent) {
    event.preventDefault()
    // New accounts only: signing in is not checked, so people who registered before keep their password.
    if (mode === 'register') {
      const problem = newPasswordProblem(password, confirm)
      if (problem) { setError(problem); setNotice(''); return }
    }
    setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'register') {
        const result = await auth.signUpOwner({ fullName, phone, businessName, businessAddress, email, password })
        if (result.needsConfirmation) {
          setVerifyEmail(email.trim()); setCode('')
          setNotice(`We sent a code to ${email.trim()}. Enter it below to confirm your email.`)
        }
      } else {
        await auth.signIn(email, password)
      }
    } catch (err) {
      // Registered but never confirmed: ask for the code instead of a dead end.
      if (mode === 'login' && /email not confirmed/i.test(errorMessage(err))) {
        setVerifyEmail(email.trim()); setCode('')
        setNotice('Your email is not confirmed yet. Enter the code from your sign-up email, or send a new code.')
      } else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (auth.session && auth.deactivated) {
    return (
      <main className="admin-auth">
        <section className="auth-panel">
          <Logo to={role === 'administrator' ? '/admin' : '/owner'} />
          <p className="eyebrow">{title}</p>
          <h1>Account deactivated</h1>
          <p className="auth-copy">
            The Cuisina administrator has deactivated this account ({auth.email}). While it is deactivated you cannot use
            the portal, and your business is hidden from customers in the Cuisina app. Your packages, bookings and settings
            are kept: everything comes back as it was when the administrator reactivates your account.
          </p>
          <div className="auth-stack">
            <div className="form-notice">To ask for reactivation, contact the Cuisina administrator.</div>
            <button className="admin-primary" onClick={() => void auth.signOut()}>Sign out</button>
          </div>
        </section>
        <aside className="auth-art"><span>CUISINA</span><strong>Carefully reviewed.<br />Thoughtfully served.</strong></aside>
      </main>
    )
  }

  const wrongRole = Boolean(auth.session) && !auth.hasRole(role)

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!verifyEmail) return
    if (!/^\d{6,10}$/.test(code.trim())) { setError('Enter the code from the email (numbers only).'); return }
    setBusy(true); setError('')
    try {
      await auth.verifyEmailCode(verifyEmail, code)
      setVerifyEmail(null); setNotice('')
    } catch (err) {
      setError(/expired|invalid/i.test(errorMessage(err)) ? 'That code is wrong or has expired. Check the email again or send a new code.' : errorMessage(err))
    } finally { setBusy(false) }
  }

  async function resend() {
    if (!verifyEmail) return
    setBusy(true); setError('')
    try {
      await auth.resendEmailCode(verifyEmail)
      setNotice(`A new code was sent to ${verifyEmail}.`)
    } catch (err) {
      setError(/rate|seconds|too many/i.test(errorMessage(err)) ? 'Please wait a minute before asking for another code.' : errorMessage(err))
    } finally { setBusy(false) }
  }

  if (verifyEmail && !auth.session) {
    return (
      <main className="admin-auth">
        <section className="auth-panel">
          <Logo to={role === 'administrator' ? '/admin' : '/owner'} />
          <p className="eyebrow">{title}</p>
          <h1>Confirm your email</h1>
          <p className="auth-copy">Enter the code we sent to <strong>{verifyEmail}</strong>. Check your spam folder if you don't see it.</p>
          <form onSubmit={verify}>
            <label>Code from the email
              <input className="code-input" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required autoFocus />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            {notice && <div className="form-notice" role="status">{notice}</div>}
            <button className="admin-primary" disabled={busy}>{busy ? 'Please wait…' : 'Confirm email'}</button>
          </form>
          <button className="link-button" type="button" disabled={busy} onClick={() => void resend()}>Send a new code</button>
          <button className="link-button" type="button" onClick={() => { setVerifyEmail(null); setError(''); setNotice(''); setMode('login') }}>Back to sign in</button>
        </section>
        <aside className="auth-art"><span>CUISINA</span><strong>Carefully reviewed.<br />Thoughtfully served.</strong></aside>
      </main>
    )
  }

  return (
    <main className="admin-auth">
      <section className="auth-panel">
        <Logo to={role === 'administrator' ? '/admin' : '/owner'} />
        <p className="eyebrow">{title}</p>
        <h1>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-copy">{mode === 'register' ? 'Register your catering business. An administrator will review your details and documents before you go live.' : subtitle}</p>
        {wrongRole ? (
          <div className="auth-stack">
            <div className="form-error">This account ({auth.email}) does not have access to this portal.</div>
            <button className="admin-primary" onClick={() => void auth.signOut()}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === 'register' && <>
              <label>Owner's full name<input value={fullName} onChange={event => setFullName(event.target.value)} required minLength={2} autoComplete="name" /></label>
              <label>Mobile number<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} required pattern="[0-9+()\-\s]{7,20}" title="Enter a valid phone number" placeholder="09XX XXX XXXX" autoComplete="tel" /></label>
              <label>Business name<input value={businessName} onChange={event => setBusinessName(event.target.value)} required minLength={2} maxLength={150} /></label>
              <label>Business address<input value={businessAddress} onChange={event => setBusinessAddress(event.target.value)} required minLength={5} placeholder="e.g. Brgy. Poblacion, Naval, Biliran" autoComplete="street-address" /></label>
            </>}
            <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></label>
            <label>Password
              <span className="password-wrap">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(shown => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
              </span>
              {mode === 'register' && <small className="field-hint">{PASSWORD_HINT}</small>}
            </label>
            {mode === 'register' && (
              <label>Confirm password
                <span className="password-wrap">
                  <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={event => setConfirm(event.target.value)} required autoComplete="new-password" />
                </span>
              </label>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
            {notice && <div className="form-notice" role="status">{notice}</div>}
            <button className="admin-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in securely'}</button>
          </form>
        )}
        {allowSignUp && !wrongRole && (
          <button className="link-button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice('') }}>
            {mode === 'login' ? 'New caterer? Create an account' : 'Already registered? Sign in'}
          </button>
        )}
      </section>
      <aside className="auth-art"><span>CUISINA</span><strong>Carefully reviewed.<br />Thoughtfully served.</strong></aside>
    </main>
  )
}
