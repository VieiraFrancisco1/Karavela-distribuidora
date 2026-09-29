import { createHash } from 'node:crypto'

const CONFIG_PUBLIC_ID = 'karavela-distribuidora/config/media-config.json'

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

export async function readCloudinaryMediaConfig<T extends object>(): Promise<T | null> {
  if (!isCloudinaryConfigured()) return null

  const { cloudName } = getEnv()
  const url = `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/raw/upload/${CONFIG_PUBLIC_ID}?v=${Date.now()}`

  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Não foi possível ler a configuração do Cloudinary (${response.status}).`)

  const data = await response.json()
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as T
}

export async function writeCloudinaryMediaConfig(config: object) {
  const file = new File(
    [JSON.stringify(config)],
    'media-config.json',
    { type: 'application/json' },
  )

  const data = await signedUpload('raw', file, CONFIG_PUBLIC_ID)
  if (!data.secure_url) throw new Error('O Cloudinary não confirmou o salvamento das configurações.')

  return data
}
