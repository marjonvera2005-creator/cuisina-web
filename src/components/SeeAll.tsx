/** How many rows long lists show before "See all". */
export const PREVIEW_ROWS = 7

/** "See all (N)" / "Show less" under a list that only shows its first PREVIEW_ROWS rows. */
export function SeeAllButton({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  if (total <= PREVIEW_ROWS) return null
  return (
    <div className="see-all">
      <button type="button" className="ghost-button" onClick={onToggle}>
        {expanded ? 'Show less' : `See all (${total})`}
      </button>
    </div>
  )
}
