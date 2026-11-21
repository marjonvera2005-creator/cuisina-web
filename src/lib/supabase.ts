import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export type Portal = 'owner' | 'admin'

// Each portal keeps its OWN login in the browser (separate storage keys), so a caterer
// and an administrator can be signed in at the same time in different tabs, and signing
// out of one portal does not sign out the other.
const clients: Partial<Record<Portal, SupabaseClient>> = {}

/**
 * Caterer portal: every browser tab has its OWN login, kept in that tab only (sessionStorage,
 * under a key unique to the tab). So several caterers can be signed in at the same time in
 * different tabs without one replacing the other. Refreshing keeps the login; closing the tab
 * signs that caterer out.
 */
function ownerTabAuth(): { storageKey: string; storage: Storage } | null {
  try {
    let tab = sessionStorage.getItem('cuisina-tab-id')
    if (!tab) {
      tab = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem('cuisina-tab-id', tab)
    }
    // The older shared login (one caterer for the whole browser) is no longer used.
    localStorage.removeItem('cuisina-owner-auth')
    return { storageKey: `cuisina-owner-auth-${tab}`, storage: sessionStorage }
  } catch {
    return null // storage blocked: fall back to the default below
  }
}

export function clientFor(portal: Portal): SupabaseClient | null {
  if (!url || !key) return null
  const tab = portal === 'owner' ? ownerTabAuth() : null
  return clients[portal] ??= createClient(url, key, {
    auth: tab ? { storageKey: tab.storageKey, storage: tab.storage } : { storageKey: `cuisina-${portal}-auth` },
  })
}

/** The portal of the page being viewed: /admin/... is the administrator portal, everything else the caterer portal. */
export function currentPortal(): Portal {
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'owner'
}

/** Returns the current portal's client, or throws a readable error when the environment is not configured. */
export function db(): SupabaseClient {
  const client = clientFor(currentPortal())
  if (!client) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  return client
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return 'Something went wrong. Please try again.'
}

export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path || !url) return null
  return `${url}/storage/v1/object/public/catering-public/${path}`
}
