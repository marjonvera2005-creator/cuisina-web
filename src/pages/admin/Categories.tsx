import { useState } from 'react'
import type { FormEvent } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { db, errorMessage } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { askConfirm } from '../../components/AskDialog'

type Category = { id: string; name: string }

export default function Categories() {
  const { data, loading, error, reload } = useQuery(async () => {
    const { data: rows, error: loadError } = await db().from('event_categories').select('id,name').order('name')
    if (loadError) throw loadError
    return rows as Category[]
  }, [])
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [problem, setProblem] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    setProblem('')
    const value = name.trim()
    const result = editing
      ? await db().from('event_categories').update({ name: value }).eq('id', editing.id)
      : await db().from('event_categories').insert({ name: value })
    if (result.error) { setProblem(errorMessage(result.error)); return }
    setName(''); setEditing(null)
    reload()
  }

  async function remove(category: Category) {
    if (!(await askConfirm({ title: `Delete "${category.name}"?`, description: 'Packages tagged with this category will lose this tag.', confirmLabel: 'Delete', danger: true }))) return
    setProblem('')
    const { error: deleteError } = await db().from('event_categories').delete().eq('id', category.id)
    if (deleteError) setProblem(errorMessage(deleteError))
    reload()
  }

  if (loading && !data) return <EmptyState title="Loading…" />

  return (
    <>
      <ErrorBanner message={error || problem} />
      <form className="admin-card form-card inline-form" onSubmit={save}>
        <label>{editing ? `Rename "${editing.name}"` : 'New event category'}
          <input required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Christening" />
        </label>
        <button className="admin-primary inline">{editing ? 'Save' : 'Add category'}</button>
        {editing && <button type="button" className="ghost-button" onClick={() => { setEditing(null); setName('') }}>Cancel</button>}
      </form>
      <div className="admin-card">
        {(data ?? []).length === 0 ? <EmptyState title="No categories yet" /> : (
          <ul className="doc-list padded">{(data ?? []).map(category => (
            <li key={category.id}>
              <strong>{category.name}</strong>
              <div className="row-actions">
                <button className="reject" onClick={() => { setEditing(category); setName(category.name) }}>Rename</button>
                <button className="reject" onClick={() => void remove(category)}>Delete</button>
              </div>
            </li>
          ))}</ul>
        )}
      </div>
    </>
  )
}
