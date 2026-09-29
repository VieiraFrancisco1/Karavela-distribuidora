import { writeCloudinaryMediaConfig } from './_cloudinary'

export async function POST(request: Request) {
  try {
    const config = await request.json()
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return Response.json({ message: 'Configuração de fotos inválida.' }, { status: 400 })
    }

    const saved = await writeCloudinaryMediaConfig(config)

    return Response.json({ ok: true, url: saved.secure_url, config }, {
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('save-media-config:', error)
    const message = error instanceof Error ? error.message : 'Falha ao salvar as configurações.'
    return Response.json({ message }, { status: 500 })
  }
}
