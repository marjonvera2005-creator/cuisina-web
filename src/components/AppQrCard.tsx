import { ArrowsOut, DeviceMobile, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** Link to the Android app in Google Drive (the QR image in /public points here). */
export const APP_DOWNLOAD_LINK = 'https://drive.google.com/drive/folders/1dFuE3UQSNilOgUwKsiWwlF8Pdgl8X1cD?usp=sharing'
const QR_IMAGE = `${import.meta.env.BASE_URL}cuisina-app-qr.png`

const steps = ['Scan with your phone camera', 'Open the folder and download the app file', 'Tap Install (allow "Install unknown apps")']

/** "Get the Cuisina app" card on the administrator overview, with a full-screen view to show the panel. */
export function AppQrCard() {
  const [big, setBig] = useState(false)
  useEffect(() => {
    if (!big) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setBig(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [big])

  return (
    <div className="admin-card">
      <div className="card-heading">
        <div><h2>Get the Cuisina app</h2><p className="eyebrow">Scan to download the Android app</p></div>
        <button type="button" className="outline-button qr-show" onClick={() => setBig(true)}><ArrowsOut size={16} weight="bold" /> Show full screen</button>
      </div>
      <div className="qr-card">
        <button type="button" className="qr-image" onClick={() => setBig(true)} aria-label="Show the QR code full screen">
          <img src={QR_IMAGE} alt="QR code to download the Cuisina Android app" width={180} height={180} />
        </button>
        <div className="qr-info">
          <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>
          <p><DeviceMobile size={16} weight="bold" /> Android phones only</p>
          <a href={APP_DOWNLOAD_LINK} target="_blank" rel="noreferrer">Open the download link</a>
        </div>
      </div>
      {/* Drawn at the top of the app (not inside this card), so the page's entrance animation
          cannot trap the "full screen" view inside the card. */}
      {big && createPortal(
        <div className="qr-full" role="dialog" aria-modal="true" aria-label="Cuisina app QR code" onClick={() => setBig(false)}>
          <div className="qr-full-inner" onClick={event => event.stopPropagation()}>
            <button type="button" className="qr-close" onClick={() => setBig(false)} aria-label="Close"><X size={22} weight="bold" /></button>
            <strong>CUISINA</strong>
            <span>Scan to download the Android app</span>
            <img src={QR_IMAGE} alt="QR code to download the Cuisina Android app" />
            <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>
          </div>
        </div>,
        document.getElementById('root') ?? document.body,
      )}
    </div>
  )
}
