import { list } from '@vercel/blob'
import { isCloudinaryConfigured, readCloudinaryMediaConfig, writeCloudinaryMediaConfig } from './_cloudinary.js'

const LIVE_PREFIX = 'karavela-admin/media-config-v35/'
const CURRENT_CONFIG_PATH = 'karavela-admin/media-config-current.json'
const OLD_PREFIX = 'karavela-admin/media-config/'
const LEGACY_CONFIG_PATH = 'karavela-admin/media-config.json'
const PATCH_PREFIX = 'karavela-admin/media-patches-v50/'

type MediaSlot = 'card' | 'detail'
type MediaViewSettings = { url?: string; scale?: number; x?: number; y?: number }
type MediaConfig = Record<string, { card?: MediaViewSettings; detail?: MediaViewSettings }>
type MediaPatch = { productId: string; slot: MediaSlot; value: MediaViewSettings | null }
type PatchDocument = { version?: number; createdAt?: number; operations?: MediaPatch[] }
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
      if (!latest || currentTime > latestTime) {
        latest = { url: blob.url, uploadedAt: blob.uploadedAt, pathname: blob.pathname }
      }
    }
    if (!page.hasMore || !page.cursor) break
    cursor = page.cursor
  }

  return latest
}

async function readBaseConfig(): Promise<MediaConfig> {
  try {
    // Preserva exatamente a última configuração já existente antes da proteção V50.
    const live = await latestFromPrefix(LIVE_PREFIX)
    if (live) return await readJson(live.url) as MediaConfig

    const current = await latestFromPrefix(CURRENT_CONFIG_PATH, CURRENT_CONFIG_PATH)
    if (current) return await readJson(current.url) as MediaConfig

    const old = await latestFromPrefix(OLD_PREFIX)
    if (old) return await readJson(old.url) as MediaConfig

    const legacy = await latestFromPrefix(LEGACY_CONFIG_PATH, LEGACY_CONFIG_PATH)
    if (legacy) return await readJson(legacy.url) as MediaConfig
  } catch (error) {
    console.error('media-config base:', error)
  }

  return {}
}

async function listPatchBlobs() {
  let cursor: string | undefined
  const blobs: BlobRef[] = []

  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await list({ prefix: PATCH_PREFIX, limit: 100, cursor })
    for (const blob of page.blobs) {
      if (!blob.pathname.endsWith('.json')) continue
      blobs.push({ url: blob.url, uploadedAt: blob.uploadedAt, pathname: blob.pathname })
    }
    if (!page.hasMore || !page.cursor) break
    cursor = page.cursor
  }

  return blobs.sort((a, b) => {
    const aTime = a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : new Date(a.uploadedAt).getTime()
    const bTime = b.uploadedAt instanceof Date ? b.uploadedAt.getTime() : new Date(b.uploadedAt).getTime()
    if (aTime !== bTime) return aTime - bTime
    return String(a.pathname || '').localeCompare(String(b.pathname || ''))
  })
}

function safeProductId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
}

function sanitizeSettings(value: unknown): MediaViewSettings | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  const output: MediaViewSettings = {}

  if (typeof input.url === 'string' && input.url.trim()) output.url = input.url.trim()
  if (typeof input.scale === 'number' && Number.isFinite(input.scale)) {
    output.scale = Math.min(3.5, Math.max(0.5, input.scale))
  }
  if (typeof input.x === 'number' && Number.isFinite(input.x)) {
    output.x = Math.min(60, Math.max(-60, input.x))
  }
  if (typeof input.y === 'number' && Number.isFinite(input.y)) {
    output.y = Math.min(60, Math.max(-60, input.y))
  }

  return output
}

function applyOperation(config: MediaConfig, operation: MediaPatch) {
  const productId = safeProductId(String(operation.productId || ''))
  if (!productId) return

  const slot: MediaSlot = operation.slot === 'detail' ? 'detail' : 'card'
  const value = sanitizeSettings(operation.value)

  if (operation.value === null) {
    const product = { ...(config[productId] ?? {}) }
    delete product[slot]
    if (!product.card && !product.detail) delete config[productId]
    else config[productId] = product
    return
  }

  if (!value) return
  config[productId] = {
    ...(config[productId] ?? {}),
    [slot]: value,
  }
}

export async function readConfig(): Promise<MediaConfig> {
  if (isCloudinaryConfigured()) {
    try {
      const cloudinaryConfig = await readCloudinaryMediaConfig<MediaConfig>()
      if (cloudinaryConfig) return cloudinaryConfig
    } catch (error) {
      console.error('media-config cloudinary:', error)
    }
  }

  const config: MediaConfig = structuredClone(await readBaseConfig())

  // Cada alteração feita a partir da V50 é imutável e aplicada em ordem.
  // Assim editar uma foto nunca regrava nem apaga configurações de outras fotos.
  try {
    const patches = await listPatchBlobs()

    for (const patch of patches) {
      try {
        const document = await readJson(patch.url) as PatchDocument
        if (!Array.isArray(document.operations)) continue
        for (const operation of document.operations) applyOperation(config, operation)
      } catch (error) {
        // Um registro corrompido não derruba todas as outras alterações.
        console.error('media-config patch:', patch.pathname, error)
      }
    }
  } catch (error) {
    console.error('media-config patches list:', error)
  }

  if (isCloudinaryConfigured() && Object.keys(config).length > 0) {
    try {
      await writeCloudinaryMediaConfig(config)
    } catch (error) {
      console.error('media-config migration:', error)
    }
  }

  return config
}

export async function GET() {
  const config = await readConfig()
  return Response.json(config, {
    headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
  })
}
