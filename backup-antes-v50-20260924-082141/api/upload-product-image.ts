import { put } from '@vercel/blob'

function safeProductId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
}

const CONFIG_PREFIX = 'karavela-admin/media-config-v35/'
const MAX_CONFIG_BYTES = 350_000

const extensionForType = (type: string) => {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/avif') return 'avif'
  return 'jpg'
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const action = String(form.get('action') || '')

    // Usa a Function de upload (que já funciona no projeto) também para persistir
    // a configuração do editor. O arquivo recebe um nome novo a cada salvamento,
    // evitando overwrite, conflito de cache e a Function separada que estava falhando.
    if (action === 'save-config') {
      // V36: recebe o JSON como File e envia ao Blob exatamente pelo mesmo caminho
      // usado no upload das fotos. Assim evitamos criar um Blob no runtime da Function,
      // que era o trecho que continuava derrubando a invocação no Vercel.
      const configFile = form.get('file')
      if (!(configFile instanceof File) || configFile.size <= 0 || configFile.size > MAX_CONFIG_BYTES) {
        return Response.json({ message: 'Configuração de fotos inválida ou muito grande.' }, { status: 400 })
      }

      const raw = await configFile.text()
      let config: unknown
      try { config = JSON.parse(raw) } catch {
        return Response.json({ message: 'Configuração de fotos inválida.' }, { status: 400 })
      }
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return Response.json({ message: 'Configuração de fotos inválida.' }, { status: 400 })
      }

      const pathname = `${CONFIG_PREFIX}config-${Date.now()}.json`
      const blob = await put(pathname, configFile, {
        access: 'public',
        addRandomSuffix: true,
      })

      return Response.json({ ok: true, config, url: blob.url, pathname: blob.pathname }, {
        headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
      })
    }

    const file = form.get('file')
    const productId = safeProductId(String(form.get('productId') || ''))
    const slot = String(form.get('slot') || '') === 'detail' ? 'detail' : 'card'

    if (!productId || !(file instanceof File)) {
      return Response.json({ message: 'Arquivo ou produto inválido.' }, { status: 400 })
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      return Response.json({ message: 'Envie uma imagem JPG, PNG, WEBP ou AVIF.' }, { status: 400 })
    }
    if (file.size > 4_200_000) {
      return Response.json({ message: 'A imagem ficou grande demais para o envio. Tente outra foto ou reduza o arquivo.' }, { status: 413 })
    }

    const ext = extensionForType(file.type)
    const pathname = `karavela-admin/products/${productId}/${slot}-${Date.now()}.${ext}`
    const blob = await put(pathname, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || `image/${ext}`,
      cacheControlMaxAge: 31536000,
    })

    return Response.json({ url: blob.url, pathname: blob.pathname, uploadedAt: Date.now() }, {
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('upload-product-image:', error)
    const message = error instanceof Error ? error.message : 'Falha ao concluir a operação.'
    return Response.json({ message }, { status: 500 })
  }
}
