import { useState } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { PREVIEW_ROWS, SeeAllButton } from '../../components/SeeAll'
import { label } from '../../lib/format'
import { db } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type Entry = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor: { full_name: string } | null
}

export default function AuditLog() {
  const { data, loading, error } = useQuery(async () => {
    const { data: rows, error: loadError } = await db().from('audit_logs')
      .select('id,action,entity_type,entity_id,metadata,created_at,actor:profiles!audit_logs_actor_profile_fkey(full_name)')
      .order('created_at', { ascending: false }).limit(200)
    if (loadError) throw loadError
    return rows as unknown as Entry[]
  }, [])

  const [showAll, setShowAll] = useState(false)

  if (loading && !data) return <EmptyState title="Loading audit log…" />
  if (error) return <ErrorBanner message={error} />

  return (
    <div className="admin-card">
      {(data ?? []).length === 0 ? <EmptyState title="No activity recorded yet" /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>{(showAll ? data ?? [] : (data ?? []).slice(0, PREVIEW_ROWS)).map(entry => (
            <tr key={entry.id}>
              <td>{new Date(entry.created_at).toLocaleString('en-PH')}</td>
              <td>{entry.actor?.full_name || 'System'}</td>
              <td><strong>{label(entry.action)}</strong></td>
              <td>{label(entry.entity_type)}{entry.entity_id ? <small>{entry.entity_id}</small> : null}</td>
              <td>{typeof entry.metadata?.reason === 'string' ? entry.metadata.reason : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <SeeAllButton total={(data ?? []).length} expanded={showAll} onToggle={() => setShowAll(value => !value)} />
    </div>
  )
}
