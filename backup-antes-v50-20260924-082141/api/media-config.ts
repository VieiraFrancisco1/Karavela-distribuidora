import { list } from '@vercel/blob'

const LIVE_PREFIX = 'karavela-admin/media-config-v35/'
const CURRENT_CONFIG_PATH = 'karavela-admin/media-config-current.json'
const OLD_PREFIX = 'karavela-admin/media-config/'
const LEGACY_CONFIG_PATH = 'karavela-admin/media-config.json'

type BlobRef = { url: string; uploadedAt: Date | string; pathname?: string }

async function readJson(url: string) {
  const separator = url.includes('?') ? '&' : '?'
  const response = await fetch(`${url}${separator}v=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Falha ao ler as configurações (${response.status}).`)
  return await response.json()
}

async function latestFromPrefix(prefix: string, exactPath?: string) {
  let cursor: string | undefined
  let latest: BlobRef | undefined

  for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
    const page = await list({ prefix, limit: 100, cursor })
    for (const blob of page.blobs) {
      if (exactPath && blob.pathname !== exactPath) continue
      const currentTime = blob.uploadedAt instanceof Date ? blob.uploadedAt.getTime() : new Date(blob.uploadedAt).getTime()
      const latestTime = latest
        ? (latest.uploadedAt instanceof Date ? latest.uploadedAt.getTime() : new Date(latest.uploadedAt).getTime())
        : -1
      if (!latest || currentTime > latestTime) latest = { url: blob.url, uploadedAt: blob.uploadedAt, pathname: blob.pathname }
    }
    if (!page.hasMore || !page.cursor) break
    cursor = page.cursor
  }

  return latest
}

async function readConfig() {
  try {
    // V35: cada salvamento cria um snapshot novo neste prefixo.
    const live = await latestFromPrefix(LIVE_PREFIX)
    if (live) return await readJson(live.url)

    // Compatibilidade com tentativas/versões anteriores.
    const current = await latestFromPrefix(CURRENT_CONFIG_PATH, CURRENT_CONFIG_PATH)
    if (current) return await readJson(current.url)

    const old = await latestFromPrefix(OLD_PREFIX)
    if (old) return await readJson(old.url)

    const legacy = await latestFromPrefix(LEGACY_CONFIG_PATH, LEGACY_CONFIG_PATH)
    if (legacy) return await readJson(legacy.url)
  } catch (error) {
    console.error('media-config GET:', error)
  }
  return {}
}

export async function GET() {
  const config = await readConfig()
  return Response.json(config, {
    headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
  })
}
