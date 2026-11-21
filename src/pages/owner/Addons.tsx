import { useState } from 'react'
import type { FormEvent } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { useAuth } from '../../lib/auth'
import { peso, safeFileName } from '../../lib/format'
import { fetchMyBusiness } from '../../lib/owner'
import { db, errorMessage, publicImageUrl } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { askConfirm } from '../../components/AskDialog'

type PricingType = 'flat' | 'per_person' | 'per_item'
type Kind = 'food' | 'other'

type Addon = {
  id: string
  kind: Kind
  name: string
  description: string | null
  category: string | null
  image_path: string | null
  price: number
  pricing_type: PricingType
  max_quantity: number | null
  is_active: boolean
}

// Suggestions for the food category; the caterer's own package course names are added too.
const COMMON_CATEGORIES = ['Main dish', 'Pork', 'Chicken', 'Beef', 'Seafood', 'Vegetables', 'Noodles', 'Rice', 'Soup', 'Dessert', 'Drinks']

const PRICING_LABEL: Record<PricingType, string> = { flat: 'flat', per_person: 'per guest', per_item: 'each' }

type Draft = { id: string | null; kind: Kind; name: string; category: string; description: string; image_path: string | null; price: string; pricing_type: PricingType; max_quantity: string }

const EMPTY_FOOD: Draft = { id: null, kind: 'food', name: '', category: '', description: '', image_path: null, price: '', pricing_type: 'per_person', max_quantity: '' }
const EMPTY_OTHER: Draft = { id: null, kind: 'other', name: '', category: '', description: '', image_path: null, price: '', pricing_type: 'flat', max_quantity: '' }

export default function Addons() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    if (!business) return null
    const [{ data: rows, error: loadError }, { data: courses }] = await Promise.all([
      db().from('business_addons')
        .select('id,kind,name,category,description,image_path,price,pricing_type,max_quantity,is_active').eq('business_id', business.id).order('sort_order').order('created_at'),
      db().from('package_courses').select('name,catering_packages!inner(business_id)').eq('catering_packages.business_id', business.id),
    ])
    if (loadError) throw loadError
    const courseNames = (courses ?? []).map(course => String(course.name).trim()).filter(Boolean)
    return { business, addons: rows as Addon[], courseNames }
  }, [userId])

  const [draft, setDraft] = useState<Draft | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  async function uploadPhoto(file: File | undefined) {
    if (!file || !draft) return
    if (!file.type.startsWith('image/')) { setProblem('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setProblem('Images must be 5 MB or smaller.'); return }
    setBusy(true); setProblem('')
    try {
      const path = `${userId}/addons/${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db().storage.from('catering-public').upload(path, file)
      if (uploadError) throw uploadError
      setDraft(current => current && { ...current, image_path: path })
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !data) return
    setBusy(true); setProblem('')
    try {
      const payload = {
        business_id: data.business.id,
        kind: draft.kind,
        name: draft.name.trim(),
        category: draft.kind === 'food' ? draft.category.trim() || null : null,
        description: draft.description.trim() || null,
        image_path: draft.image_path,
        price: Number(draft.price),
        pricing_type: draft.pricing_type,
        max_quantity: draft.pricing_type === 'per_item' && draft.max_quantity ? Number(draft.max_quantity) : null,
      }
      const result = draft.id
        ? await db().from('business_addons').update(payload).eq('id', draft.id)
        : await db().from('business_addons').insert({ ...payload, sort_order: data.addons.length })
      if (result.error) throw result.error
      setDraft(null)
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(addon: Addon) {
    setProblem('')
    const { error: updateError } = await db().from('business_addons').update({ is_active: !addon.is_active }).eq('id', addon.id)
    if (updateError) setProblem(errorMessage(updateError))
    reload()
  }

  async function remove(addon: Addon) {
    if (!(await askConfirm({ title: `Delete "${addon.name}"?`, description: 'Customers will no longer see this add-on. Past bookings keep their own copy.', confirmLabel: 'Delete', danger: true }))) return
    setProblem('')
    const { error: deleteError } = await db().from('business_addons').delete().eq('id', addon.id)
    if (deleteError) setProblem(errorMessage(deleteError))
    reload()
  }

  function edit(addon: Addon) {
    setProblem('')
    setDraft({
      id: addon.id, kind: addon.kind, name: addon.name, category: addon.category ?? '', description: addon.description ?? '', image_path: addon.image_path,
      price: String(addon.price), pricing_type: addon.pricing_type, max_quantity: addon.max_quantity != null ? String(addon.max_quantity) : '',
    })
  }

  if (loading && !data) return <EmptyState title="Loading add-ons…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return <EmptyState title="Create your business profile first">Add-ons belong to a business.</EmptyState>

  const categories = [...new Set([...data.courseNames, ...data.addons.map(addon => addon.category?.trim() ?? ''), ...COMMON_CATEGORIES].filter(Boolean))]
  const food = data.addons.filter(addon => addon.kind === 'food')
    .sort((a, b) => (a.category ?? '~').localeCompare(b.category ?? '~'))
  const other = data.addons.filter(addon => addon.kind !== 'food')
  const photo = draft ? publicImageUrl(draft.image_path) : null

  const list = (title: string, items: Addon[], empty: string) => (
    <div className="admin-card">
      <div className="card-heading"><div><h2>{title}</h2></div></div>
      {items.length === 0 ? <p className="muted-note padded-note">{empty}</p> : (
        <ul className="doc-list padded">{items.map(addon => {
          const thumb = publicImageUrl(addon.image_path)
          return (
            <li key={addon.id} className={addon.is_active ? '' : 'inactive'}>
              <div className="addon-row">
                {thumb ? <img className="addon-thumb" src={thumb} alt="" /> : <span className="addon-thumb empty" aria-hidden="true" />}
                <div>
                  <strong>{addon.name}{!addon.is_active && <span className="status suspended">Hidden</span>}</strong>
                  <small>{addon.kind === 'food' && addon.category ? `${addon.category} · ` : ''}{peso(addon.price)} {PRICING_LABEL[addon.pricing_type]}{addon.max_quantity ? ` (up to ${addon.max_quantity})` : ''}{addon.description ? ` · ${addon.description}` : ''}</small>
                </div>
              </div>
              <div className="row-actions">
                <button className="reject" onClick={() => edit(addon)}>Edit</button>
                <button className="reject" onClick={() => void toggle(addon)}>{addon.is_active ? 'Hide' : 'Show'}</button>
                <button className="reject" onClick={() => void remove(addon)}>Delete</button>
              </div>
            </li>
          )
        })}</ul>
      )}
    </div>
  )

  return (
    <>
      <ErrorBanner message={problem} />
      <div className="toolbar">
        <p className="muted-note">Extras customers can add to a booking. <strong>Food add-ons</strong> appear as an extra menu with photos; the price is added to the customer's total when they pick it.</p>
        <div className="row-actions">
          <button className="admin-primary inline" onClick={() => { setProblem(''); setDraft(EMPTY_FOOD) }}>+ Food add-on</button>
          <button className="ghost-button" onClick={() => { setProblem(''); setDraft(EMPTY_OTHER) }}>+ Rental or service</button>
        </div>
      </div>

      {draft && (
        <form className="admin-card form-card" onSubmit={save}>
          <div className="card-heading"><div><p className="eyebrow">{draft.id ? 'Edit add-on' : draft.kind === 'food' ? 'New food add-on' : 'New rental or service'}</p><h2>{draft.name || 'Add-on details'}</h2></div></div>
          <div className="form-grid">
            <label>Type
              <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as Kind })}>
                <option value="food">Food (extra dish)</option>
                <option value="other">Rental or service</option>
              </select>
            </label>
            <label>Name<input required minLength={2} maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={draft.kind === 'food' ? 'e.g. Lechon Kawali, Leche Flan' : 'e.g. Tiffany chair, Photo booth'} /></label>
            {draft.kind === 'food' && (
              <label>Category <small>(like your package menu)</small>
                <input list="addon-categories" maxLength={60} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} placeholder="e.g. Main dish, Noodles, Drinks" />
                <datalist id="addon-categories">{categories.map(name => <option key={name} value={name} />)}</datalist>
              </label>
            )}
            <label className="wide">Description <small>(optional)</small><textarea rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <div className="wide addon-photo-field">
              <span>Photo <small>(optional)</small></span>
              <div className="addon-row">
                {photo ? <img className="addon-thumb large" src={photo} alt="" /> : <span className="addon-thumb large empty" aria-hidden="true" />}
                <label className="ghost-button file-button">
                  {busy ? 'Uploading…' : photo ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" hidden disabled={busy} onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = '' }} />
                </label>
                {photo && <button type="button" className="ghost-button" onClick={() => setDraft({ ...draft, image_path: null })}>Remove</button>}
              </div>
            </div>
            <label>Price (PHP)<input type="number" required min={0} step="0.01" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label>
            <label>Charged
              <select value={draft.pricing_type} onChange={event => setDraft({ ...draft, pricing_type: event.target.value as PricingType })}>
                <option value="per_person">Per guest</option>
                <option value="per_item">Per item / tray (customer picks quantity)</option>
                <option value="flat">One time (flat fee)</option>
              </select>
            </label>
            {draft.pricing_type === 'per_item' && (
              <label>Most a customer can order <small>(optional)</small><input type="number" min={1} step={1} value={draft.max_quantity} onChange={event => setDraft({ ...draft, max_quantity: event.target.value })} placeholder="No limit" /></label>
            )}
          </div>
          <div className="form-actions">
            <button className="admin-primary inline" disabled={busy}>{busy ? 'Saving…' : 'Save add-on'}</button>
            <button type="button" className="ghost-button" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}

      {data.addons.length === 0 && !draft
        ? <EmptyState title="No add-ons yet">Add extra food or rentals to earn more from each booking.</EmptyState>
        : <div className="addon-lists">
          {list('Food add-ons (extra menu)', food, 'No food add-ons yet. Customers who want more food can pick these.')}
          {list('Rentals & services', other, 'No rentals or services yet.')}
        </div>}
    </>
  )
}
