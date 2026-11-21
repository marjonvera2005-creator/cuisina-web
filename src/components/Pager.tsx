import { CaretLeft, CaretRight } from '@phosphor-icons/react'

/** Cuts a list into pages of `size` rows. `page` starts at 1 and is kept inside the valid range. */
export function paginate<T>(rows: T[], page: number, size = 10) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  return { rows: rows.slice(start, start + size), page: current, pages, from: rows.length ? start + 1 : 0, to: Math.min(start + size, rows.length), total: rows.length }
}

/** "Showing 1–10 of 16" plus Previous / page numbers / Next. Hidden when everything fits on one page. */
export function Pager({ page, pages, from, to, total, onPage, noun = 'rows' }: {
  page: number; pages: number; from: number; to: number; total: number
  onPage: (page: number) => void
  noun?: string
}) {
  if (pages <= 1) return null
  // Show every page when there are few; otherwise first, last and the pages around the current one.
  const numbers: (number | '…')[] = []
  for (let n = 1; n <= pages; n++) {
    if (pages <= 7 || n === 1 || n === pages || Math.abs(n - page) <= 1) numbers.push(n)
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…')
  }
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">Showing <b>{from}–{to}</b> of <b>{total}</b> {noun}</span>
      <div className="pager-buttons">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><CaretLeft size={14} weight="bold" /> Previous</button>
        {numbers.map((n, i) => n === '…'
          ? <span key={`gap-${i}`} className="pager-gap">…</span>
          : <button key={n} type="button" className={n === page ? 'active' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>)}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">Next <CaretRight size={14} weight="bold" /></button>
      </div>
    </nav>
  )
}
