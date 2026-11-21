import { useState } from 'react'
import { ConfirmDialog } from './Dialog'
import { useAuth } from '../lib/auth'
import { db, errorMessage } from '../lib/supabase'

export type ReportCategory = 'caterer' | 'customer' | 'booking' | 'payment' | 'system' | 'other' | 'deactivation'

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  caterer: 'Problem with the caterer',
  customer: 'Problem with the customer',
  booking: 'Problem with the booking',
  payment: 'Payment problem',
  system: 'Problem with the app or website',
  other: 'Something else',
  deactivation: 'Request to deactivate a customer',
}

/** Categories a caterer can choose (a caterer does not report about themselves). */
const OWNER_CATEGORIES: ReportCategory[] = ['customer', 'booking', 'payment', 'system', 'other']

/**
 * "Report a problem" for caterers. With a booking, the report is linked to it, so the
 * administrator sees which booking and customer it is about.
 */
export function ReportProblemDialog({ booking, onClose, onSent, initialCategory }: {
  booking?: { id: string; label: string } | null
  onClose: () => void
  onSent?: () => void
  /** 'deactivation': ask the administrator to deactivate this booking's customer. */
  initialCategory?: ReportCategory
}) {
  const { userId } = useAuth()
  const [category, setCategory] = useState<ReportCategory>(initialCategory ?? (booking ? 'customer' : 'system'))
  const asking = category === 'deactivation'
  // A deactivation request is always about one booking's customer.
  const categories = booking ? [...OWNER_CATEGORIES, 'deactivation' as const] : OWNER_CATEGORIES
  const [subject, setSubject] = useState('')
  const [problem, setProblem] = useState('')

  async function send(description: string) {
    setProblem('')
    if (subject.trim().length < 3) { setProblem('Please write a short subject.'); return }
    if (description.trim().length < 10) { setProblem('Please describe the problem in a few words.'); return }
    const { error } = await db().from('complaints').insert({
      reporter_id: userId,
      booking_id: booking?.id ?? null,
      category,
      subject: subject.trim(),
      description: description.trim(),
    })
    if (error) { setProblem(errorMessage(error)); return }
    onSent?.()
    onClose()
  }

  return (
    <ConfirmDialog
      title={asking ? 'Ask the administrator to deactivate this customer' : 'Report a problem'}
      description={asking
        ? `About the customer of booking ${booking?.label ?? ''}. Only the administrator can deactivate (and reactivate) a customer's account; they will review your reason and reply to you. To stop this customer booking YOUR business right away, use Block instead.`
        : booking ? `About booking ${booking.label}. The administrator will review it and reply to you.` : 'The administrator will review it and reply to you in Notifications.'}
      confirmLabel={asking ? 'Send request' : 'Send report'}
      inputLabel={asking ? 'Why should this customer be deactivated?' : 'What happened?'}
      inputRequired
      onConfirm={send}
      onCancel={onClose}
    >
      <label>Type of problem
        <select value={category} onChange={event => setCategory(event.target.value as ReportCategory)}>
          {categories.map(option => <option key={option} value={option}>{CATEGORY_LABEL[option]}</option>)}
        </select>
      </label>
      <label>Subject
        <input value={subject} onChange={event => setSubject(event.target.value)} maxLength={150} required placeholder={asking ? 'e.g. Please deactivate this customer' : 'e.g. Customer did not show up'} />
      </label>
      {problem && <div className="form-error">{problem}</div>}
    </ConfirmDialog>
  )
}
