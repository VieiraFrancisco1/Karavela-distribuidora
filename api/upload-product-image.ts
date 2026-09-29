import { put } from '@vercel/blob'

function safeProductId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
}

const PATCH_PREFIX = 'karavela-admin/media-patches-v50/'
const MAX_PATCH_BYTES = 180_000

type MediaSlot = 'card' | 'detail'
type MediaViewSettings = { url?: string; scale?: number; x?: number; y?: number }
type MediaPatch = { productId: string; slot: MediaSlot; value: MediaViewSettings | null }

const extensionForType = (type: string) => {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/avif') return 'avif'
  return 'jpg'
}

function sanitizeSettings(value: unknown): MediaViewSettings | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ajuste de imagem inválido.')
  }

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

function sanitizePatch(item: unknown): MediaPatch {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Alteração de imagem inválida.')
  }

  const entry = item as Record<string, unknown>
  const productId = safeProductId(String(entry.productId || ''))
  if (!productId) throw new Error('Produto inválido na alteração de imagem.')

  const slot: MediaSlot = entry.slot === 'detail' ? 'detail' : 'card'
  return {
    productId,
    slot,
    value: sanitizeSettings(entry.value),
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const action = String(form.get('action') || '')

    // Proteção contra abas antigas: versões antigas do editor enviavam a
    // configuração COMPLETA e podiam restaurar fotos antigas por cima das novas.
    if (action === 'save-config' || action === 'patch-config') {
      return Response.json({
        message: 'Esta aba do editor está desatualizada. Atualize a página antes de salvar para proteger suas fotos.',
      }, {
        status: 409,
        headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
      })
    }

    // V50: cada salvamento vira um registro imutável contendo SOMENTE os
    // produtos/slots realmente alterados. Não existe sobrescrita do catálogo inteiro.
    if (action === 'save-media-patches-v50') {
      const patchFile = form.get('file')
      if (!(patchFile instanceof File) || patchFile.size <= 0 || patchFile.size > MAX_PATCH_BYTES) {
        return Response.json({ message: 'Alterações de fotos inválidas ou muito grandes.' }, { status: 400 })
      }

      let payload: unknown
      try {
        payload = JSON.parse(await patchFile.text())
      } catch {
        return Response.json({ message: 'Alterações de fotos inválidas.' }, { status: 400 })
      }

      const rawOperations = (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Array.isArray((payload as { operations?: unknown }).operations)
      )
        ? (payload as { operations: unknown[] }).operations
        : []

      if (rawOperations.length < 1 || rawOperations.length > 100) {
        return Response.json({ message: 'Nenhuma alteração válida foi enviada.' }, { status: 400 })
      }

      const operations = rawOperations.map(sanitizePatch)
      const now = Date.now()
      const persisted = JSON.stringify({
        version: 1,
        createdAt: now,
        operations,
      })

      const blob = await put(
        `${PATCH_PREFIX}patch-${now}.json`,
        new File([persisted], `patch-${now}.json`, { type: 'application/json' }),
        {
          access: 'public',
          addRandomSuffix: true,
        },
      )

      return Response.json({
        ok: true,
        patched: operations.length,
        pathname: blob.pathname,
        url: blob.url,
      }, {
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
