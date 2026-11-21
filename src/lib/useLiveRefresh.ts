import { useEffect } from 'react'
import { db } from './supabase'

/**
 * Calls `refresh` right away whenever something changes, without reloading the page:
 * a new notification for this user, or a change in any of `tables` (Supabase Realtime;
 * row-level security limits it to rows the user may see). A slow fallback timer also
 * refreshes in case a realtime message is missed.
 */
let channelCounter = 0

export function useLiveRefresh(userId: string | null | undefined, refresh: () => void, tables: string[] = [], fallbackMs = 5000) {
  const key = tables.join(',')
  useEffect(() => {
    if (!userId) return
    const client = db()
    // A unique name every time: Supabase reuses a channel with the same name, and adding
    // listeners to an already-subscribed channel throws (this blanked the whole page).
    let channel = client.channel(`live-${userId}-${key || 'notifications'}-${++channelCounter}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
    for (const table of key ? key.split(',') : []) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    }
    channel.subscribe()
    const timer = window.setInterval(refresh, fallbackMs)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      void client.removeChannel(channel)
    }
  }, [userId, refresh, key, fallbackMs])
}
