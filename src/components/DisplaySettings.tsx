import { setDisplay, TEXT_SIZES, useDisplay } from '../lib/display'

/** Text size and high contrast controls; changes apply at once and are saved in this browser. */
function DisplayControls() {
  const display = useDisplay()
  return (
    <>
      <fieldset className="display-sizes">
        <legend>Text size</legend>
        {TEXT_SIZES.map(size => (
          <label key={size.value} className={display.textSize === size.value ? 'is-on' : ''}>
            <input type="radio" name="text-size" value={size.value} checked={display.textSize === size.value}
              onChange={() => setDisplay({ textSize: size.value })} />
            <span style={{ fontSize: `${Math.round(14 * size.zoom)}px` }}>{size.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="display-toggle">
        <input type="checkbox" checked={display.highContrast} onChange={event => setDisplay({ highContrast: event.target.checked })} />
        <span><strong>High contrast</strong><small>Darker text and stronger colours, easier to read</small></span>
      </label>
    </>
  )
}

/** Accessibility & display page (sidebar: admin after Platform settings, owner after Help & support). */
export default function DisplaySettingsPage() {
  return (
    <div className="admin-card">
      <div className="card-heading"><div><h2>Accessibility &amp; display</h2><p className="eyebrow">Changes apply at once and are saved in this browser</p></div></div>
      <div className="display-page"><DisplayControls /></div>
    </div>
  )
}
