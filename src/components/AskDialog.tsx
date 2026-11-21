import { useEffect, useState } from 'react'
import { ConfirmDialog } from './Dialog'

// Cuisina's own pop-up, used instead of the browser's "localhost says…" confirm/alert boxes.
//   if (!(await askConfirm({ title: 'Delete add-on?', description: '…', confirmLabel: 'Delete', danger: true }))) return
//   await showMessage({ title: 'Something went wrong', description: message })

type Request = {
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  messageOnly?: boolean
  resolve: (ok: boolean) => void
}

let show: ((request: Request) => void) | null = null

export function askConfirm(options: { title: string; description?: string; confirmLabel: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    if (!show) { resolve(false); return }
    show({ ...options, resolve })
  })
}

export function showMessage(options: { title: string; description?: string }): Promise<void> {
  return new Promise(resolve => {
    if (!show) { resolve(); return }
    show({ ...options, confirmLabel: 'OK', messageOnly: true, resolve: () => resolve() })
  })
}

/** Mounted once in App. Shows whatever askConfirm / showMessage asked for. */
export function AskDialogHost() {
  const [request, setRequest] = useState<Request | null>(null)

  useEffect(() => {
    show = next => setRequest(current => { current?.resolve(false); return next })
    return () => { show = null }
  }, [])

  if (!request) return null
  const close = (ok: boolean) => { request.resolve(ok); setRequest(null) }
  return (
    <ConfirmDialog
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      hideCancel={request.messageOnly}
      danger={request.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  )
}
