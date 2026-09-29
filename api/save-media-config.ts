import { put } from '@vercel/blob'

const CONFIG_PREFIX = 'karavela-admin/media-config/'

export async function POST(request: Request) {
  try {
    const config = await request.json()
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return Response.json({ message: 'Configuração de fotos inválida.' }, { status: 400 })
    }

    const pathname = `${CONFIG_PREFIX}media-${Date.now()}.json`
    const blob = await put(pathname, JSON.stringify(config), {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 60,
    })

    return Response.json({ ok: true, url: blob.url, config }, {
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('save-media-config:', error)
    const message = error instanceof Error ? error.message : 'Falha ao salvar as configurações.'
    return Response.json({ message }, { status: 500 })
  }
}
