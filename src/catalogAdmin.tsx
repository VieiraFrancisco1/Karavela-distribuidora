import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CatalogBrand, CatalogCategory, CatalogConfig, Product } from './types'

type CatalogSection = 'products' | 'brands' | 'categories'

const CATALOG_EDITOR_IMAGE_REV = Date.now()
const freshCatalogEditorImageUrl = (url?: string | null) => {
  if (!url) return ''
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}admincb=${CATALOG_EDITOR_IMAGE_REV}`
}

type Props = {
  section: CatalogSection
  products: Product[]
  brands: CatalogBrand[]
  categories: CatalogCategory[]
  config: CatalogConfig
  onSaved: (config: CatalogConfig) => void
}

const slugify = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70)

const readApiError = async (response: Response) => {
  try {
    const data = await response.json() as { message?: string; error?: string }
    return data.message || data.error || `Erro ${response.status}.`
  } catch {
    return `Erro ${response.status}.`
  }
}

async function saveCatalog(next: CatalogConfig) {
  const response = await fetch('/api/catalog-config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  })
  if (!response.ok) throw new Error(await readApiError(response))
  const data = await response.json() as { ok?: boolean; config?: CatalogConfig }
  if (!data.ok || !data.config) throw new Error('O servidor não confirmou o salvamento do catálogo.')
  return data.config
}

async function prepareCatalogImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.')
  if (file.size <= 3_600_000) return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'))
      img.src = objectUrl
    })

    let maxSide = 2600
    let quality = 0.92
    let blob: Blob | null = null

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * ratio))
      const height = Math.max(1, Math.round(image.naturalHeight * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Não foi possível preparar esta imagem.')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality))
      if (blob && blob.size <= 3_600_000) break
      maxSide = Math.round(maxSide * 0.84)
      quality = Math.max(0.78, quality - 0.04)
    }

    if (!blob || blob.size > 3_600_000) throw new Error('A imagem é muito grande. Escolha uma foto menor.')
    return new File([blob], 'catalogo.webp', { type: 'image/webp' })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function uploadCatalogImage(file: File, kind: 'brand' | 'category', id: string) {
  const prepared = await prepareCatalogImage(file)
  const form = new FormData()
  form.append('file', prepared, prepared.name)
  form.append('kind', kind)
  form.append('id', id)
  const response = await fetch('/api/upload-catalog-image', { method: 'POST', body: form })
  if (!response.ok) throw new Error(await readApiError(response))
  const data = await response.json() as { ok?: boolean; url?: string }
  if (!data.ok || !data.url) throw new Error('O servidor não retornou a nova imagem.')
  return data.url
}


const CATALOG_MIN_SCALE = 0.5
const CATALOG_MAX_SCALE = 3.5
const CATALOG_PAN_LIMIT = 60
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const catalogImageStyle = (item: { imageScale?: number; imageX?: number; imageY?: number }) => ({
  transform: `translate(${item.imageX ?? 0}%, ${item.imageY ?? 0}%) scale(${item.imageScale ?? 1})`,
  transformOrigin: 'center center',
})

function CatalogImageEditor({
  src,
  scale = 1,
  x = 0,
  y = 0,
  onChange,
}: {
  src: string
  scale?: number
  x?: number
  y?: number
  onChange: (next: { imageScale: number; imageX: number; imageY: number }) => void
}) {
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  const update = (next: Partial<{ imageScale: number; imageX: number; imageY: number }>) => {
    onChange({
      imageScale: clamp(next.imageScale ?? scale, CATALOG_MIN_SCALE, CATALOG_MAX_SCALE),
      imageX: clamp(next.imageX ?? x, -CATALOG_PAN_LIMIT, CATALOG_PAN_LIMIT),
      imageY: clamp(next.imageY ?? y, -CATALOG_PAN_LIMIT, CATALOG_PAN_LIMIT),
    })
  }

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x, y }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current
    const rect = frame.current?.getBoundingClientRect()
    if (!current || current.pointerId !== event.pointerId || !rect) return
    update({
      imageX: current.x + ((event.clientX - current.startX) / Math.max(1, rect.width)) * 100,
      imageY: current.y + ((event.clientY - current.startY) / Math.max(1, rect.height)) * 100,
    })
    event.preventDefault()
  }

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  return <div className="catalog-image-editor">
    <div
      ref={frame}
      className="catalog-image-edit-frame"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <img
        src={freshCatalogEditorImageUrl(src)}
        alt=""
        draggable={false}
        style={catalogImageStyle({ imageScale: scale, imageX: x, imageY: y })}
      />
      <span>Arraste a imagem para posicionar</span>
    </div>

    <div className="catalog-image-adjustments">
      <div className="catalog-image-editor-title">Editar imagem do card</div>
      <label>
        <span>Zoom <b>{Math.round(scale * 100)}%</b></span>
        <input type="range" min={CATALOG_MIN_SCALE} max={CATALOG_MAX_SCALE} step="0.01" value={scale} onChange={event => update({ imageScale: Number(event.target.value) })}/>
      </label>
      <label>
        <span>Horizontal <b>{Math.round(x)}%</b></span>
        <input type="range" min={-CATALOG_PAN_LIMIT} max={CATALOG_PAN_LIMIT} step="1" value={x} onChange={event => update({ imageX: Number(event.target.value) })}/>
      </label>
      <label>
        <span>Vertical <b>{Math.round(y)}%</b></span>
        <input type="range" min={-CATALOG_PAN_LIMIT} max={CATALOG_PAN_LIMIT} step="1" value={y} onChange={event => update({ imageY: Number(event.target.value) })}/>
      </label>
      <div className="catalog-image-nudge-row">
        <button type="button" onClick={() => update({ imageX: x - 2 })}>←</button>
        <button type="button" onClick={() => update({ imageY: y - 2 })}>↑</button>
        <button type="button" onClick={() => update({ imageY: y + 2 })}>↓</button>
        <button type="button" onClick={() => update({ imageX: x + 2 })}>→</button>
      </div>
      <div className="catalog-image-reset-row">
        <button type="button" className="catalog-reset-image" onClick={() => update({ imageX: 0, imageY: 0 })}>Centralizar</button>
        <button type="button" className="catalog-reset-image" onClick={() => onChange({ imageScale: 1, imageX: 0, imageY: 0 })}>Voltar ao padrão</button>
      </div>
    </div>
  </div>
}

export function CatalogManager({ section, products, brands, categories, config, onSaved }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState(brands[0]?.id ?? '')
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? '')
  const [brandDraft, setBrandDraft] = useState<CatalogBrand | null>(brands[0] ? { ...brands[0] } : null)
  const [categoryDraft, setCategoryDraft] = useState<CatalogCategory | null>(categories[0] ? { ...categories[0] } : null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [imageTarget, setImageTarget] = useState<'brand' | 'category'>('brand')

  useEffect(() => {
    if (selectedBrandId.startsWith('new-brand-')) return
    const current = brands.find(item => item.id === selectedBrandId) ?? brands[0]
    if (current) {
      setSelectedBrandId(current.id)
      setBrandDraft({ ...current })
    } else {
      setBrandDraft(null)
    }
  }, [brands, selectedBrandId])

  useEffect(() => {
    if (selectedCategoryId.startsWith('new-category-')) return
    const current = categories.find(item => item.id === selectedCategoryId) ?? categories[0]
    if (current) {
      setSelectedCategoryId(current.id)
      setCategoryDraft({ ...current })
    } else {
      setCategoryDraft(null)
    }
  }, [categories, selectedCategoryId])

  useEffect(() => {
    setQuery('')
    setMessage('')
  }, [section])

  const productRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return products
    return products.filter(product => `${product.name} ${product.category} ${product.size}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [products, query])

  const persist = async (next: CatalogConfig, success: string) => {
    setBusy(true)
    setMessage('')
    try {
      const saved = await saveCatalog(next)
      onSaved(saved)
      setMessage(success)
      return saved
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Excluir "${product.name}" do catálogo? Ele deixará de aparecer para os clientes.`)) return
    const hidden = [...new Set([...(config.hiddenProductIds ?? []), product.id])]
    await persist({ ...config, hiddenProductIds: hidden }, 'Item excluído do catálogo.')
  }

  const selectBrand = (brand: CatalogBrand) => {
    setSelectedBrandId(brand.id)
    setBrandDraft({ ...brand })
    setMessage('')
  }

  const addBrand = () => {
    const id = `new-brand-${Date.now()}`
    const next: CatalogBrand = { id, name: 'Nova marca', image: null, accent: '#ff7a1a' }
    setSelectedBrandId(id)
    setBrandDraft(next)
    setMessage('Defina o nome e, se quiser, adicione a logo. Depois salve.')
  }

  const saveBrand = async () => {
    if (!brandDraft) return
    const name = brandDraft.name.trim()
    if (!name) {
      setMessage('Digite o nome da marca.')
      return
    }
    const isNew = selectedBrandId.startsWith('new-brand-')
    const baseId = slugify(name) || `marca-${Date.now()}`
    const id = isNew
      ? (brands.some(item => item.id === baseId) ? `${baseId}-${Date.now()}` : baseId)
      : brandDraft.id
    const row = { ...brandDraft, id, name }
    const nextBrands = isNew
      ? [...brands, row]
      : brands.map(item => item.id === selectedBrandId ? row : item)
    const saved = await persist({ ...config, brands: nextBrands }, 'Marca salva.')
    if (saved) {
      setSelectedBrandId(id)
      setBrandDraft(row)
    }
  }

  const deleteBrand = async () => {
    if (!brandDraft || selectedBrandId.startsWith('new-brand-')) {
      setBrandDraft(null)
      return
    }
    if (!window.confirm(`Excluir a marca "${brandDraft.name}"?`)) return
    const nextBrands = brands.filter(item => item.id !== brandDraft.id)
    const saved = await persist({ ...config, brands: nextBrands }, 'Marca excluída.')
    if (saved) {
      const next = nextBrands[0]
      setSelectedBrandId(next?.id ?? '')
      setBrandDraft(next ? { ...next } : null)
    }
  }

  const selectCategory = (category: CatalogCategory) => {
    setSelectedCategoryId(category.id)
    setCategoryDraft({ ...category })
    setMessage('')
  }

  const addCategory = () => {
    const id = `new-category-${Date.now()}`
    const next: CatalogCategory = { id, label: 'Nova categoria', icon: 'bottle', image: null }
    setSelectedCategoryId(id)
    setCategoryDraft(next)
    setMessage('Defina o nome e, se quiser, adicione uma imagem. Depois salve.')
  }

  const saveCategory = async () => {
    if (!categoryDraft) return
    const label = categoryDraft.label.trim()
    if (!label) {
      setMessage('Digite o nome da categoria.')
      return
    }
    const isNew = selectedCategoryId.startsWith('new-category-')
    const baseId = slugify(label) || `categoria-${Date.now()}`
    const id = isNew
      ? (categories.some(item => item.id === baseId) ? `${baseId}-${Date.now()}` : baseId)
      : categoryDraft.id
    const row = { ...categoryDraft, id, label }
    const nextCategories = isNew
      ? [...categories, row]
      : categories.map(item => item.id === selectedCategoryId ? row : item)
    const saved = await persist({ ...config, categories: nextCategories }, 'Categoria salva.')
    if (saved) {
      setSelectedCategoryId(id)
      setCategoryDraft(row)
    }
  }

  const deleteCategory = async () => {
    if (!categoryDraft || selectedCategoryId.startsWith('new-category-')) {
      setCategoryDraft(null)
      return
    }
    if (!window.confirm(`Excluir a categoria "${categoryDraft.label}"? Os itens dela deixarão de aparecer no catálogo.`)) return
    const nextCategories = categories.filter(item => item.id !== categoryDraft.id)
    const categoryProductIds = products.filter(product => product.categoryId === categoryDraft.id).map(product => product.id)
    const hidden = [...new Set([...(config.hiddenProductIds ?? []), ...categoryProductIds])]
    const saved = await persist({ ...config, categories: nextCategories, hiddenProductIds: hidden }, 'Categoria excluída.')
    if (saved) {
      const next = nextCategories[0]
      setSelectedCategoryId(next?.id ?? '')
      setCategoryDraft(next ? { ...next } : null)
    }
  }

  const chooseImage = (kind: 'brand' | 'category') => {
    setImageTarget(kind)
    if (imageInput.current) {
      imageInput.current.value = ''
      imageInput.current.click()
    }
  }

  const handleImage = async (file: File) => {
    const target = imageTarget === 'brand' ? brandDraft : categoryDraft
    if (!target) return
    setBusy(true)
    setMessage('Enviando imagem...')
    try {
      const url = await uploadCatalogImage(file, imageTarget, target.id)
      if (imageTarget === 'brand') {
        setBrandDraft(previous => previous ? { ...previous, image: url, imageScale: 1, imageX: 0, imageY: 0 } : previous)
      } else {
        setCategoryDraft(previous => previous ? { ...previous, image: url, imageScale: 1, imageX: 0, imageY: 0 } : previous)
      }
      setMessage('Imagem carregada. Ajuste o enquadramento e clique em salvar para confirmar.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.')
    } finally {
      setBusy(false)
      if (imageInput.current) imageInput.current.value = ''
    }
  }

  return <div className="catalog-admin">
    <input
      ref={imageInput}
      hidden
      type="file"
      accept="image/*"
      onChange={event => {
        const file = event.target.files?.[0]
        if (file) void handleImage(file)
      }}
    />

    {section === 'products' && <>
      <div className="catalog-admin-toolbar">
        <div><h3>Itens do catálogo</h3><p>Exclua qualquer produto que não deve mais aparecer no site.</p></div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar item..."/>
      </div>
      <div className="catalog-product-admin-list">
        {productRows.map(product => <article key={product.id}>
          <img src={product.image} alt=""/>
          <div><strong>{product.name}</strong><span>{product.category}{product.size ? ` • ${product.size}` : ''}</span></div>
          <button disabled={busy} onClick={() => void deleteProduct(product)}>Excluir</button>
        </article>)}
      </div>
    </>}

    {section === 'brands' && <div className="catalog-split">
      <aside className="catalog-entity-list">
        <div className="catalog-entity-list-head"><h3>Principais marcas</h3><button onClick={addBrand}>+ Adicionar marca</button></div>
        {brands.map(brand => <button key={brand.id} className={selectedBrandId === brand.id ? 'active' : ''} onClick={() => selectBrand(brand)}>
          {brand.image ? <span className="catalog-list-image-frame"><img src={freshCatalogEditorImageUrl(brand.image)} alt="" style={catalogImageStyle(brand)}/></span> : <span className="catalog-placeholder">{brand.name.slice(0, 1)}</span>}
          <strong>{brand.name}</strong>
        </button>)}
      </aside>
      <section className="catalog-entity-editor">
        {brandDraft ? <>
          <h3>{selectedBrandId.startsWith('new-brand-') ? 'Adicionar marca' : 'Editar marca'}</h3>
          {brandDraft.image
            ? <CatalogImageEditor
                src={brandDraft.image}
                scale={brandDraft.imageScale}
                x={brandDraft.imageX}
                y={brandDraft.imageY}
                onChange={next => setBrandDraft(previous => previous ? { ...previous, ...next } : previous)}
              />
            : <div className="catalog-image-preview"><span>Sem logo</span></div>}
          <label><span>Nome</span><input value={brandDraft.name} onChange={event => setBrandDraft(previous => previous ? { ...previous, name: event.target.value } : previous)}/></label>
          <div className="catalog-editor-actions">
            <button className="catalog-photo-button" disabled={busy} onClick={() => chooseImage('brand')}>Adicionar / trocar imagem</button>
            <button className="catalog-save-button" disabled={busy} onClick={() => void saveBrand()}>Salvar marca</button>
            <button className="catalog-delete-button" disabled={busy} onClick={() => void deleteBrand()}>Excluir</button>
          </div>
        </> : <div className="catalog-empty-editor">Adicione uma marca para começar.</div>}
      </section>
    </div>}

    {section === 'categories' && <div className="catalog-split">
      <aside className="catalog-entity-list">
        <div className="catalog-entity-list-head"><h3>Categorias</h3><button onClick={addCategory}>+ Adicionar categoria</button></div>
        {categories.map(category => <button key={category.id} className={selectedCategoryId === category.id ? 'active' : ''} onClick={() => selectCategory(category)}>
          {category.image ? <span className="catalog-list-image-frame"><img src={freshCatalogEditorImageUrl(category.image)} alt="" style={catalogImageStyle(category)}/></span> : <span className="catalog-placeholder">◻</span>}
          <strong>{category.label}</strong>
        </button>)}
      </aside>
      <section className="catalog-entity-editor">
        {categoryDraft ? <>
          <h3>{selectedCategoryId.startsWith('new-category-') ? 'Adicionar categoria' : 'Editar categoria'}</h3>
          {categoryDraft.image
            ? <CatalogImageEditor
                src={categoryDraft.image}
                scale={categoryDraft.imageScale}
                x={categoryDraft.imageX}
                y={categoryDraft.imageY}
                onChange={next => setCategoryDraft(previous => previous ? { ...previous, ...next } : previous)}
              />
            : <div className="catalog-image-preview"><span>Ícone padrão</span></div>}
          <label><span>Nome</span><input value={categoryDraft.label} onChange={event => setCategoryDraft(previous => previous ? { ...previous, label: event.target.value } : previous)}/></label>
          <div className="catalog-editor-actions">
            <button className="catalog-photo-button" disabled={busy} onClick={() => chooseImage('category')}>Adicionar / trocar imagem</button>
            <button className="catalog-save-button" disabled={busy} onClick={() => void saveCategory()}>Salvar categoria</button>
            <button className="catalog-delete-button" disabled={busy} onClick={() => void deleteCategory()}>Excluir</button>
          </div>
        </> : <div className="catalog-empty-editor">Adicione uma categoria para começar.</div>}
      </section>
    </div>}

    {message && <div className="catalog-admin-message">{message}</div>}
  </div>
}
