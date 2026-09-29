import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Product } from './types'

export type MediaSlot = 'card' | 'detail'

export type MediaViewSettings = {
  url?: string
  scale?: number
  x?: number
  y?: number
}

export type ProductMediaOverride = {
  card?: MediaViewSettings
  detail?: MediaViewSettings
}

export type MediaConfig = Record<string, ProductMediaOverride>

type StatusKind = 'info' | 'success' | 'error'
type TouchedMedia = Record<string, { card?: true; detail?: true }>

const MIN_SCALE = 0.5
const MAX_SCALE = 3.5
const PAN_LIMIT = 60
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const beerCategoryIds = new Set(['cervejas-lata', 'cervejas-300-unidades', 'long-necks', 'zero-alcool'])

export const normalizedMediaSettings = (settings?: MediaViewSettings): Required<Pick<MediaViewSettings, 'scale' | 'x' | 'y'>> & Pick<MediaViewSettings, 'url'> => ({
  url: settings?.url,
  scale: clamp(settings?.scale ?? 1, MIN_SCALE, MAX_SCALE),
  x: clamp(settings?.x ?? 0, -PAN_LIMIT, PAN_LIMIT),
  y: clamp(settings?.y ?? 0, -PAN_LIMIT, PAN_LIMIT),
})

export const hasMediaOverride = (settings?: MediaViewSettings) => Boolean(settings && (
  settings.url || settings.scale !== undefined || settings.x !== undefined || settings.y !== undefined
))

export const mediaImageStyle = (settings?: MediaViewSettings): CSSProperties => {
  const normalized = normalizedMediaSettings(settings)
  return {
    '--media-scale': String(normalized.scale),
    '--media-x': `${normalized.x}%`,
    '--media-y': `${normalized.y}%`,
  } as CSSProperties
}

type AdminMediaProps = {
  products: Product[]
  config: MediaConfig
  detailImageForProduct: (product: Product) => string
  onClose: () => void
  onSaved: (config: MediaConfig) => void
}

type EditableImageProps = {
  src: string
  settings: MediaViewSettings
  slot: MediaSlot
  onChange: (next: MediaViewSettings) => void
  frameClassName?: string
  imageClassName?: string
  backdropClassName?: string
}

const scenicPreviewCategoryIds = new Set(['whiskys', 'vinhos', 'cachacas', 'vodkas', 'gins', 'licores'])

type PreviewIconName = 'plus' | 'minus' | 'close' | 'cart'

function PreviewIcon({ name }: { name: PreviewIconName }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    close: <><path d="M5 5l14 14M19 5 5 19"/></>,
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
  }

  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function PreviewStatusIcon({ kind }: { kind: 'cold' | 'returnable' }) {
  if (kind === 'cold') {
    return <svg className="mini-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07 19.07 4.93"/>
    </svg>
  }

  return <svg className="mini-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3h4v3.2c0 1.4 2.4 2.8 2.4 5v8.1A2.7 2.7 0 0 1 13.7 22h-3.4a2.7 2.7 0 0 1-2.7-2.7v-8.1c0-2.2 2.4-3.6 2.4-5z"/>
    <path d="M10 5.6h4M8.6 13.4c-1.7-.5-3-1.8-3.6-3.4M4.5 7.7 5 10l2.2-.8M15.4 13.4c1.7-.5 3-1.8 3.6-3.4m.5-2.3L19 10l-2.2-.8"/>
  </svg>
}

function EditableImage({ src, settings, slot, onChange, frameClassName, imageClassName = '', backdropClassName }: EditableImageProps) {
  const pointer = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const normalized = normalizedMediaSettings(settings)
  const managed = hasMediaOverride(settings)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current = {
      id: event.pointerId,
      x: normalized.x,
      y: normalized.y,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointer.current
    if (!active || active.id !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = ((event.clientX - active.startX) / Math.max(1, rect.width)) * 100
    const dy = ((event.clientY - active.startY) / Math.max(1, rect.height)) * 100
    onChange({
      ...settings,
      scale: normalized.scale,
      x: clamp(active.x + dx, -PAN_LIMIT, PAN_LIMIT),
      y: clamp(active.y + dy, -PAN_LIMIT, PAN_LIMIT),
    })
  }

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id === event.pointerId) pointer.current = null
  }

  const frameClass = frameClassName || `admin-live-image-area admin-live-image-area--${slot}`
  const imageClass = `${imageClassName}${managed ? ' media-managed' : ''}`.trim()

  return <div
    className={frameClass}
    style={{ touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={endPointer}
    onPointerCancel={endPointer}
  >
    {backdropClassName && <img className={backdropClassName} src={src} alt="" aria-hidden="true" draggable={false}/>}
    <img
      className={imageClass || undefined}
      src={src}
      alt="Prévia"
      style={managed ? mediaImageStyle(settings) : undefined}
      draggable={false}
    />
    {!frameClassName && <span className="admin-drag-hint">Arraste a foto para posicionar</span>}
  </div>
}

function LiveCardPreview({ product, src, settings, onChange }: { product: Product; src: string; settings: MediaViewSettings; onChange: (next: MediaViewSettings) => void }) {
  const isScenicCard = scenicPreviewCategoryIds.has(product.categoryId)

  return <div className="admin-real-preview-wrap admin-real-preview-wrap--card">
    <div className="product-strip" style={{ width: 'min(100%, 430px)', padding: '2px 20px 9px 1px' }}>
      <article
        data-product-id={product.id}
        className={`product-card${isScenicCard ? ' product-card--photo' : ''}`}
      >
        <EditableImage
          src={src}
          settings={settings}
          slot="card"
          onChange={onChange}
          frameClassName="product-image-wrap"
        />
        <div className="product-copy">
          <strong>{product.name}{product.size && <span className="inline-size"> {product.size}</span>}</strong>
        </div>
        <div className="product-bottom">
          <b>{money(product.price)}</b>
          <span className="round-plus" aria-hidden="true"><PreviewIcon name="plus"/></span>
        </div>
      </article>
    </div>
  </div>
}

function PreviewSimpleDetail({ product, src, settings, onChange }: { product: Product; src: string; settings: MediaViewSettings; onChange: (next: MediaViewSettings) => void }) {
  const isScenicSheet = scenicPreviewCategoryIds.has(product.categoryId)
  const reduceModal15 = product.id === 'whiskys-red-label-1l'
    || product.id === 'whiskys-black-white-1l'
    || product.id.startsWith('vodkas-slova-')
    || product.id.startsWith('vodkas-smirnoff-')
  const reduceModal17 = product.id.startsWith('gins-mancao-maromba-')
  const slovaLimao = product.id === 'vodkas-slova-limao'
  const tiers = product.tiers?.slice().sort((a, b) => b.qty - a.qty) ?? []

  const imageFrameClass = `simple-image${isScenicSheet ? ' simple-image--scenic' : ''}${reduceModal15 ? ' detail-image--minus15' : ''}${reduceModal17 ? ' detail-image--minus17' : ''}${slovaLimao ? ' detail-image--slova-limao' : ''}`

  return <section className="product-sheet simple-sheet" data-category-id={product.categoryId} data-product-id={product.id}>
    <div className="sheet-grabber"/>
    <span className="sheet-close" aria-hidden="true"><PreviewIcon name="close"/></span>
    <EditableImage
      src={src}
      settings={settings}
      slot="detail"
      onChange={onChange}
      frameClassName={imageFrameClass}
      imageClassName="simple-image-main"
      backdropClassName="simple-image-backdrop"
    />
    <div className="simple-summary">
      <div><h2>{product.name}</h2><span>{product.category}{product.size ? ` • ${product.size}` : ''}</span></div>
      <strong>{money(product.price)}</strong>
    </div>
    <label className="note-label">
      <span><b>Observação</b> <em>(opcional)</em></span>
      <textarea readOnly value="" placeholder="Ex: bem gelada, sem gelo..."/>
      <small>0/50</small>
    </label>
    {!!tiers.length && <div className="quick-packs simple-tier-row">
      {tiers.map(tier => <button type="button" tabIndex={-1} style={{ pointerEvents: 'none' }} key={tier.qty}>{tier.qty} un.</button>)}
    </div>}
    <div className="simple-qty-row">
      <div><span>Quantidade</span><div className="qty-control compact"><button type="button" tabIndex={-1}><PreviewIcon name="minus"/></button><strong>1</strong><button type="button" tabIndex={-1}><PreviewIcon name="plus"/></button></div></div>
      <div className="simple-total"><span>Total</span><strong>{money(product.price)}</strong></div>
    </div>
    <button type="button" tabIndex={-1} className="simple-add" style={{ pointerEvents: 'none' }}><PreviewIcon name="cart"/> Adicionar ao carrinho</button>
  </section>
}

function PreviewBeerDetail({ product, src, settings, onChange }: { product: Product; src: string; settings: MediaViewSettings; onChange: (next: MediaViewSettings) => void }) {
  const isReturnableBeer = product.kind === 'returnable'
  const offerTier = (product.tiers ?? []).slice().sort((a, b) => a.qty - b.qty)[0]
  const discountPercent = offerTier ? Math.max(0, Math.round((1 - (offerTier.unitPrice / product.price)) * 100)) : 0
  const offerTotal = offerTier ? offerTier.qty * offerTier.unitPrice : 0

  return <section className="product-sheet beer-sheet" data-product-id={product.id}>
    <div className="sheet-grabber"/>
    <span className="sheet-close" aria-hidden="true"><PreviewIcon name="close"/></span>
    <div className="beer-sheet-head">
      <EditableImage
        src={src}
        settings={settings}
        slot="detail"
        onChange={onChange}
        frameClassName="beer-sheet-image"
        imageClassName="beer-sheet-main"
        backdropClassName="beer-sheet-backdrop"
      />
    </div>

    <div className="beer-sheet-copy">
      <h2>{product.name}{product.size ? ` ${product.size}` : ''}</h2>
      <div className="beer-price-row">
        <div className="beer-price">{money(product.price)}</div>
        <div className="beer-badges">
          {product.cold && <span className="badge cold"><PreviewStatusIcon kind="cold"/>Gelado</span>}
          {isReturnableBeer && <span className="badge returnable"><PreviewStatusIcon kind="returnable"/>Retornável</span>}
        </div>
      </div>
    </div>

    {isReturnableBeer && <div className="return-exact">
      <span className="return-inline-icon" aria-hidden="true"><PreviewStatusIcon kind="returnable"/></span>
      <span>É necessário ter as garrafas para trocar</span>
    </div>}

    <div className="beer-buy-panel">
      {offerTier && <div className="beer-offer-heading">
        <strong>Leve + por -</strong>
        <span>A partir de {offerTier.qty} unidades</span>
      </div>}

      {offerTier && <div className="beer-offer-cards">
        <div className="beer-offer-card best">
          <span className="beer-offer-radio" aria-hidden="true"/>
          <strong>{offerTier.qty} un. {discountPercent > 0 && <em>-{discountPercent}%</em>}</strong>
          <b>{money(offerTier.unitPrice)}/un.</b>
          <span className="beer-offer-total">{money(offerTotal)} no pacote</span>
          <small>{discountPercent > 0 ? 'Melhor preço' : 'Preço do pacote'}</small>
        </div>
        <div className="beer-offer-card selected">
          <span className="beer-offer-radio" aria-hidden="true"/>
          <strong>1 unidade</strong>
          <b>{money(product.price)}/un.</b>
          <small>Preço unitário</small>
        </div>
      </div>}

      <div className="beer-bottom-actions">
        <div className="beer-qty-control"><button type="button" tabIndex={-1}><PreviewIcon name="minus"/></button><strong>1</strong><button type="button" tabIndex={-1}><PreviewIcon name="plus"/></button></div>
        <button type="button" tabIndex={-1} className="beer-add-button" style={{ pointerEvents: 'none' }}>Adicionar (1) • {money(product.price)}</button>
      </div>
    </div>
  </section>
}

function PreviewPackDetail({ product, src, settings, onChange }: { product: Product; src: string; settings: MediaViewSettings; onChange: (next: MediaViewSettings) => void }) {
  return <section className="product-sheet">
    <div className="sheet-grabber"/>
    <span className="sheet-close" aria-hidden="true"><PreviewIcon name="close"/></span>
    <div className="sheet-head">
      <EditableImage
        src={src}
        settings={settings}
        slot="detail"
        onChange={onChange}
        frameClassName="sheet-image"
        imageClassName="sheet-image-main"
        backdropClassName="sheet-image-backdrop"
      />
      <div className="sheet-title">
        <h2>{product.name}</h2>
        {product.size && <span className="sheet-size">{product.size}</span>}
        <div className="price-line"><strong>{money(product.price)}</strong></div>
        <div className="badges">{product.cold && <span className="badge cold">Gelado</span>}</div>
      </div>
    </div>
    <div className="pack-info">
      <p><b>{product.packUnits ?? 12} unidades por pack</b></p>
      {product.description && <p className="muted">{product.description}</p>}
      <div className="quick-packs">{[6, 12, 15].map(value => <button type="button" tabIndex={-1} style={{ pointerEvents: 'none' }} key={value}>+ {value} packs</button>)}</div>
    </div>
    <div className="sheet-footer" style={{ position: 'static', transform: 'none', width: '100%' }}>
      <div className="qty-control"><button type="button" tabIndex={-1}><PreviewIcon name="minus"/></button><strong>1</strong><button type="button" tabIndex={-1}><PreviewIcon name="plus"/></button></div>
      <button type="button" tabIndex={-1} className="add-main" style={{ pointerEvents: 'none' }}>Adicionar (1) • {money(product.price)}</button>
    </div>
  </section>
}

function LiveDetailPreview({ product, src, settings, onChange }: { product: Product; src: string; settings: MediaViewSettings; onChange: (next: MediaViewSettings) => void }) {
  const isBeer = beerCategoryIds.has(product.categoryId) && product.kind !== 'pack'

  return <div className="admin-real-preview-wrap admin-real-preview-wrap--detail">
    <div style={{ width: 'min(100%, 430px)' }}>
      {product.kind === 'pack'
        ? <PreviewPackDetail product={product} src={src} settings={settings} onChange={onChange}/>
        : isBeer
          ? <PreviewBeerDetail product={product} src={src} settings={settings} onChange={onChange}/>
          : <PreviewSimpleDetail product={product} src={src} settings={settings} onChange={onChange}/>
      }
    </div>
  </div>
}

const readError = async (response: Response) => {
  const fallback = `Não foi possível concluir a operação (erro ${response.status}).`
  try {
    const raw = await response.text()
    if (!raw) return fallback
    try {
      const data = JSON.parse(raw) as { error?: string; message?: string }
      return data.message || data.error || fallback
    } catch {
      const clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return clean ? `${fallback} ${clean.slice(0, 180)}` : fallback
    }
  } catch {
    return fallback
  }
}

async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  if (!accepted.includes(file.type)) throw new Error('Envie uma imagem JPG, PNG, WEBP ou AVIF.')

  if (file.size <= 4_000_000) return { blob: file, name: file.name || 'produto.jpg' }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'))
      img.src = objectUrl
    })

    let maxSide = 3400
    let quality = 0.98
    let result: Blob | null = null

    for (let attempt = 0; attempt < 6; attempt += 1) {
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
      result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality))
      if (result && result.size <= 4_000_000) break
      maxSide = Math.round(maxSide * 0.88)
      quality = Math.max(0.91, quality - 0.015)
    }

    if (!result || result.size > 4_000_000) throw new Error('A foto é muito grande. Tente uma imagem menor.')
    return { blob: result, name: 'produto.webp' }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function AdminMedia({ products, config, detailImageForProduct, onClose, onSaved }: AdminMediaProps) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [slot, setSlot] = useState<MediaSlot>('card')
  const [draft, setDraft] = useState<MediaConfig>(() => structuredClone(config))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [touched, setTouched] = useState<TouchedMedia>({})
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<StatusKind>('info')
  const [localPreview, setLocalPreview] = useState<{ productId: string; slot: MediaSlot; url: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const previewObjectUrl = useRef<string | null>(null)

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return products
    return products.filter(product => `${product.name} ${product.category} ${product.size}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [products, query])

  const selected = products.find(product => product.id === selectedId) ?? filtered[0] ?? products[0]
  const currentSettings = selected ? (draft[selected.id]?.[slot] ?? {}) : {}
  const normalizedCurrent = normalizedMediaSettings(currentSettings)
  const fallback = selected ? (slot === 'card' ? selected.image : detailImageForProduct(selected)) : ''
  const previewSrc = localPreview?.productId === selected?.id && localPreview.slot === slot
    ? localPreview.url
    : (currentSettings.url || fallback)

  const setMessage = (message: string, kind: StatusKind = 'info') => {
    setStatus(message)
    setStatusKind(kind)
  }

  const markTouched = (productId: string, targetSlot: MediaSlot) => {
    setTouched(previous => ({
      ...previous,
      [productId]: { ...previous[productId], [targetSlot]: true },
    }))
  }

  const requestClose = () => {
    if (dirty && !window.confirm('Existem alterações ainda não salvas. Deseja sair mesmo assim?')) return
    onClose()
  }

  const updateCurrent = (next: MediaViewSettings) => {
    if (!selected) return
    const normalized = normalizedMediaSettings(next)
    setDraft(previous => ({
      ...previous,
      [selected.id]: {
        ...previous[selected.id],
        [slot]: { ...next, scale: normalized.scale, x: normalized.x, y: normalized.y },
      },
    }))
    markTouched(selected.id, slot)
    setDirty(true)
    setStatus('')
  }

  const resetCurrent = () => {
    if (!selected) return
    setDraft(previous => {
      const next = { ...previous }
      const productConfig = { ...(next[selected.id] ?? {}) }
      delete productConfig[slot]
      if (!productConfig.card && !productConfig.detail) delete next[selected.id]
      else next[selected.id] = productConfig
      return next
    })
    markTouched(selected.id, slot)
    setDirty(true)
    setMessage('A foto voltou para o padrão. Clique em Salvar alterações para confirmar.', 'info')
  }

  const upload = async (file: File) => {
    if (!selected) return
    const productId = selected.id
    const targetSlot = slot
    setUploading(true)
    setMessage('Preparando a imagem...', 'info')

    try {
      const prepared = await prepareImage(file)

      if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
      const localUrl = URL.createObjectURL(prepared.blob)
      previewObjectUrl.current = localUrl
      setLocalPreview({ productId, slot: targetSlot, url: localUrl })
      setMessage('Enviando a nova foto sem perder qualidade...', 'info')

      const form = new FormData()
      form.append('file', prepared.blob, prepared.name)
      form.append('productId', productId)
      form.append('slot', targetSlot)

      const response = await fetch('/api/upload-product-image', { method: 'POST', body: form })
      if (!response.ok) throw new Error(await readError(response))
      const data = await response.json() as { url?: string }
      if (!data.url) throw new Error('O upload terminou, mas a nova foto não retornou uma URL válida.')

      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('A foto foi enviada, mas não foi possível carregá-la para a prévia.'))
        image.src = data.url!
      })

      setDraft(previous => ({
        ...previous,
        [productId]: {
          ...previous[productId],
          [targetSlot]: { url: data.url, scale: 1, x: 0, y: 0 },
        },
      }))
      markTouched(productId, targetSlot)
      setDirty(true)

      if (previewObjectUrl.current === localUrl) {
        URL.revokeObjectURL(localUrl)
        previewObjectUrl.current = null
        setLocalPreview(null)
      }
      setMessage('Foto carregada. Posicione exatamente como quiser e salve quando terminar.', 'success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a foto.', 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = async () => {
    const operations = Object.entries(touched).flatMap(([productId, slots]) => (['card', 'detail'] as MediaSlot[])
      .filter(targetSlot => slots[targetSlot])
      .map(targetSlot => ({
        productId,
        slot: targetSlot,
        value: draft[productId]?.[targetSlot] ?? null,
      })))

    if (!operations.length) {
      setDirty(false)
      setMessage('Não há alterações pendentes.', 'info')
      return
    }

    setSaving(true)
    setMessage('Salvando somente as fotos que você alterou...', 'info')
    try {
      const form = new FormData()
      form.append('action', 'save-media-patches-v50')
      const patchFile = new File(
        [JSON.stringify({ version: 1, createdAt: Date.now(), operations })],
        `media-patch-${Date.now()}.json`,
        { type: 'application/json' },
      )
      form.append('file', patchFile)

      const response = await fetch('/api/upload-product-image', { method: 'POST', body: form })
      if (!response.ok) throw new Error(await readError(response))

      const saved = await response.json() as { ok?: boolean; patched?: number }
      if (!saved.ok) throw new Error('O servidor não confirmou o salvamento protegido.')

      let canonical = draft
      try {
        const latestResponse = await fetch(`/api/media-config?v=${Date.now()}`, { cache: 'no-store' })
        if (latestResponse.ok) {
          const latest = await latestResponse.json() as MediaConfig
          if (latest && typeof latest === 'object' && !Array.isArray(latest)) canonical = latest
        }
      } catch {
        // A alteração já foi gravada como patch imutável. Se a releitura falhar,
        // mantemos a prévia local e a próxima abertura carregará o estado do servidor.
      }

      setDraft(canonical)
      onSaved(canonical)
      setTouched({})
      setDirty(false)
      setMessage(`Salvo com proteção. ${saved.patched ?? operations.length} ajuste(s) registrado(s) sem substituir as outras fotos.`, 'success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return <div className="admin-media-overlay admin-media-overlay--panel">
    <section className="admin-media-panel">
      <header className="admin-media-header">
        <div><small>Karavela Distribuidora</small><h2>Editor de fotos</h2></div>
        <button onClick={requestClose} aria-label="Fechar">×</button>
      </header>

      <div className="admin-media-layout">
        <aside className="admin-product-sidebar">
          <div className="admin-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produto..."/></div>
          <div className="admin-product-list">
            {filtered.map(product => <button key={product.id} className={selected?.id === product.id ? 'active' : ''} onClick={() => { setSelectedId(product.id); setStatus('') }}>
              <img src={draft[product.id]?.card?.url || product.image} alt=""/>
              <span><strong>{product.name}</strong><small>{product.category}{product.size ? ` • ${product.size}` : ''}</small></span>
            </button>)}
          </div>
        </aside>

        <main className="admin-editor-main">
          {selected && <>
            <div className="admin-editor-title">
              <div><small>{selected.category}</small><h3>{selected.name}{selected.size ? ` ${selected.size}` : ''}</h3></div>
              <span className={dirty ? 'admin-unsaved is-dirty' : 'admin-unsaved'}>{dirty ? 'Alterações pendentes' : 'Tudo salvo'}</span>
            </div>

            <div className="admin-slot-tabs">
              <button className={slot === 'card' ? 'active' : ''} onClick={() => { setSlot('card'); setStatus('') }}>Card da tela inicial</button>
              <button className={slot === 'detail' ? 'active' : ''} onClick={() => { setSlot('detail'); setStatus('') }}>Foto após o clique</button>
            </div>

            <div className="admin-preview-label">{slot === 'card' ? 'Prévia real do card' : 'Prévia real após o clique'}</div>
            {slot === 'card'
              ? <LiveCardPreview product={selected} src={previewSrc} settings={currentSettings} onChange={updateCurrent}/>
              : <LiveDetailPreview product={selected} src={previewSrc} settings={currentSettings} onChange={updateCurrent}/>
            }

            <div className="admin-upload-row">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) void upload(file)
                  event.currentTarget.value = ''
                }}
              />
              <button
                className="admin-upload-button"
                onClick={() => {
                  if (!fileInput.current) return
                  fileInput.current.value = ''
                  fileInput.current.click()
                }}
                disabled={uploading}
              >
                {uploading ? 'Enviando...' : 'Escolher da galeria'}
              </button>
              <button className="admin-secondary" onClick={resetCurrent}>Voltar ao padrão</button>
            </div>
            <div className="admin-help">Você pode escolher uma foto diretamente da galeria do celular ou do computador. Depois, ajuste o enquadramento na prévia em tempo real e salve.</div>

            <div className="admin-adjustments">
              <label><span>Zoom <b>{Math.round(normalizedCurrent.scale * 100)}%</b></span><input type="range" min={MIN_SCALE} max={MAX_SCALE} step="0.01" value={normalizedCurrent.scale} onChange={event => updateCurrent({ ...currentSettings, scale: Number(event.target.value) })}/></label>
              <label><span>Horizontal <b>{Math.round(normalizedCurrent.x)}%</b></span><input type="range" min={-PAN_LIMIT} max={PAN_LIMIT} step="1" value={normalizedCurrent.x} onChange={event => updateCurrent({ ...currentSettings, x: Number(event.target.value) })}/></label>
              <label><span>Vertical <b>{Math.round(normalizedCurrent.y)}%</b></span><input type="range" min={-PAN_LIMIT} max={PAN_LIMIT} step="1" value={normalizedCurrent.y} onChange={event => updateCurrent({ ...currentSettings, y: Number(event.target.value) })}/></label>
              <div className="admin-nudge-row admin-nudge-row--four">
                <button onClick={() => updateCurrent({ ...currentSettings, x: clamp(normalizedCurrent.x - 2, -PAN_LIMIT, PAN_LIMIT) })}>←</button>
                <button onClick={() => updateCurrent({ ...currentSettings, y: clamp(normalizedCurrent.y - 2, -PAN_LIMIT, PAN_LIMIT) })}>↑</button>
                <button onClick={() => updateCurrent({ ...currentSettings, y: clamp(normalizedCurrent.y + 2, -PAN_LIMIT, PAN_LIMIT) })}>↓</button>
                <button onClick={() => updateCurrent({ ...currentSettings, x: clamp(normalizedCurrent.x + 2, -PAN_LIMIT, PAN_LIMIT) })}>→</button>
              </div>
              <div className="admin-nudge-row">
                <button onClick={() => updateCurrent({ ...currentSettings, x: 0, y: 0 })}>Centralizar</button>
                <button onClick={() => updateCurrent({ ...currentSettings, scale: 1, x: 0, y: 0 })}>Encaixe padrão</button>
              </div>
            </div>

            <div className="admin-help">A prévia acima reproduz o enquadramento final. Você pode arrastar a foto mesmo com zoom em 100%, usar os controles de posição e reduzir o zoom até 50%.</div>
            {status && <div className={`admin-status admin-status--${statusKind}`}>{status}</div>}
            <button className="admin-save" onClick={() => void save()} disabled={saving || uploading || !dirty}>{saving ? 'Salvando...' : dirty ? 'Salvar alterações' : 'Alterações salvas'}</button>
          </>}
        </main>
      </div>
    </section>
  </div>
}
