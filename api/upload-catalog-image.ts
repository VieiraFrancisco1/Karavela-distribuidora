import { uploadCatalogImageToCloudinary } from './_cloudinary.js'

const MAX_IMAGE_BYTES = 8_000_000

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    const kind = String(form.get('kind') || '')
    const id = String(form.get('id') || '')

    if (!(file instanceof File)) {
      return Response.json({ message: 'Selecione uma imagem.' }, { status: 400 })
    }
    if (kind !== 'brand' && kind !== 'category') {
      return Response.json({ message: 'Tipo de imagem inválido.' }, { status: 400 })
    }
    if (!id.trim()) {
      return Response.json({ message: 'Identificador inválido.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return Response.json({ message: 'Envie um arquivo de imagem.' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json({ message: 'A imagem deve ter no máximo 8 MB.' }, { status: 400 })
    }

    const uploaded = await uploadCatalogImageToCloudinary(file, kind, id)
    return Response.json({ ok: true, url: uploaded.url })
  } catch (error) {
    console.error('upload-catalog-image:', error)
    return Response.json(
      { message: error instanceof Error ? error.message : 'Não foi possível enviar a imagem.' },
      { status: 500 },
    )
  }
}
