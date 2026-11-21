import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ArrowLeft, Camera, CaretDown, CaretUp, Eye, EyeSlash, ForkKnife, Image as ImageIcon, Minus, PencilSimple, Plus, Trash, UsersThree, X } from '@phosphor-icons/react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { useAuth } from '../../lib/auth'
import { byPackageName, peso, safeFileName } from '../../lib/format'
import { fetchMyBusiness } from '../../lib/owner'
import { db, errorMessage, publicImageUrl } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type PackageRow = {
  id: string
  name: string
  description: string | null
  price: number
  minimum_guests: number
  included_services: string[]
  is_archived: boolean
  pax_options: number[]
  package_courses: { id: string; name: string; max_choices: number; sort_order: number; package_dishes: { id: string; name: string; sort_order: number; extra_price: number | null; description: string | null; image_path: string | null }[] }[]
  package_images: { id: string; file_path: string; sort_order: number }[]
  package_event_types: { event_category_id: string }[]
}

type DishDraft = { name: string; description: string; image_path: string | null }
type CourseDraft = { name: string; max: number; dishes: DishDraft[] }
type Draft = {
  id: string | null
  name: string
  description: string
  price: string
  minimum_guests: string
  services: string[]
  courses: CourseDraft[]
  categories: string[]
  pax: number[]
}

const NEW_DRAFT: Draft = { id: null, name: '', description: '', price: '', minimum_guests: '50', services: [], courses: [], categories: [], pax: [] }
const COURSE_PRESETS = ['Main dish', 'Noodles or pasta', 'Vegetables', 'Dessert', 'Drinks']
const emptyDish = (): DishDraft => ({ name: '', description: '', image_path: null })
const sortBy = <T extends { sort_order: number }>(rows: T[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order)

export default function Packages() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    if (!business) return { business: null, packages: [] as PackageRow[], categories: [] as { id: string; name: string }[], pax: [] as number[] }
    const [packages, categories, paxRow] = await Promise.all([
      db().from('catering_packages')
        .select('id,name,description,price,minimum_guests,included_services,is_archived,pax_options,package_images(id,file_path,sort_order),package_event_types(event_category_id),package_courses(id,name,max_choices,sort_order,package_dishes(id,name,sort_order,extra_price,description,image_path))')
        .eq('business_id', business.id).order('created_at', { ascending: true }),
      db().from('event_categories').select('id,name').order('name'),
      db().from('catering_businesses').select('pax_options').eq('id', business.id).single(),
    ])
    if (packages.error) throw packages.error
    if (categories.error) throw categories.error
    if (paxRow.error) throw paxRow.error
    return { business, packages: packages.data as unknown as PackageRow[], categories: categories.data as { id: string; name: string }[], pax: ((paxRow.data as { pax_options: number[] | null }).pax_options ?? []) }
  }, [userId])

  const [draft, setDraft] = useState<Draft | null>(null)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [serviceInput, setServiceInput] = useState('')

  function open(pack: PackageRow | null) {
    setProblem(''); setNotice(''); setServiceInput('')
    if (!pack) { setDraft(NEW_DRAFT); return }
    setDraft({
      id: pack.id,
      name: pack.name,
      description: pack.description ?? '',
      price: String(pack.price),
      minimum_guests: String(pack.minimum_guests),
      services: pack.included_services,
      courses: sortBy(pack.package_courses).map(course => ({
        name: course.name,
        max: course.max_choices,
        dishes: sortBy(course.package_dishes).map(dish => ({
          name: dish.name,
          description: dish.description ?? '', image_path: dish.image_path,
        })),
      })),
      categories: pack.package_event_types.map(row => row.event_category_id),
      pax: pack.pax_options ?? [],
    })
  }

  function patch(next: Partial<Draft>) { setDraft(current => current && { ...current, ...next }) }
  function patchCourse(index: number, next: Partial<CourseDraft>) {
    setDraft(current => current && { ...current, courses: current.courses.map((c, i) => (i === index ? { ...c, ...next } : c)) })
  }
  function patchDish(courseIndex: number, dishIndex: number, next: Partial<DishDraft>) {
    setDraft(current => current && {
      ...current,
      courses: current.courses.map((course, ci) => (ci !== courseIndex ? course : { ...course, dishes: course.dishes.map((d, di) => (di === dishIndex ? { ...d, ...next } : d)) })),
    })
  }
  function moveCourse(index: number, by: -1 | 1) {
    setDraft(current => {
      if (!current) return current
      const courses = [...current.courses]
      const target = index + by
      if (target < 0 || target >= courses.length) return current
      ;[courses[index], courses[target]] = [courses[target], courses[index]]
      return { ...current, courses }
    })
  }

  function addService(event?: KeyboardEvent<HTMLInputElement>) {
    if (event && event.key !== 'Enter') return
    event?.preventDefault()
    const value = serviceInput.trim()
    if (!draft || !value || draft.services.includes(value)) { setServiceInput(''); return }
    patch({ services: [...draft.services, value] }); setServiceInput('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !data?.business) return
    setBusy(true); setProblem(''); setNotice('')
    try {
      const courses = draft.courses
        .map(course => ({
          name: course.name.trim(),
          max: Math.max(1, course.max),
          // Package menus are fixed: dishes have no extra price (customers pick up to the course limit).
          dishes: course.dishes
            .map(dish => ({ name: dish.name.trim(), extra: null, description: dish.description.trim() || null, image_path: dish.image_path }))
            .filter(dish => dish.name),
        }))
        .filter(course => course.name && course.dishes.length > 0)
      if (new Set(courses.map(course => course.name.toLowerCase())).size !== courses.length) throw new Error('Each course needs a different name.')
      const tooFew = courses.find(course => course.max > course.dishes.length)
      if (tooFew) throw new Error(`"${tooFew.name}" lets guests pick ${tooFew.max} but only has ${tooFew.dishes.length} dish${tooFew.dishes.length === 1 ? '' : 'es'}.`)

      // MARSHALLING: builds the package as a plain object that Supabase sends as JSON
      // (insert/update below, then event types, courses and dishes).
      const payload = {
        business_id: data.business.id,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        price: Number(draft.price),
        // The database sets minimum guests to the smallest pax this package is offered for.
        minimum_guests: draft.pax.length ? Math.min(...draft.pax) : Number(draft.minimum_guests),
        included_services: draft.services,
        pax_options: draft.pax,
      }
      let packageId = draft.id
      if (packageId) {
        const { error: updateError } = await db().from('catering_packages').update(payload).eq('id', packageId)
        if (updateError) throw updateError
      } else {
        const { data: created, error: insertError } = await db().from('catering_packages').insert(payload).select('id').single()
        if (insertError) throw insertError
        packageId = created.id as string
      }
      const { error: clearError } = await db().from('package_event_types').delete().eq('package_id', packageId)
      if (clearError) throw clearError
      if (draft.categories.length > 0) {
        const { error: linkError } = await db().from('package_event_types').insert(draft.categories.map(id => ({ package_id: packageId, event_category_id: id })))
        if (linkError) throw linkError
      }
      const { error: dropCoursesError } = await db().from('package_courses').delete().eq('package_id', packageId)
      if (dropCoursesError) throw dropCoursesError
      for (const [index, course] of courses.entries()) {
        const { data: createdCourse, error: courseError } = await db().from('package_courses')
          .insert({ package_id: packageId, name: course.name, max_choices: course.max, sort_order: index }).select('id').single()
        if (courseError) throw courseError
        const { error: dishError } = await db().from('package_dishes')
          .insert(course.dishes.map((dish, order) => ({ course_id: createdCourse.id, name: dish.name, extra_price: dish.extra, description: dish.description, image_path: dish.image_path, sort_order: order })))
        if (dishError) throw dishError
      }
      if (!draft.id) {
        // Stay in the editor so photos (which need the saved package) can be added right away.
        setDraft({ ...draft, id: packageId })
        setNotice('Package saved. Add a few photos below so customers can see your setup.')
      } else {
        setDraft(null)
      }
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function uploadDishPhoto(courseIndex: number, dishIndex: number, file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setProblem('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setProblem('Images must be 5 MB or smaller.'); return }
    setBusy(true); setProblem('')
    try {
      const path = `${userId}/dishes/${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db().storage.from('catering-public').upload(path, file)
      if (uploadError) throw uploadError
      patchDish(courseIndex, dishIndex, { image_path: path })
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggleArchive(pack: PackageRow) {
    setProblem('')
    const { error: updateError } = await db().from('catering_packages').update({ is_archived: !pack.is_archived }).eq('id', pack.id)
    if (updateError) setProblem(errorMessage(updateError))
    else reload()
  }

  async function addImages(pack: PackageRow, files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true); setProblem('')
    try {
      let order = pack.package_images.length
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.')
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MB.`)
        const path = `${userId}/${pack.id}/${Date.now()}-${safeFileName(file.name)}`
        const { error: uploadError } = await db().storage.from('catering-public').upload(path, file)
        if (uploadError) throw uploadError
        const { error: rowError } = await db().from('package_images').insert({ package_id: pack.id, file_path: path, sort_order: order++ })
        if (rowError) { await db().storage.from('catering-public').remove([path]); throw rowError }
      }
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeImage(image: PackageRow['package_images'][number]) {
    setProblem('')
    try {
      const { error: rowError } = await db().from('package_images').delete().eq('id', image.id)
      if (rowError) throw rowError
      await db().storage.from('catering-public').remove([image.file_path])
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    }
  }

  if (loading && !data) return <EmptyState title="Loading packages…" />
  if (error) return <ErrorBanner message={error} />
  if (!data?.business) return <EmptyState title="Create your business profile first">Packages belong to a business. Add your business details under Business profile.</EmptyState>

  /* ---------------- Editor ---------------- */
  if (draft) {
    const saved = draft.id ? data.packages.find(pack => pack.id === draft.id) : undefined
    const price = Number(draft.price) || 0
    const guests = Number(draft.minimum_guests) || 0
    const dishCount = draft.courses.reduce((sum, course) => sum + course.dishes.filter(d => d.name.trim()).length, 0)
    const cover = saved?.package_images.length ? publicImageUrl(sortBy(saved.package_images)[0].file_path) : null

    return (
      <form className="pk-editor" onSubmit={save}>
        <div className="pk-editor-top">
          <button type="button" className="pk-back" onClick={() => setDraft(null)}><ArrowLeft size={16} /> All packages</button>
          <h2>{draft.id ? `Edit ${draft.name || 'package'}` : 'New package'}</h2>
        </div>
        <ErrorBanner message={problem} />
        {notice && <p className="form-notice">{notice}</p>}

        <div className="pk-editor-grid">
          <div className="pk-steps">
            <section className="admin-card pk-step">
              <header><span>1</span><div><h3>Basics</h3><p>What customers see first.</p></div></header>
              <label className="pk-field">Package name
                <input required minLength={2} maxLength={150} value={draft.name} placeholder="e.g. Basic Feast Package" onChange={event => patch({ name: event.target.value })} />
              </label>
              <label className="pk-field"><span>Short description <small>optional</small></span>
                <textarea rows={2} value={draft.description} placeholder="e.g. A full Filipino buffet for birthdays and family gatherings." onChange={event => patch({ description: event.target.value })} />
              </label>
              <div className="pk-field">
                <span>Good for these events</span>
                <div className="pk-toggles">{data.categories.map(category => {
                  const on = draft.categories.includes(category.id)
                  return (
                    <button type="button" key={category.id} className={on ? 'on' : ''} aria-pressed={on}
                      onClick={() => patch({ categories: on ? draft.categories.filter(id => id !== category.id) : [...draft.categories, category.id] })}>
                      {category.name}
                    </button>
                  )
                })}</div>
              </div>
            </section>

            <section className="admin-card pk-step">
              <header><span>2</span><div><h3>Price and pax</h3><p>Customers pay per guest for the pax they choose. Add-ons and styling are added on top.</p></div></header>
              <label className="pk-field">Price per guest
                <span className="pk-affix"><i>₱</i><input type="number" required min={0} step="0.01" value={draft.price} placeholder="450" onChange={event => patch({ price: event.target.value })} /></span>
              </label>
              <div className="pk-field">
                <span>Offered for <small>customers only see this package for the pax you tick</small></span>
                {data.pax.length === 0
                  ? <p className="pk-warn">Add your pax options at the top of the Packages page first (for example 50, 70, 100, 150 pax).</p>
                  : <div className="pk-toggles">{data.pax.map(pax => {
                      const on = draft.pax.includes(pax)
                      return (
                        <button type="button" key={pax} className={on ? 'on' : ''} aria-pressed={on}
                          onClick={() => patch({ pax: on ? draft.pax.filter(p => p !== pax) : [...draft.pax, pax].sort((a, b) => a - b) })}>
                          {pax} pax
                        </button>
                      )
                    })}</div>}
                {data.pax.length > 0 && draft.pax.length === 0 && <p className="pk-warn">Tick at least one pax, or this package stays hidden from customers.</p>}
              </div>
              {price > 0 && draft.pax.length > 0 && (
                <p className="pk-example">{draft.pax.map(pax => `${pax} pax × ${peso(price)} = ${peso(price * pax)}`).join(' · ')}</p>
              )}
            </section>

            <section className="admin-card pk-step">
              <header><span>3</span><div><h3>Menu</h3><p>Group dishes into courses. For each course, choose how many dishes guests may pick.</p></div></header>
              {draft.courses.map((course, index) => (
                <div key={index} className="pk-course">
                  <div className="pk-course-head">
                    <input className="pk-course-name" value={course.name} placeholder="Course name" aria-label="Course name" onChange={event => patchCourse(index, { name: event.target.value })} />
                    <div className="pk-stepper" aria-label="How many dishes guests can pick">
                      <span>Guests pick</span>
                      <button type="button" aria-label="Fewer" disabled={course.max <= 1} onClick={() => patchCourse(index, { max: course.max - 1 })}><Minus size={12} weight="bold" /></button>
                      <b>{course.max}</b>
                      <button type="button" aria-label="More" disabled={course.max >= 20} onClick={() => patchCourse(index, { max: course.max + 1 })}><Plus size={12} weight="bold" /></button>
                    </div>
                    <div className="pk-icon-actions">
                      <button type="button" aria-label="Move course up" disabled={index === 0} onClick={() => moveCourse(index, -1)}><CaretUp size={14} /></button>
                      <button type="button" aria-label="Move course down" disabled={index === draft.courses.length - 1} onClick={() => moveCourse(index, 1)}><CaretDown size={14} /></button>
                      <button type="button" aria-label="Remove course" onClick={() => patch({ courses: draft.courses.filter((_, i) => i !== index) })}><Trash size={14} /></button>
                    </div>
                  </div>
                  <ul className="pk-dishes">
                    {course.dishes.map((dish, dishIndex) => (
                      <li key={dishIndex}>
                        <label className="pk-dish-photo" title={dish.image_path ? 'Change photo' : 'Add a photo'}>
                          {dish.image_path ? <img src={publicImageUrl(dish.image_path) ?? ''} alt="" /> : <Camera size={18} />}
                          <input type="file" accept="image/*" hidden disabled={busy} onChange={event => { void uploadDishPhoto(index, dishIndex, event.target.files?.[0]); event.target.value = '' }} />
                        </label>
                        <div className="pk-dish-text">
                          <input value={dish.name} placeholder="Dish name, e.g. Chicken adobo" aria-label="Dish name" onChange={event => patchDish(index, dishIndex, { name: event.target.value })} />
                          <input value={dish.description} placeholder="Short note (optional)" aria-label="Dish note" className="pk-note" onChange={event => patchDish(index, dishIndex, { description: event.target.value })} />
                        </div>
                        <button type="button" className="pk-remove" aria-label="Remove dish" onClick={() => patchCourse(index, { dishes: course.dishes.filter((_, di) => di !== dishIndex) })}><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="pk-add-dish" onClick={() => patchCourse(index, { dishes: [...course.dishes, emptyDish()] })}><Plus size={14} /> Add dish</button>
                </div>
              ))}
              <div className="pk-presets">
                <span>Add a course:</span>
                {COURSE_PRESETS.filter(name => !draft.courses.some(c => c.name.toLowerCase() === name.toLowerCase())).map(name => (
                  <button type="button" key={name} onClick={() => patch({ courses: [...draft.courses, { name, max: 1, dishes: [emptyDish()] }] })}><Plus size={12} /> {name}</button>
                ))}
                <button type="button" onClick={() => patch({ courses: [...draft.courses, { name: '', max: 1, dishes: [emptyDish()] }] })}><Plus size={12} /> Other</button>
              </div>
            </section>

            <section className="admin-card pk-step">
              <header><span>4</span><div><h3>What's included</h3><p>Services that come with this package. Press Enter after each one.</p></div></header>
              <div className="pk-chips">
                {draft.services.map(service => (
                  <span key={service}>{service}<button type="button" aria-label={`Remove ${service}`} onClick={() => patch({ services: draft.services.filter(s => s !== service) })}><X size={12} /></button></span>
                ))}
                <input value={serviceInput} placeholder={draft.services.length ? 'Add another' : 'e.g. Buffet setup, Waitstaff, Tables and linens'} onChange={event => setServiceInput(event.target.value)} onKeyDown={addService} onBlur={() => addService()} />
              </div>
            </section>

            <section className="admin-card pk-step">
              <header><span>5</span><div><h3>Photos</h3><p>Show your setup and food. The first photo is the cover.</p></div></header>
              {saved ? (
                <div className="pk-photos">
                  {sortBy(saved.package_images).map((image, i) => (
                    <figure key={image.id}>
                      <img src={publicImageUrl(image.file_path) ?? ''} alt="" />
                      {i === 0 && <figcaption>Cover</figcaption>}
                      <button type="button" aria-label="Remove photo" onClick={() => void removeImage(image)}><X size={12} weight="bold" /></button>
                    </figure>
                  ))}
                  <label className="pk-photo-add"><ImageIcon size={22} />{busy ? 'Uploading…' : 'Add photos'}
                    <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={event => { void addImages(saved, event.target.files); event.target.value = '' }} />
                  </label>
                </div>
              ) : <p className="pk-hint">Save the package first, then you can add photos here.</p>}
            </section>
          </div>

          <aside className="pk-preview">
            <p className="pk-preview-label"><Eye size={14} /> Customer preview</p>
            <div className="admin-card pk-preview-card">
              <div className="pk-cover">{cover ? <img src={cover} alt="" /> : <span><ForkKnife size={28} /></span>}</div>
              <div className="pk-preview-body">
                <h4>{draft.name || 'Package name'}</h4>
                <p className="pk-price">{price ? peso(price) : '₱0'} <small>per guest · min {guests || 0}</small></p>
                {draft.description && <p className="pk-desc">{draft.description}</p>}
                {draft.courses.filter(c => c.name.trim()).map((course, i) => (
                  <div key={i} className="pk-preview-course">
                    <b>{course.name}</b> <small>pick {course.max}</small>
                    <p>{course.dishes.filter(d => d.name.trim()).map(d => d.name.trim()).join(', ') || 'No dishes yet'}</p>
                  </div>
                ))}
                {draft.services.length > 0 && <p className="pk-includes">Includes {draft.services.join(', ')}</p>}
              </div>
            </div>
            <p className="pk-preview-stats">{draft.courses.length} course{draft.courses.length === 1 ? '' : 's'} · {dishCount} dish{dishCount === 1 ? '' : 'es'}</p>
          </aside>
        </div>

        <div className="pk-savebar">
          <button type="button" className="ghost-button" onClick={() => setDraft(null)}>Cancel</button>
          <button className="admin-primary inline" disabled={busy}>{busy ? 'Saving…' : draft.id ? 'Save changes' : 'Create package'}</button>
        </div>
      </form>
    )
  }

  /* ---------------- List ---------------- */
  const live = byPackageName(data.packages.filter(pack => !pack.is_archived))
  const hidden = byPackageName(data.packages.filter(pack => pack.is_archived))
  const card = (pack: PackageRow) => {
    const cover = pack.package_images.length ? publicImageUrl(sortBy(pack.package_images)[0].file_path) : null
    const dishes = pack.package_courses.reduce((sum, course) => sum + course.package_dishes.length, 0)
    const events = data.categories.filter(c => pack.package_event_types.some(t => t.event_category_id === c.id)).map(c => c.name)
    return (
      <article key={pack.id} className={`admin-card pk-card${pack.is_archived ? ' hidden' : ''}`}>
        <button type="button" className="pk-card-cover" onClick={() => open(pack)} aria-label={`Edit ${pack.name}`}>
          {cover ? <img src={cover} alt="" /> : <span><Camera size={22} />No photo yet</span>}
          <em className={pack.is_archived ? 'off' : 'on'}>{pack.is_archived ? 'Hidden' : 'Available'}</em>
        </button>
        <div className="pk-card-body">
          <h3>{pack.name}</h3>
          <p className="pk-price">{peso(pack.price)} <small>per guest</small></p>
          <ul className="pk-meta">
            <li><UsersThree size={15} /> {pack.pax_options?.length ? `${pack.pax_options.join(' · ')} pax` : 'No pax options yet'}</li>
            <li><ForkKnife size={15} /> {pack.package_courses.length} course{pack.package_courses.length === 1 ? '' : 's'}, {dishes} dish{dishes === 1 ? '' : 'es'}</li>
          </ul>
          {events.length > 0 && <p className="pk-events">{events.join(' · ')}</p>}
          {!pack.is_archived && !pack.pax_options?.length && <p className="pk-warn">Hidden from customers: edit it and tick the pax it is offered for.</p>}
          {pack.package_courses.length === 0 && !pack.is_archived && <p className="pk-warn">No menu yet. Customers can't choose dishes.</p>}
        </div>
        <div className="pk-card-actions">
          <button type="button" className="approve" onClick={() => open(pack)}><PencilSimple size={15} /> Edit</button>
          <button type="button" className="reject" onClick={() => void toggleArchive(pack)}>
            {pack.is_archived ? <><Eye size={15} /> Show to customers</> : <><EyeSlash size={15} /> Hide</>}
          </button>
        </div>
      </article>
    )
  }

  return (
    <>
      <ErrorBanner message={problem} />
      <PaxOptions businessId={data.business.id} pax={data.pax} onSaved={reload} />
      <div className="pk-list-top">
        <p className="muted-note">{data.business.verification_status === 'approved' ? 'Available packages appear in the Cuisina app. Click a package to edit it.' : 'Your packages become available once your business is approved.'}</p>
        <button className="admin-primary inline" onClick={() => open(null)}><Plus size={16} weight="bold" /> New package</button>
      </div>
      {data.packages.length === 0 ? (
        <EmptyState title="No packages yet">Create your first package: give it a price per guest and a menu customers can choose from.</EmptyState>
      ) : (
        <>
          <div className="pk-grid">{live.map(card)}</div>
          {hidden.length > 0 && (
            <>
              <h3 className="pk-section-title">Hidden from customers</h3>
              <div className="pk-grid">{hidden.map(card)}</div>
            </>
          )}
        </>
      )}
    </>
  )
}

/** The party sizes this caterer serves (e.g. 50, 70, 100, 150 pax); packages tick which they offer. */
function PaxOptions({ businessId, pax, onSaved }: { businessId: string; pax: number[]; onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function save(next: number[]) {
    setBusy(true); setProblem('')
    const { error: updateError } = await db().from('catering_businesses').update({ pax_options: next }).eq('id', businessId)
    setBusy(false)
    if (updateError) setProblem(errorMessage(updateError))
    else onSaved()
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n < 1 || n > 5000) { setProblem('Enter a number of guests from 1 to 5000.'); return }
    setValue('')
    if (!pax.includes(n)) void save([...pax, n].sort((a, b) => a - b))
  }

  return (
    <section className="admin-card pax-card">
      <div>
        <h3>Your pax options</h3>
        <p className="muted-note">Customers first choose one of these, then see the packages you offer for it. Removing a pax also removes it from your packages.</p>
      </div>
      <div className="pax-row">
        {pax.length === 0 && <span className="muted-note">No pax options yet. Add the party sizes you serve.</span>}
        {pax.map(p => (
          <span key={p} className="pax-chip">{p} pax
            <button type="button" aria-label={`Remove ${p} pax`} disabled={busy} onClick={() => void save(pax.filter(x => x !== p))}><X size={12} weight="bold" /></button>
          </span>
        ))}
        <form className="pax-add" onSubmit={add}>
          <input type="number" min={1} max={5000} step={1} value={value} placeholder="e.g. 50" aria-label="Number of guests" onChange={event => setValue(event.target.value)} />
          <button className="ghost-button" disabled={busy || !value}>Add pax</button>
        </form>
      </div>
      {problem && <p className="form-error">{problem}</p>}
    </section>
  )
}
