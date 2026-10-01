import { createHash } from 'node:crypto'

const CONFIG_PUBLIC_ID = 'karavela-distribuidora/config/media-config.json'
const CATALOG_CONFIG_PUBLIC_ID = 'karavela-distribuidora/config/catalog-config.json'

type CloudinaryEnv = {
  cloudName: string
  apiKey: string
  apiSecret: string
}

function envValue(name: string) {
  return String(process.env[name] || '').trim()
}

export function isCloudinaryConfigured() {
  return Boolean(
    envValue('CLOUDINARY_CLOUD_NAME') &&
    envValue('CLOUDINARY_API_KEY') &&
    envValue('CLOUDINARY_API_SECRET')
  )
}

function getEnv(): CloudinaryEnv {
  const cloudName = envValue('CLOUDINARY_CLOUD_NAME')
  const apiKey = envValue('CLOUDINARY_API_KEY')
  const apiSecret = envValue('CLOUDINARY_API_SECRET')

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary ainda não está configurado neste projeto.')
  }

  return { cloudName, apiKey, apiSecret }
}

function signUpload(parameters: Record<string, string>, apiSecret: string) {
  const serialized = Object.entries(parameters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  return createHash('sha1')
    .update(`${serialized}${apiSecret}`)
    .digest('hex')
}

async function cloudinaryError(response: Response) {
  try {
    const data = await response.json() as { error?: { message?: string }; message?: string }
    return data.error?.message || data.message || `Cloudinary retornou erro ${response.status}.`
  } catch {
    return `Cloudinary retornou erro ${response.status}.`
  }
}

async function signedUpload(
  resourceType: 'image' | 'raw',
  file: File,
  publicId: string,
) {
  const env = getEnv()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signedParameters = {
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId,
    timestamp,
  }
  const signature = signUpload(signedParameters, env.apiSecret)

  const form = new FormData()
  form.append('file', file, file.name)
  form.append('api_key', env.apiKey)
  form.append('timestamp', timestamp)
  form.append('public_id', publicId)
  form.append('overwrite', 'true')
  form.append('invalidate', 'true')
  form.append('signature', signature)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudName)}/${resourceType}/upload`,
    {
      method: 'POST',
      body: form,
    },
  )

  if (!response.ok) throw new Error(await cloudinaryError(response))

  return await response.json() as {
    secure_url?: string
    public_id?: string
    version?: number
    resource_type?: string
  }
}

export async function uploadProductImageToCloudinary(
  file: File,
  productId: string,
  slot: 'card' | 'detail',
) {
  const publicId = `karavela-distribuidora/products/${productId}/${slot}`
  const data = await signedUpload('image', file, publicId)

  if (!data.secure_url) throw new Error('O Cloudinary não retornou a URL da imagem.')

  return {
    url: data.secure_url,
    publicId: data.public_id || publicId,
    version: data.version,
  }
}

export async function uploadCatalogImageToCloudinary(
  file: File,
  kind: 'brand' | 'category',
  id: string,
) {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120)
  if (!safeId) throw new Error('Identificador inválido para a imagem.')

  const folder = kind === 'brand' ? 'brands' : 'categories'
  const publicId = `karavela-distribuidora/${folder}/${safeId}`
  const data = await signedUpload('image', file, publicId)

  if (!data.secure_url) throw new Error('O Cloudinary não retornou a URL da imagem.')

  const cacheBuster = data.version ?? Date.now()
  const separator = data.secure_url.includes('?') ? '&' : '?'

  return {
    url: `${data.secure_url}${separator}cb=${cacheBuster}`,
    publicId: data.public_id || publicId,
    version: data.version,
  }
}

async function readCloudinaryJson<T extends object>(publicId: string): Promise<T | null> {
  if (!isCloudinaryConfigured()) return null

  const { cloudName, apiKey, apiSecret } = getEnv()
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`

  // Busca primeiro os metadados do recurso pela Admin API. Isso devolve a
  // versão atual do arquivo e evita reler uma versão antiga do JSON pelo CDN
  // logo depois de um overwrite.
  const resourceResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/raw/upload/${encodeURIComponent(publicId)}`,
    {
      cache: 'no-store',
      headers: { authorization },
    },
  )

  if (resourceResponse.status === 404) return null

  if (resourceResponse.ok) {
    const resource = await resourceResponse.json() as {
      secure_url?: string
      version?: number
    }

    if (resource.secure_url) {
      const separator = resource.secure_url.includes('?') ? '&' : '?'
      const currentUrl = `${resource.secure_url}${separator}cb=${resource.version ?? Date.now()}`
      const currentResponse = await fetch(currentUrl, { cache: 'no-store' })

      if (currentResponse.status === 404) return null
      if (!currentResponse.ok) {
        throw new Error(`Não foi possível ler a configuração atual do Cloudinary (${currentResponse.status}).`)
      }

      const currentData = await currentResponse.json()
      if (!currentData || typeof currentData !== 'object' || Array.isArray(currentData)) return null
      return currentData as T
    }
  }

  // Fallback para instalações antigas/casos em que a consulta de metadados
  // não estiver disponível.
  const fallbackUrl = `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/raw/upload/${publicId}?cb=${Date.now()}`
  const fallbackResponse = await fetch(fallbackUrl, { cache: 'no-store' })
  if (fallbackResponse.status === 404) return null
  if (!fallbackResponse.ok) {
    throw new Error(`Não foi possível ler a configuração do Cloudinary (${fallbackResponse.status}).`)
  }

  const fallbackData = await fallbackResponse.json()
  if (!fallbackData || typeof fallbackData !== 'object' || Array.isArray(fallbackData)) return null
  return fallbackData as T
}

export async function readCloudinaryMediaConfig<T extends object>(): Promise<T | null> {
  return readCloudinaryJson<T>(CONFIG_PUBLIC_ID)
}

export async function readCloudinaryCatalogConfig<T extends object>(): Promise<T | null> {
  return readCloudinaryJson<T>(CATALOG_CONFIG_PUBLIC_ID)
}

async function writeCloudinaryJson(config: object, publicId: string, filename: string) {
  const file = new File(
    [JSON.stringify(config)],
    filename,
    { type: 'application/json' },
  )

  const data = await signedUpload('raw', file, publicId)
  if (!data.secure_url) throw new Error('O Cloudinary não confirmou o salvamento das configurações.')

  return data
}

export async function writeCloudinaryMediaConfig(config: object) {
  return writeCloudinaryJson(config, CONFIG_PUBLIC_ID, 'media-config.json')
}

export async function writeCloudinaryCatalogConfig(config: object) {
  return writeCloudinaryJson(config, CATALOG_CONFIG_PUBLIC_ID, 'catalog-config.json')
}
