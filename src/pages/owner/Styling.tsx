import { useState } from 'react'
import type { FormEvent } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { useAuth } from '../../lib/auth'
import { peso, safeFileName } from '../../lib/format'
import { fetchMyBusiness } from '../../lib/owner'
import { db, errorMessage, publicImageUrl } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { askConfirm } from '../../components/AskDialog'
import { toast, useToastMessage } from '../../lib/toast'

type Kind = 'design' | 'theme' | 'color' | 'flower'
type PricingType = 'flat' | 'per_person' | 'per_table'

type StylingOption = {
  id: string
  kind: Kind
  name: string
  description: string | null
  image_path: string | null
  color_hex: string | null
  price: number
  pricing_type: PricingType
  is_active: boolean
}

type Draft = {
  id: string | null
  kind: Kind
  name: string
  description: string
  image_path: string | null
  color_hex: string
  price: string
  pricing_type: PricingType
}

const KINDS: { kind: Kind; title: string; hint: string; example: string }[] = [
  { kind: 'design', title: 'Event designs', hint: 'Complete setups such as table layout, backdrop and centerpieces.', example: 'e.g. Garden elegance setup' },
  { kind: 'theme', title: 'Themes', hint: 'The style or mood of the event.', example: 'e.g. Rustic, Boho, Royal' },
  { kind: 'color', title: 'Color motifs', hint: 'Color combinations for linens, drapes and accents.', example: 'e.g. Sage & gold' },
  { kind: 'flower', title: 'Flower arrangements', hint: 'Customers may pick more than one arrangement.', example: 'e.g. Fresh rose centerpieces' },
]

const PRICING_LABEL: Record<PricingType, string> = { flat: 'flat', per_person: 'per guest', per_table: 'per table' }

const emptyDraft = (kind: Kind): Draft => ({ id: null, kind, name: '', description: '', image_path: null, color_hex: '', price: '', pricing_type: 'flat' })

export default function Styling() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    if (!business) return null
    const [{ data: rows, error: loadError }, { data: seating, error: seatingError }] = await Promise.all([
      db().from('business_styling_options')
        .select('id,kind,name,description,image_path,color_hex,price,pricing_type,is_active')
        .eq('business_id', business.id).order('sort_order').order('created_at'),
      db().from('catering_businesses').select('guests_per_table').eq('id', business.id).single(),
    ])
    if (loadError) throw loadError
    if (seatingError) throw seatingError
    return { business, options: rows as StylingOption[], guestsPerTable: (seating as { guests_per_table: number }).guests_per_table }
  }, [userId])

  const [draft, setDraft] = useState<Draft | null>(null)
  const [problem, setProblem] = useToastMessage('error')
  const [busy, setBusy] = useState(false)
  const [seats, setSeats] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !data) return
    setBusy(true); setProblem('')
    try {
      const payload = {
        business_id: data.business.id,
        kind: draft.kind,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        image_path: draft.image_path,
        color_hex: draft.kind === 'color' && draft.color_hex ? draft.color_hex : null,
        price: Number(draft.price || 0),
        pricing_type: draft.pricing_type,
      }
      const result = draft.id
        ? await db().from('business_styling_options').update(payload).eq('id', draft.id)
        : await db().from('business_styling_options').insert({ ...payload, sort_order: data.options.filter(o => o.kind === draft.kind).length })
      if (result.error) throw result.error
      setDraft(null)
      toast('Styling option saved.')
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !draft) return
    if (!file.type.startsWith('image/')) { setProblem('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setProblem('Images must be 5 MB or smaller.'); return }
    setBusy(true); setProblem('')
    try {
      const path = `${userId}/styling/${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db().storage.from('catering-public').upload(path, file)
      if (uploadError) throw uploadError
      setDraft(current => (current ? { ...current, image_path: path } : current))
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(option: StylingOption) {
    setProblem('')
    const { error: updateError } = await db().from('business_styling_options').update({ is_active: !option.is_active }).eq('id', option.id)
    if (updateError) setProblem(errorMessage(updateError))
    reload()
  }

  async function remove(option: StylingOption) {
    if (!(await askConfirm({ title: `Delete "${option.name}"?`, description: 'Customers will no longer see this styling option. Past bookings keep their own copy.', confirmLabel: 'Delete', danger: true }))) return
    setProblem('')
    const { error: deleteError } = await db().from('business_styling_options').delete().eq('id', option.id)
    if (deleteError) setProblem(errorMessage(deleteError))
    else toast('Styling option deleted.')
    reload()
  }

  async function saveSeats(event: FormEvent) {
    event.preventDefault()
    if (!data || seats == null) return
    setProblem('')
    const value = Number(seats)
    if (!Number.isInteger(value) || value < 1 || value > 50) { setProblem('Guests per table must be a whole number from 1 to 50.'); return }
    const { error: updateError } = await db().from('catering_businesses').update({ guests_per_table: value }).eq('id', data.business.id)
    if (updateError) setProblem(errorMessage(updateError))
    else { setSeats(null); reload() }
  }

  if (loading && !data) return <EmptyState title="Loading styling options…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return <EmptyState title="Create your business profile first">Styling options belong to a business.</EmptyState>

  const seatValue = seats ?? String(data.guestsPerTable)

  return (
    <>
      <ErrorBanner message={problem} />
      <div className="toolbar">
        <p className="muted-note">Designs, themes, colors and flowers customers can pick when booking. Prices are added to their estimate as they choose.</p>
      </div>

      <form className="admin-card form-card" onSubmit={saveSeats}>
        <div className="card-heading"><div><p className="eyebrow">Table pricing</p><h2>Guests per table</h2></div></div>
        <div className="form-grid">
          <label>Guests seated at one table
            <input type="number" min={1} max={50} step={1} required value={seatValue} onChange={event => setSeats(event.target.value)} />
          </label>
          <p className="muted-note">Options priced per table are charged for guests ÷ {seatValue || '?'} tables, rounded up. 100 guests = {Math.ceil(100 / Math.max(1, Number(seatValue) || 1))} tables.</p>
        </div>
        {seats != null && seats !== String(data.guestsPerTable) && (
          <div className="form-actions"><button className="admin-primary inline">Save</button></div>
        )}
      </form>

      {KINDS.map(({ kind, title, hint }) => {
        const options = data.options.filter(option => option.kind === kind)
        return (
          <div key={kind}>
            {draft?.kind === kind && renderForm(draft)}
            <div className="admin-card">
              <div className="card-heading">
                <div><p className="eyebrow">{hint}</p><h2>{title}</h2></div>
                <button className="admin-primary inline" onClick={() => { setProblem(''); setDraft(emptyDraft(kind)) }}>+ Add</button>
              </div>
              {options.length === 0 ? <p className="muted-note padded-note">None yet.</p> : (
                <ul className="doc-list padded">{options.map(option => (
                  <li key={option.id} className={option.is_active ? '' : 'inactive'}>
                    <div className="styling-row">
                      {option.image_path
                        ? <img className="styling-thumb" src={publicImageUrl(option.image_path) ?? ''} alt="" />
                        : option.color_hex
                          ? <span className="styling-thumb" style={{ background: option.color_hex }} />
                          : <span className="styling-thumb empty">No photo</span>}
                      <div>
                        <strong>{option.name}{!option.is_active && <span className="status suspended">Hidden</span>}</strong>
                        <small>{Number(option.price) === 0 ? 'Included' : `${peso(option.price)} ${PRICING_LABEL[option.pricing_type]}`}{option.description ? ` · ${option.description}` : ''}</small>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="reject" onClick={() => setDraft({
                        id: option.id, kind: option.kind, name: option.name, description: option.description ?? '',
                        image_path: option.image_path, color_hex: option.color_hex ?? '', price: String(option.price), pricing_type: option.pricing_type,
                      })}>Edit</button>
                      <button className="reject" onClick={() => void toggle(option)}>{option.is_active ? 'Hide' : 'Show'}</button>
                      <button className="reject" onClick={() => void remove(option)}>Delete</button>
                    </div>
                  </li>
                ))}</ul>
              )}
            </div>
          </div>
        )
      })}
    </>
  )

  function renderForm(draft: Draft) {
    return (
        <form className="admin-card form-card styling-form" onSubmit={save}>
          <div className="card-heading"><div><p className="eyebrow">{draft.id ? 'Edit' : 'New'} {KINDS.find(k => k.kind === draft.kind)!.title.toLowerCase().replace(/s$/, '')}</p><h2>{draft.name || 'Details'}</h2></div></div>
          <div className="form-grid">
            <label className="wide">Name<input required minLength={2} maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={KINDS.find(k => k.kind === draft.kind)!.example} /></label>
            <label className="wide">Description <small>(optional)</small><textarea rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <label>Price (PHP)<input type="number" min={0} step="0.01" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} placeholder="0 = included" /></label>
            <label>Charged
              <select value={draft.pricing_type} onChange={event => setDraft({ ...draft, pricing_type: event.target.value as PricingType })}>
                <option value="flat">One time (flat fee)</option>
                <option value="per_person">Per guest</option>
                <option value="per_table">Per table</option>
              </select>
            </label>
            {draft.kind === 'color' && (
              <label>Main color <small>(optional swatch)</small>
                <input type="color" value={draft.color_hex || '#c9a227'} onChange={event => setDraft({ ...draft, color_hex: event.target.value })} />
              </label>
            )}
            <label className="wide">Photo <small>(recommended, customers choose by picture)</small>
              <span className="thumb-row">
                {draft.image_path && <figure><img src={publicImageUrl(draft.image_path) ?? ''} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setDraft({ ...draft, image_path: null })}>×</button></figure>}
                <span className="thumb-add">{busy ? 'Uploading…' : draft.image_path ? 'Replace' : '+ Photo'}
                  <input type="file" accept="image/*" hidden disabled={busy} onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = '' }} />
                </span>
              </span>
            </label>
          </div>
          <div className="form-actions">
            <button className="admin-primary inline" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="ghost-button" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
    )
  }
}
