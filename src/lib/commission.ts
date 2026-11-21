import { db } from './supabase'

/**
 * Business model (migration 029): Cuisina keeps a commission on each completed booking.
 * Each booking keeps the rate that applied when it was made. Optional everywhere: before
 * the migration is run, these return nothing and the pages simply hide the fee.
 */
export async function fetchCommissionRates(businessId: string): Promise<Map<string, number>> {
  const { data, error } = await db().from('bookings').select('id,commission_rate').eq('business_id', businessId).limit(5000)
  const rates = new Map<string, number>()
  if (error) return rates
  for (const row of data as { id: string; commission_rate: number | null }[]) {
    if (row.commission_rate != null) rates.set(row.id, Number(row.commission_rate))
  }
  return rates
}

export async function fetchPlatformRate(): Promise<number | null> {
  const { data, error } = await db().from('platform_settings').select('commission_rate').maybeSingle()
  return error || !data ? null : Number(data.commission_rate)
}

/** Cuisina's share and the caterer's share of one booking total. */
export function splitTotal(total: number | null | undefined, rate: number) {
  const amount = Number(total ?? 0)
  const fee = Math.round(amount * rate) / 100
  return { fee, receives: Math.round((amount - fee) * 100) / 100 }
}

export const formatRate = (rate: number) => `${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`
