import { readCloudinaryCatalogConfig, writeCloudinaryCatalogConfig } from './_cloudinary.js'

type CatalogImageAdjustments = {
  imageScale?: number
  imageX?: number
  imageY?: number
}

type CatalogBrand = CatalogImageAdjustments & {
  id: string
  name: string
  image?: string | null
  accent?: string
}

type CatalogCategory = CatalogImageAdjustments & {
  id: string
  label: string
  icon: string
  image?: string | null
}

type CatalogConfig = {
  hiddenProductIds?: string[]
  brands?: CatalogBrand[]
  categories?: CatalogCategory[]
}

const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const cleanId = (value: unknown) => cleanText(value, 120).replace(/[^a-zA-Z0-9_-]/g, '')
const cleanUrl = (value: unknown) => {
  const url = cleanText(value, 1000)
  return url && /^(https:\/\/|\/)/i.test(url) ? url : null
}
const cleanNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}
const imageAdjustments = (row: Record<string, unknown>) => ({
  imageScale: cleanNumber(row.imageScale, 1, 2.5, 1),
  imageX: cleanNumber(row.imageX, -45, 45, 0),
  imageY: cleanNumber(row.imageY, -45, 45, 0),
})

function sanitizeConfig(value: unknown): CatalogConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>

  const hiddenProductIds = Array.isArray(input.hiddenProductIds)
    ? [...new Set(input.hiddenProductIds.map(cleanId).filter(Boolean))].slice(0, 1000)
    : []

  const brands = Array.isArray(input.brands)
    ? input.brands.flatMap((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const row = item as Record<string, unknown>
        const name = cleanText(row.name, 80)
        const id = cleanId(row.id) || `brand-${index + 1}`
        if (!name) return []
        const accent = cleanText(row.accent, 30) || '#ff7a1a'
        return [{ id, name, image: cleanUrl(row.image), accent, ...imageAdjustments(row) }]
      }).slice(0, 100)
    : undefined

  const categories = Array.isArray(input.categories)
    ? input.categories.flatMap((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const row = item as Record<string, unknown>
        const label = cleanText(row.label, 80)
        const id = cleanId(row.id) || `category-${index + 1}`
        if (!label) return []
        const icon = cleanText(row.icon, 40) || 'bottle'
        return [{ id, label, icon, image: cleanUrl(row.image), ...imageAdjustments(row) }]
      }).slice(0, 100)
    : undefined

  return { hiddenProductIds, brands, categories }
}

export async function GET() {
  try {
    const config = await readCloudinaryCatalogConfig<CatalogConfig>()
    return Response.json(sanitizeConfig(config ?? {}), {
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('catalog-config GET:', error)
    return Response.json({}, {
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    })
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const config = sanitizeConfig(payload)
    await writeCloudinaryCatalogConfig(config)
    return Response.json({ ok: true, config }, {
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('catalog-config POST:', error)
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : 'Não foi possível salvar o catálogo.' },
      { status: 500 },
    )
  }
}
