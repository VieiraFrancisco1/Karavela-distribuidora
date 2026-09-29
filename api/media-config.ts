import { isCloudinaryConfigured, readCloudinaryMediaConfig } from './_cloudinary.js'

type MediaViewSettings = { url?: string; scale?: number; x?: number; y?: number }
export type MediaConfig = Record<string, { card?: MediaViewSettings; detail?: MediaViewSettings }>

export async function readConfig(): Promise<MediaConfig> {
  if (!isCloudinaryConfigured()) return {}

  try {
    const config = await readCloudinaryMediaConfig<MediaConfig>()
    return config ?? {}
  } catch (error) {
    console.error('media-config cloudinary:', error)
    return {}
  }
}

export async function GET() {
  const config = await readConfig()
  return Response.json(config, {
    headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
  })
}
