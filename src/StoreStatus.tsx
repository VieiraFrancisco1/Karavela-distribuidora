import { useEffect, useState } from 'react'
import { isStoreOpen } from './storeHours'

export default function StoreStatus() {
  const [open, setOpen] = useState(() => isStoreOpen())

  useEffect(() => {
    const refresh = () => setOpen(isStoreOpen())
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return <span className={`store-status ${open ? 'store-status--open' : 'store-status--closed'}`} role="status">
    <span className="store-status-dot" aria-hidden="true"/>
    {open ? 'Aberto' : 'Fechado'}
  </span>
}
