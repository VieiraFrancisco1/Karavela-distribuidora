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

function authorization({ apiKey, apiSecret }: CloudinaryEnv) {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`
}

async function cloudinaryError(response: Response) {
  try {
    const data = await response.json() as { error?: { message?: string }; message?: string }
    return data.error?.message || data.message || `Cloudinary retornou erro ${response.status}.`
  } catch {
    return `Cloudinary retornou erro ${response.status}.`
  }
}

export async function uploadProductImageToCloudinary(
  file: File,
  productId: string,
  slot: 'card' | 'detail',
) {
  const env = getEnv()
  const publicId = `karavela-distribuidora/products/${productId}/${slot}`
  const form = new FormData()
  form.append('file', file, file.name || `${slot}.jpg`)
  form.append('public_id', publicId)
  form.append('overwrite', 'true')
  form.append('invalidate', 'true')

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudName)}/image/upload`,
    {
      method: 'POST',
      headers: { Authorization: authorization(env) },
      body: form,
    },
  )

  if (!response.ok) throw new Error(await cloudinaryError(response))

  const data = await response.json() as {
    secure_url?: string
    public_id?: string
    version?: number
    resource_type?: string
  }

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
  const env = getEnv()
  const file = new File(
    [JSON.stringify(config)],
    'media-config.json',
    { type: 'application/json' },
  )

  const form = new FormData()
  form.append('file', file, 'media-config.json')
  form.append('public_id', CONFIG_PUBLIC_ID)
  form.append('overwrite', 'true')
  form.append('invalidate', 'true')

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudName)}/raw/upload`,
    {
      method: 'POST',
      headers: { Authorization: authorization(env) },
      body: form,
    },
  )

  if (!response.ok) throw new Error(await cloudinaryError(response))

  const data = await response.json() as { secure_url?: string; public_id?: string; version?: number }
  if (!data.secure_url) throw new Error('O Cloudinary não confirmou o salvamento das configurações.')

  return data
}
