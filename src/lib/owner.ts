import { db } from './supabase'
import type { VerificationStatus } from './types'

export type MyBusiness = {
  id: string
  business_name: string
  description: string | null
  address: string | null
  contact_phone: string | null
  contact_email: string | null
  service_area: string | null
  verification_status: VerificationStatus
  rejection_reason: string | null
  cancellation_policy: string | null
  logo_path: string | null
  cover_path: string | null
}

export const BUSINESS_COLUMNS =
  'id,business_name,description,address,contact_phone,contact_email,service_area,verification_status,rejection_reason,cancellation_policy,logo_path,cover_path'

/** Closes requests past their 48-hour hold. A failure only delays that, so it never blocks the page. */
export async function expireStaleBookings(): Promise<void> {
  await db().rpc('expire_stale_bookings')
}

export async function fetchMyBusiness(userId: string): Promise<MyBusiness | null> {
  const { data, error } = await db().from('catering_businesses').select(BUSINESS_COLUMNS).eq('owner_id', userId).maybeSingle()
  if (error) throw error
  return data as MyBusiness | null
}
