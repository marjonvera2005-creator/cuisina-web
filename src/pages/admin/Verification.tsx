import { Fragment, useState } from 'react'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { ConfirmDialog } from '../../components/Dialog'
import { formatDate } from '../../lib/format'
import { db, errorMessage } from '../../lib/supabase'
import type { VerificationStatus } from '../../lib/types'
import { useQuery } from '../../lib/useQuery'

type BusinessRow = {
  id: string
  business_name: string
  description: string | null
  address: string | null
  contact_phone: string | null
  contact_email: string | null
  service_area: string | null
  verification_status: VerificationStatus
  rejection_reason: string | null
  created_at: string
  business_verification_documents: { id: string; file_path: string; document_type: string }[]
  owner: { full_name: string; phone: string | null } | null
}

type Decision = { business: BusinessRow; status: Exclude<VerificationStatus, 'pending'> }

const FILTERS: ('all' | VerificationStatus)[] = ['all', 'pending', 'approved', 'rejected', 'suspended']

export default function Verification() {
  const { data, loading, error, reload } = useQuery(async () => {
    const { data: rows, error: loadError } = await db().from('catering_businesses')
      .select('id,business_name,description,address,contact_phone,contact_email,service_area,verification_status,rejection_reason,created_at,business_verification_documents(id,file_path,document_type),owner:profiles!catering_businesses_owner_profile_fkey(full_name,phone)')
      .order('created_at', { ascending: false })
    if (loadError) throw loadError
    return rows as unknown as BusinessRow[]
  }, [])

  const [filter, setFilter] = useState<'all' | VerificationStatus>('pending')
  const [open, setOpen] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [problem, setProblem] = useState('')

  async function decide(reason: string) {
    if (!decision) return
    setProblem('')
    const { error: rpcError } = await db().rpc('set_business_verification', {
      p_business_id: decision.business.id,
      p_status: decision.status,
      p_reason: reason || null,
    })
    setDecision(null)
    if (rpcError) setProblem(errorMessage(rpcError))
    reload()
  }

  async function viewDocument(path: string) {
    setProblem('')
    const { data: signed, error: signError } = await db().storage.from('verification-documents').createSignedUrl(path, 120)
    if (signError || !signed) { setProblem(errorMessage(signError)); return }
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading && !data) return <EmptyState title="Loading businesses…" />
  const businesses = data ?? []
  const visible = filter === 'all' ? businesses : businesses.filter(item => item.verification_status === filter)

  return (
    <>
      <ErrorBanner message={error || problem} />
      <div className="filter-row">{FILTERS.map(option => (
        <button key={option} className={filter === option ? 'active' : ''} onClick={() => setFilter(option)}>
          {option[0].toUpperCase() + option.slice(1)} <span className="count">{option === 'all' ? businesses.length : businesses.filter(item => item.verification_status === option).length}</span>
        </button>
      ))}</div>
      <div className="admin-card">
        {visible.length === 0 ? <EmptyState title="No businesses found">This verification queue is empty.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Business</th><th>Owner</th><th>Documents</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{visible.map(item => (
              <Fragment key={item.id}>
                <tr>
                  <td><strong>{item.business_name}</strong><small>{item.description || 'No description'}</small></td>
                  <td>{item.owner?.full_name || '—'}<small>{item.contact_phone || item.owner?.phone || 'No phone'}</small></td>
                  <td>{item.business_verification_documents.length} document{item.business_verification_documents.length === 1 ? '' : 's'}</td>
                  <td><StatusBadge status={item.verification_status} /></td>
                  <td><div className="row-actions">
                    <button className="reject" onClick={() => setOpen(open === item.id ? null : item.id)}>{open === item.id ? 'Hide' : 'Review'}</button>
                    {item.verification_status !== 'approved' && <button className="approve" disabled={item.business_verification_documents.length === 0} title={item.business_verification_documents.length === 0 ? 'No documents uploaded yet' : undefined} onClick={() => setDecision({ business: item, status: 'approved' })}>Approve</button>}
                    {item.verification_status !== 'rejected' && <button className="reject" onClick={() => setDecision({ business: item, status: 'rejected' })}>Reject</button>}
                    {item.verification_status === 'approved' && <button className="reject" onClick={() => setDecision({ business: item, status: 'suspended' })}>Suspend</button>}
                  </div></td>
                </tr>
                {open === item.id && (
                  <tr className="detail-row"><td colSpan={5}>
                    <div className="review-panel">
                      <dl className="booking-facts">
                        <div><dt>Owner</dt><dd>{item.owner?.full_name || '—'}</dd></div>
                        <div><dt>Mobile</dt><dd>{item.contact_phone ? <a href={`tel:${item.contact_phone}`}>{item.contact_phone}</a> : '—'}</dd></div>
                        <div><dt>Email</dt><dd>{item.contact_email || '—'}</dd></div>
                        <div><dt>Business address</dt><dd>{item.address || '—'}</dd></div>
                        <div><dt>Applied</dt><dd>{formatDate(item.created_at)}</dd></div>
                        {item.rejection_reason && <div><dt>Last reason</dt><dd>{item.rejection_reason}</dd></div>}
                      </dl>
                      <h4 className="list-title">Verification documents</h4>
                      {item.business_verification_documents.length === 0 ? <p className="muted-note">No documents uploaded.</p> : (
                        <ul className="doc-list">{item.business_verification_documents.map(doc => (
                          <li key={doc.id}><div><strong>{doc.document_type}</strong><small>{doc.file_path.split('/').pop()?.replace(/^\d+-/, '')}</small></div><button className="ghost-button" onClick={() => void viewDocument(doc.file_path)}>Open</button></li>
                        ))}</ul>
                      )}
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {decision && (
        <ConfirmDialog
          title={`${decision.status === 'approved' ? 'Approve' : decision.status === 'rejected' ? 'Reject' : 'Suspend'} ${decision.business.business_name}?`}
          description="The business owner will be notified."
          confirmLabel={decision.status === 'approved' ? 'Approve' : decision.status === 'rejected' ? 'Reject' : 'Suspend'}
          inputLabel={decision.status === 'approved' ? undefined : 'Reason (shared with the owner)'}
          inputRequired={decision.status === 'rejected'}
          danger={decision.status !== 'approved'}
          onConfirm={decide}
          onCancel={() => setDecision(null)}
        />
      )}
    </>
  )
}
