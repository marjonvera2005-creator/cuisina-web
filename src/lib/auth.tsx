import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { clientFor } from './supabase'
import type { Portal } from './supabase'
import { clearQueryCache } from './useQuery'

export type Role = 'customer' | 'owner' | 'administrator'

type SignUpResult = { needsConfirmation: boolean }

export type OwnerSignUp = {
  fullName: string
  phone: string
  businessName: string
  businessAddress: string
  email: string
  password: string
}

type AuthState = {
  loading: boolean
  session: Session | null
  userId: string | null
  email: string | null
  fullName: string
  roles: Role[]
  /** The administrator deactivated this account: no portal access until reactivated. */
  deactivated: boolean
  hasRole: (role: Role) => boolean
  signIn: (email: string, password: string) => Promise<void>
  signUpOwner: (details: OwnerSignUp) => Promise<SignUpResult>
  /** Confirms a new account with the code from the sign-up email; signs in on success. */
  verifyEmailCode: (email: string, code: string) => Promise<void>
  resendEmailCode: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Holds the login of one portal; the owner and admin portals each get their own provider. */
export function AuthProvider({ portal, children }: { portal: Portal; children: ReactNode }) {
  const supabase = clientFor(portal)
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [fullName, setFullName] = useState('')
  const [deactivated, setDeactivated] = useState(false)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [supabase])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!supabase) return
    if (!userId) { setRoles([]); setFullName(''); setDeactivated(false); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const load = () => Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('profiles').select('full_name,is_active').eq('id', userId).maybeSingle(),
    ]).then(([roleResult, profileResult]) => {
      if (cancelled) return
      // A failed check (e.g. offline) keeps the last known state instead of locking anyone out.
      if (!roleResult.error) setRoles((roleResult.data ?? []).map(row => row.role as Role))
      if (!profileResult.error) {
        setFullName(profileResult.data?.full_name ?? '')
        setDeactivated(profileResult.data?.is_active === false)
      }
      setLoading(false)
    })
    void load()
    // Check again when the tab comes back into view and every minute, so an owner who is
    // deactivated while signed in is stopped (and a reactivated one gets back in).
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60_000)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer) }
  }, [userId, supabase])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      if (/not confirmed/i.test(error.message)) throw new Error('This email has not been confirmed yet. Ask the administrator to confirm your account, or check your inbox for the confirmation link.')
      if (/invalid login/i.test(error.message)) throw new Error('Incorrect email or password. If you have not registered yet, create an account first.')
      throw error
    }
  }, [supabase])

  const signUpOwner = useCallback(async (details: OwnerSignUp): Promise<SignUpResult> => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.auth.signUp({
      email: details.email.trim(),
      password: details.password,
      options: {
        data: {
          full_name: details.fullName.trim(),
          phone: details.phone.trim(),
          business_name: details.businessName.trim(),
          business_address: details.businessAddress.trim(),
          account_type: 'owner',
        },
      },
    })
    if (error) throw error
    if (data.session) return { needsConfirmation: false }
    // Some projects return no session on signup; try signing in right away before asking for email confirmation.
    const retry = await supabase.auth.signInWithPassword({ email: details.email.trim(), password: details.password })
    return { needsConfirmation: Boolean(retry.error) }
  }, [supabase])

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' })
    if (error) throw error
  }, [supabase])

  const resendEmailCode = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    if (error) throw error
  }, [supabase])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    clearQueryCache() // the next account must not see this account's saved data
  }, [supabase])

  const value = useMemo<AuthState>(() => ({
    loading,
    session,
    userId,
    email: session?.user.email ?? null,
    fullName,
    roles,
    deactivated,
    hasRole: role => !deactivated && roles.includes(role),
    signIn,
    signUpOwner,
    verifyEmailCode,
    resendEmailCode,
    signOut,
  }), [loading, session, userId, fullName, roles, deactivated, signIn, signUpOwner, verifyEmailCode, resendEmailCode, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
