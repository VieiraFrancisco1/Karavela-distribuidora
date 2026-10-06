import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AccountProvider } from './accountSystem'
import type { CatalogConfig } from './types'
import type { MediaConfig } from './mediaAdmin'
import './styles.css'
import './siteUpdates.css'
import './accountSystem.css'

async function loadJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return fallback
    const data = await response.json()
    return data && typeof data === 'object' && !Array.isArray(data) ? data as T : fallback
  } catch {
    return fallback
  }
}

async function bootstrap() {
  const root = document.getElementById('root')!

  const [initialMediaConfig, initialCatalogConfig] = await Promise.all([
    loadJson<MediaConfig>('/api/media-config', {}),
    loadJson<CatalogConfig>('/api/catalog-config', {}),
  ])

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AccountProvider>
        <App
          initialMediaConfig={initialMediaConfig}
          initialCatalogConfig={initialCatalogConfig}
        />
      </AccountProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
