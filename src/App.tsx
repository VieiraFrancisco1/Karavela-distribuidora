import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { brands as baseBrands, categories as baseCategories, products as baseProducts } from './data'
import type { CartLine, CatalogBrand, CatalogCategory, CatalogConfig, Product, Tier } from './types'
import { AdminMedia, hasMediaOverride, mediaImageStyle } from './mediaAdmin'
import type { MediaConfig, MediaViewSettings, ProductMediaOverride } from './mediaAdmin'
import HomeBanner from './HomeBanner'
import type { BannerDestination } from './HomeBanner'
import StoreStatus from './StoreStatus'
import CategoryCardPhoto from './CategoryCardPhoto'
import CategoryCardLabel from './CategoryCardLabel'
import { money, productPricing, roundMoney, deliveryFeeFor } from './pricing'
import MediaImage from './MediaImage'
import { useSession } from './AuthProvider'
import { AccountScreen, AuthScreen, accountError } from './AccountScreen'
import { CustomerOrders, OwnerDashboard } from './OrdersDashboard'
import { firebaseReady } from './firebaseClient'
import { submitWhatsAppOrder, watchSetting } from './firebaseStore'
import type { OrderDraft } from './ordersModel'
import mediaSnapshot from '../public/assets/migration/media-config.json'
import catalogSnapshot from '../public/assets/migration/catalog-config.json'

const primaryTier = (product: Product) => (product.tiers ?? []).slice().sort((a, b) => a.qty - b.qty)[0]

type IconName = 'menu' | 'search' | 'cart' | 'close' | 'plus' | 'minus' | 'trash' | 'arrow' | 'back' | 'home' | 'chat' | 'orders'

const beerCategoryIds = ['cervejas-lata', 'cervejas-300-unidades', 'long-necks', 'zero-alcool']
const beerFilters = [
  { id: 'all', label: 'Todos' },
  { id: '230ml', label: '230ml' },
  { id: '250ml', label: '250ml' },
  { id: '275ml', label: '275ml' },
  { id: '300ml', label: '300ml' },
  { id: '330ml', label: '330ml' },
  { id: '350ml', label: '350ml' },
  { id: '355ml', label: '355ml' },
  { id: 'zero', label: 'Zero Álcool' },
] as const

type BeerFilterId = (typeof beerFilters)[number]['id']

const energyFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'can', label: 'Lata' },
  { id: '2l', label: '2L' },
] as const

type EnergyFilterId = (typeof energyFilters)[number]['id']

const sortEnergyProducts = (items: Product[]) => [...items].sort((a, b) => {
  const aGroup = a.size.toLocaleLowerCase('pt-BR').includes('lata') ? 0 : 1
  const bGroup = b.size.toLocaleLowerCase('pt-BR').includes('lata') ? 0 : 1
  if (aGroup !== bGroup) return aGroup - bGroup
  return a.name.localeCompare(b.name, 'pt-BR')
})

const filterEnergyProducts = (items: Product[], filter: EnergyFilterId) => {
  if (filter === 'all') return sortEnergyProducts(items)
  if (filter === 'can') return sortEnergyProducts(items.filter(product => product.size.toLocaleLowerCase('pt-BR').includes('lata')))
  return sortEnergyProducts(items.filter(product => product.size.toLocaleLowerCase('pt-BR').includes('2l')))
}

const beerSizeNumber = (product: Product) => {
  const match = product.size.match(/(\d+)\s*ml/i)
  return match ? Number(match[1]) : 999
}

const sortBeerProducts = (items: Product[]) => [...items].sort((a, b) => {
  const aGroup = a.categoryId === 'zero-alcool' ? 1 : 0
  const bGroup = b.categoryId === 'zero-alcool' ? 1 : 0
  if (aGroup !== bGroup) return aGroup - bGroup
  if (aGroup === 0) {
    const sizeDiff = beerSizeNumber(a) - beerSizeNumber(b)
    if (sizeDiff) return sizeDiff
  }
  return a.name.localeCompare(b.name, 'pt-BR')
})

const filterBeerProducts = (items: Product[], filter: BeerFilterId) => {
  if (filter === 'all') return sortBeerProducts(items)
  if (filter === 'zero') return sortBeerProducts(items.filter(product => product.categoryId === 'zero-alcool'))
  return sortBeerProducts(items.filter(product => product.categoryId !== 'zero-alcool' && product.size.toLocaleLowerCase('pt-BR').includes(filter)))
}
const DELIVERY_FEE = 3
const DELIVERY_FEE_SPECIAL = 4
const PICKUP_ADDRESS = 'Rua 26 de Junho, nº 920 · Boaviaginha · Boa Viagem, CE'
const PIX_RECEIVER = 'Deivid dos Santos Cavalcante'
const PIX_KEY = '08853052309'
const WHATSAPP_ORDER_NUMBER = '558896916158'
const INSTAGRAM_HANDLE = 'karavelabistrodistribuidora'
const INSTAGRAM_URL = 'https://www.instagram.com/karavelabistrodistribuidora?stkn=MTU4MjVvNG41czc2eQ=='
const CATALOG_IMAGE_REV = Date.now()
const freshCatalogImageUrl = (url?: string | null) => {
  if (!url) return ''
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}sitecb=${CATALOG_IMAGE_REV}`
}

const catalogImageStyle = (item: { imageScale?: number; imageX?: number; imageY?: number }) => ({
  transform: `translate(${item.imageX ?? 0}%, ${item.imageY ?? 0}%) scale(${item.imageScale ?? 1})`,
  transformOrigin: 'center center',
})

const simpleSlug = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const defaultBrands: CatalogBrand[] = baseBrands.map((brand, index) => ({
  id: simpleSlug(brand.name) || `marca-${index + 1}`,
  name: brand.name,
  image: brand.image,
  accent: brand.accent,
}))

const defaultCategories: CatalogCategory[] = baseCategories.map(category => ({
  id: category.id,
  label: category.label,
  icon: category.icon,
  image: null,
}))
const scenicCardCategoryIds = new Set(['whiskys', 'vinhos', 'cachacas', 'vodkas', 'gins', 'licores'])
const scenicSheetCategoryIds = new Set(['whiskys', 'vinhos', 'cachacas', 'vodkas', 'gins', 'licores'])
const detailImageByProductId: Record<string, string> = {
  'gins-mancao-maromba-frutas-vermelhas': '/assets/products/gins/details/mancao-maromba-frutas-vermelhas.png',
  'gins-mancao-maromba-uva': '/assets/products/gins/details/mancao-maromba-uva.png',
  'gins-mancao-maromba-maca-verde': '/assets/products/gins/details/mancao-maromba-maca-verde.png',
  'gins-mancao-maromba-frutas-tropicais': '/assets/products/gins/details/mancao-maromba-frutas-tropicais.png',
}
const BOA_VIAGEM_NEIGHBORHOODS = [
  'Alto do Zé Rosa', 'Alto do Motor', 'Bairro de Fátima', 'Boa Viaginha', 'Capitão Mor', 'Ceac', 'Centro',
  'Cesar Cals', 'Cohab', 'Floresta', 'Osmar Carneiro', 'Padre Paulo', 'Ponte Nova', 'Queiroz', 'Recreio',
  'Sambra', 'Tibiquari', 'Várzea do Canto', 'Vila Azul', 'Vila Holanda', 'Vila Lurdinha', 'Outras',
] as const


function ManagedProductImage({ src, alt, settings, className = '' }: { src: string; alt: string; settings?: MediaViewSettings; className?: string }) {
  const managed = hasMediaOverride(settings)
  return <MediaImage
    className={`${className}${managed ? ' media-managed' : ''}`.trim()}
    src={settings?.url || src}
    alt={alt}
    style={managed ? mediaImageStyle(settings) : undefined}
  />
}

function Icon({ name }: { name: IconName }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<IconName, ReactNode> = {
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></>,
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    close: <><path d="M5 5l14 14M19 5 5 19"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <><path d="M5 12h14"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    arrow: <><path d="m9 18 6-6-6-6"/></>,
    back: <><path d="m15 18-6-6 6-6"/></>,
    home: <><path d="m3 11 9-8 9 8v9h-6v-6H9v6H3z"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 1 1 21 15z"/></>,
    orders: <><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}


function StatusIcon({ kind }: { kind: 'cold' | 'returnable' }) {
  if (kind === 'cold') {
    return (
      <svg className="mini-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07 19.07 4.93"/>
      </svg>
    )
  }
  return (
    <svg className="mini-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3h4v3.2c0 1.4 2.4 2.8 2.4 5v8.1A2.7 2.7 0 0 1 13.7 22h-3.4a2.7 2.7 0 0 1-2.7-2.7v-8.1c0-2.2 2.4-3.6 2.4-5z"/>
      <path d="M10 5.6h4M8.6 13.4c-1.7-.5-3-1.8-3.6-3.4M4.5 7.7 5 10l2.2-.8M15.4 13.4c1.7-.5 3-1.8 3.6-3.4m.5-2.3L19 10l-2.2-.8"/>
    </svg>
  )
}

function CategoryIcon({ name }: { name: string }) {
  const common = { width: 34, height: 34, viewBox: '0 0 40 40', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const icons: Record<string, ReactNode> = {
    'beer-can': <><rect x="12" y="7" width="16" height="26" rx="4"/><path d="M14 10h12M14 30h12M17 5h6"/><path d="M18 15c3 2 5 2 7 0v8c-2 2-4 2-7 0z"/></>,
    'beer-mug': <><path d="M11 10h15v23a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4z"/><path d="M26 15h3a5 5 0 0 1 0 10h-3"/><path d="M13 10c0-3 2-5 5-5 1.7 0 3 .7 4 2 1-.8 2.1-1.2 3.5-1.2 2.8 0 4.5 1.8 4.5 4.2"/><path d="M15 16v14M20 16v14"/></>,
    'beer-bottle': <><path d="M17 5h6v6c0 2 3 4 3 7v14a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V18c0-3 3-5 3-7z"/><path d="M17 9h6M15 23h10"/></>,
    crate: <><rect x="7" y="14" width="26" height="19" rx="3"/><path d="M10 19h20M13 14V9h5v5M22 14V9h5v5M13 24h4M23 24h4M13 29h4M23 29h4"/></>,
    'zero-beer': <><rect x="10" y="8" width="15" height="24" rx="4"/><path d="M12 12h11M12 29h11"/><circle cx="29" cy="12" r="6"/><path d="m25 16 8-8"/></>,
    bolt: <><path d="M23 4 11 22h8l-2 14 12-19h-8z"/></>,
    'energy-can': <><rect x="11" y="6" width="18" height="28" rx="5"/><path d="M14 9h12M14 31h12M17 4h6"/><path d="m22 12-6 9h5l-2 7 6-10h-5z"/></>,
    'ice-bottle': <><path d="M17 5h6v6c0 2 3 4 3 7v14a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V18c0-3 3-5 3-7z"/><path d="M17 9h6"/><path d="M30 12v10M26 14l8 6M26 20l8-6"/></>,
    soda: <><path d="M13 9h14l-2 26H15zM12 9h16M16 5h8"/><path d="m23 5 4-3"/></>,
    whisky: <><path d="M10 12h20l-2 22H12z"/><path d="M13 24c5-3 9 3 14 0M15 7h10"/></>,
    bottle: <><path d="M17 4h6v7c0 2 4 5 4 9v13a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V20c0-4 4-7 4-9z"/><path d="M17 8h6M14 24h12"/></>,
    cocktail: <><path d="M8 8h24L20 21zM20 21v13M14 34h12"/><path d="m25 8 6-5"/></>,
    wine: <><path d="M12 6h16l-2 12c-.7 4-3 7-6 7s-5.3-3-6-7zM20 25v9M15 34h10"/><path d="M14 16h12"/></>,
    sparkling: <><path d="M17 5h6v6c0 2 3 4 3 7v15a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V18c0-3 3-5 3-7z"/><path d="M29 7h.01M33 12h.01M30 17h.01"/></>,
    liqueur: <><path d="M15 7h10v6l4 6v14a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4V19l4-6z"/><path d="M14 25h12"/></>,
    candy: <><path d="m10 14 5 4v8l-5 4-6-4v-8zM30 14l-5 4v8l5 4 6-4v-8z"/><rect x="13" y="15" width="14" height="14" rx="4"/></>,
  }
  return <svg {...common}>{icons[name] ?? icons.bottle}</svg>
}

function ProductCard({ product, onOpen, media }: { product: Product; onOpen: (p: Product) => void; media?: ProductMediaOverride }) {
  const isScenicCard = scenicCardCategoryIds.has(product.categoryId)
  const isCrateCard = product.categoryId === 'cervejas-300-caixa'
  const cardName = isCrateCard
    ? product.name.replace('Brahma Duplo Malte', 'Brahma Duplo').replace(/\s*—\s*Caixa$/, ' Caixa')
    : product.name

  return (
    <article data-product-id={product.id} className={`product-card${isScenicCard ? ' product-card--photo' : ''}${isCrateCard ? ' product-card--crate' : ''}`} onClick={() => onOpen(product)}>
      <div className="product-image-wrap"><ManagedProductImage src={product.image} alt={product.name} settings={media?.card} /></div>
      <div className="product-copy">
        <strong title={product.name}>{cardName}{!isCrateCard && product.size && <span className="inline-size"> {product.size}</span>}</strong>
      </div>
      <div className="product-bottom">
        <b>{money(product.price)}</b>
        <button className="round-plus" aria-label={`Ver ${product.name}`} onClick={(e) => { e.stopPropagation(); onOpen(product) }}><Icon name="plus" /></button>
      </div>
    </article>
  )
}

function ReturnableWarning() {
  return (
    <div className="return-exact">
      <span className="return-inline-icon" aria-hidden="true"><StatusIcon kind="returnable" /></span>
      <span>É necessário ter as garrafas para trocar</span>
    </div>
  )
}

function BeerSheet({ product, onClose, onAdd, media }: { product: Product; onClose: () => void; onAdd: (p: Product, qty: number, unitPrice: number, el: HTMLElement) => void; media?: ProductMediaOverride }) {
  const [qty, setQty] = useState(1)
  const isReturnableBeer = product.kind === 'returnable'
  const offerTier = primaryTier(product)
  const pricing = productPricing(product, qty)
  const discountPercent = offerTier ? Math.max(0, Math.round((1 - (offerTier.unitPrice / product.price)) * 100)) : 0
  const hasDiscount = pricing.savings > 0
  const offerTotal = offerTier ? roundMoney(offerTier.qty * offerTier.unitPrice) : 0

  useEffect(() => { setQty(1) }, [product.id])

  return <div className="overlay sheet-overlay" onMouseDown={onClose}>
    <section className="product-sheet beer-sheet" data-product-id={product.id} onMouseDown={e => e.stopPropagation()}>
      <div className="sheet-grabber"/>
      <button className="sheet-close" onClick={onClose}><Icon name="close"/></button>
      <div className="beer-sheet-head">
        <div className="beer-sheet-image">
          <MediaImage className="beer-sheet-backdrop" src={media?.detail?.url || product.image} alt="" aria-hidden="true"/>
          <ManagedProductImage className="beer-sheet-main" src={product.image} alt={product.name} settings={media?.detail}/>
        </div>
      </div>

      <div className="beer-sheet-copy">
        <h2>{product.name}{product.size ? ` ${product.size}` : ''}</h2>
        <div className="beer-price-row">
          <div className={`beer-price${hasDiscount ? ' discounted' : ''}`}>{money(hasDiscount ? pricing.effectiveUnitPrice : product.price)}</div>
          {hasDiscount && <><del>{money(product.price)}</del><span className="beer-discount-badge">-{discountPercent}%</span></>}
          <div className="beer-badges">
            {product.cold && <span className="badge cold"><StatusIcon kind="cold" />Gelado</span>}
            {isReturnableBeer && <span className="badge returnable"><StatusIcon kind="returnable" />Retornável</span>}
          </div>
        </div>
      </div>

      {isReturnableBeer && <ReturnableWarning />}

      <div className="beer-buy-panel">
        {offerTier && <div className="beer-offer-heading">
          <strong>Leve + por -</strong>
          <span>A partir de {offerTier.qty} unidades</span>
        </div>}

        {offerTier && <div className="beer-offer-cards">
          <button className={`beer-offer-card best${qty === offerTier.qty ? ' selected' : ''}`} onClick={() => setQty(offerTier.qty)}>
            <span className="beer-offer-radio" aria-hidden="true"/>
            <strong>{offerTier.qty} un. {discountPercent > 0 && <em>-{discountPercent}%</em>}</strong>
            <b>{money(offerTier.unitPrice)}/un.</b>
            <span className="beer-offer-total">{money(offerTotal)} no pacote</span>
            <small>{discountPercent > 0 ? 'Melhor preço' : 'Preço do pacote'}</small>
          </button>
          <button className={`beer-offer-card${qty === 1 ? ' selected' : ''}`} onClick={() => setQty(1)}>
            <span className="beer-offer-radio" aria-hidden="true"/>
            <strong>1 unidade</strong>
            <b>{money(product.price)}/un.</b>
            <small>Preço unitário</small>
          </button>
        </div>}

        <div className="beer-bottom-actions">
          <div className="beer-qty-control">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}><Icon name="minus"/></button>
            <strong>{qty}</strong>
            <button onClick={() => setQty(q => q + 1)}><Icon name="plus"/></button>
          </div>
          <button className="beer-add-button" onClick={(e) => onAdd(product, qty, pricing.effectiveUnitPrice, e.currentTarget)}>
            Adicionar ({qty}) • {money(pricing.total)}
          </button>
        </div>
      </div>
    </section>
  </div>
}

function PackSheet({ product, onClose, onAdd, media }: { product: Product; onClose: () => void; onAdd: (p: Product, qty: number, unitPrice: number, el: HTMLElement) => void; media?: ProductMediaOverride }) {
  const [qty, setQty] = useState(1)
  useEffect(() => { setQty(1) }, [product.id])

  return <div className="overlay sheet-overlay" onMouseDown={onClose}>
    <section className="product-sheet pack-sheet" data-category-id={product.categoryId} data-product-id={product.id} onMouseDown={e => e.stopPropagation()}>
      <div className="sheet-grabber"/>
      <button className="sheet-close" onClick={onClose}><Icon name="close"/></button>
      <div className="sheet-head">
        <div className="sheet-image"><MediaImage className="sheet-image-backdrop" src={media?.detail?.url || product.image} alt="" aria-hidden="true"/><ManagedProductImage className="sheet-image-main" src={product.image} alt={product.name} settings={media?.detail}/></div>
        <div className="sheet-title">
          <h2>{product.name}</h2>
          {product.size && <span className="sheet-size">{product.size}</span>}
          <div className="price-line"><strong>{money(product.price)}</strong></div>
          <div className="badges">{product.cold && <span className="badge cold">Gelado</span>}</div>
        </div>
      </div>
      <div className="pack-info">
        <p><b>Caixa com {product.packUnits ?? 12} unidades</b></p>
        {product.basePrice && <p className="pack-unit-price">Unidade avulsa: {money(product.basePrice)}</p>}
        {product.description && <p className="muted">{product.description}</p>}
      </div>
      <div className="sheet-footer">
        <div className="qty-control"><button aria-label="Diminuir quantidade de caixas" onClick={() => setQty(q => Math.max(1, q - 1))}><Icon name="minus"/></button><strong>{qty}</strong><button aria-label="Aumentar quantidade de caixas" onClick={() => setQty(q => q + 1)}><Icon name="plus"/></button></div>
        <button className="add-main" onClick={(e) => onAdd(product, qty, product.price, e.currentTarget)}>Adicionar {qty} {qty === 1 ? 'caixa' : 'caixas'} • {money(qty * product.price)}</button>
      </div>
    </section>
  </div>
}

function ProductSheet({ product, onClose, onAdd, media }: { product: Product; onClose: () => void; onAdd: (p: Product, qty: number, unitPrice: number, el: HTMLElement) => void; media?: ProductMediaOverride }) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const tiers = product.tiers?.slice().sort((a, b) => b.qty - a.qty) ?? []
  const isBeerStyle = beerCategoryIds.includes(product.categoryId) && product.kind !== 'pack'
  const isScenicSheet = scenicSheetCategoryIds.has(product.categoryId)
  const reduceModal15 = product.id === 'whiskys-red-label-1l'
    || product.id === 'whiskys-black-white-1l'
    || product.id.startsWith('vodkas-slova-')
    || product.id.startsWith('vodkas-smirnoff-')
  const reduceModal17 = product.id.startsWith('gins-mancao-maromba-')
  const slovaLimao = product.id === 'vodkas-slova-limao'
  const detailImage = detailImageByProductId[product.id] ?? product.image

  useEffect(() => {
    setQty(1)
    setNote('')
  }, [product.id])

  if (product.kind === 'pack') {
    return <PackSheet product={product} onClose={onClose} onAdd={onAdd} media={media} />
  }

  if (isBeerStyle) {
    return <BeerSheet product={product} onClose={onClose} onAdd={onAdd} media={media} />
  }

  return <div className="overlay sheet-overlay" onMouseDown={onClose}>
    <section className="product-sheet simple-sheet" data-category-id={product.categoryId} data-product-id={product.id} onMouseDown={e => e.stopPropagation()}>
      <div className="sheet-grabber" />
      <button className="sheet-close" onClick={onClose}><Icon name="close" /></button>
      <div className={`simple-image${isScenicSheet ? ' simple-image--scenic' : ''}${reduceModal15 ? ' detail-image--minus15' : ''}${reduceModal17 ? ' detail-image--minus17' : ''}${slovaLimao ? ' detail-image--slova-limao' : ''}`}>
        <img className="simple-image-backdrop" src={media?.detail?.url || detailImage} alt="" aria-hidden="true" />
        <ManagedProductImage className="simple-image-main" src={detailImage} alt={product.name} settings={media?.detail} />
      </div>
      <div className="simple-summary">
        <div><h2>{product.name}</h2><span>{product.category}{product.size ? ` • ${product.size}` : ''}</span></div>
        <strong>{money(product.price)}</strong>
      </div>
      <label className="note-label"><span><b>Observação</b> <em>(opcional)</em></span><textarea value={note} maxLength={50} onChange={e => setNote(e.target.value)} placeholder="Ex: bem gelada, sem gelo..."/><small>{note.length}/50</small></label>
      {!!tiers.length && <div className="quick-packs simple-tier-row">{tiers.map((tier: Tier) => <button key={tier.qty} onClick={() => setQty(tier.qty)}>{tier.qty} un.</button>)}</div>}
      <div className="simple-qty-row"><div><span>Quantidade</span><div className="qty-control compact"><button onClick={() => setQty(q => Math.max(1, q - 1))}><Icon name="minus" /></button><strong>{qty}</strong><button onClick={() => setQty(q => q + 1)}><Icon name="plus" /></button></div></div><div className="simple-total"><span>Total</span><strong>{money(qty * product.price)}</strong></div></div>
      <button className="simple-add" onClick={(e) => onAdd(product, qty, product.price, e.currentTarget)}><Icon name="cart"/> Adicionar ao carrinho</button>
    </section>
  </div>
}

function SideMenu({ categories, onClose, onCart, onHome, onCategory, onAdmin, onAccount, onOrders, isOwner, accountName }: { categories: CatalogCategory[]; onClose: () => void; onCart: () => void; onHome: () => void; onCategory: (id: string) => void; onAdmin: () => void; onAccount: () => void; onOrders: () => void; isOwner: boolean; accountName: string }) {
  return <div className="overlay menu-overlay" onMouseDown={onClose}>
    <aside className="side-menu" onMouseDown={e => e.stopPropagation()}>
      <div className="menu-top"><img src="/assets/logo-karavela.png" alt="Karavela Bistrô & Distribuidora"/><button aria-label="Fechar menu" onClick={onClose}><Icon name="close"/></button></div>
      <nav><button onClick={onHome}><Icon name="home"/> Início</button><button onClick={onAccount}><Icon name="home"/> {accountName || 'Entrar / Criar conta'}</button><button onClick={onCart}><Icon name="cart"/> Meu carrinho</button><button onClick={onOrders}><Icon name="orders"/> Meus pedidos</button><a href={'https://wa.me/' + WHATSAPP_ORDER_NUMBER} target="_blank" rel="noreferrer"><Icon name="chat"/> Falar com atendente</a>{isOwner && <button className="admin-menu-entry" onClick={onAdmin}><Icon name="orders"/> Administrar loja</button>}</nav>
      <div className="menu-sep"/><h3>Categorias</h3>
      <div className="menu-cats">{categories.map(category => <button key={category.id} onClick={() => onCategory(category.id)}>{category.image ? <span className="menu-category-image-frame"><MediaImage className="menu-category-image" src={freshCatalogImageUrl(category.image)} alt="" style={catalogImageStyle(category)}/></span> : <CategoryIcon name={category.icon}/>} <span>{category.label}</span><Icon name="arrow"/></button>)}</div>
    </aside>
  </div>
}

function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-brand">
      <img src="/assets/logo-karavela.png" alt="Karavela Bistrô & Distribuidora"/>
    </div>
    <div className="site-footer-block">
      <h3>Contato</h3>
      <a href={`https://wa.me/${WHATSAPP_ORDER_NUMBER}`} target="_blank" rel="noreferrer">
        <span className="site-footer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M21 15.5a3 3 0 0 1-3 3h-1.2c-6.3 0-11.3-5-11.3-11.3V6a3 3 0 0 1 3-3h1.6l1.3 4-2 1.6a12.3 12.3 0 0 0 6 6l1.6-2 4 1.3z"/></svg>
        </span>
        <span>Falar com atendente</span>
      </a>
      <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
        <span className="site-footer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>
        </span>
        <span>@{INSTAGRAM_HANDLE}</span>
      </a>
    </div>
    <div className="site-footer-block">
      <h3>Funcionamento</h3>
      <div className="site-footer-line">
        <span className="site-footer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </span>
        <span>Seg a Sáb: 09:00 às 23:00</span>
      </div>
      <div className="site-footer-line">
        <span className="site-footer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </span>
        <span>Domingo: Fechado</span>
      </div>
    </div>
  </footer>
}

function CartDrawer({ lines, onClose, onQty, onRemove, onCheckout, minimumNotice, onCloseMinimumNotice, mediaConfig }: { lines: CartLine[]; onClose: () => void; onQty: (id: string, q: number) => void; onRemove: (id: string) => void; onCheckout: (total: number) => void; minimumNotice: { total: number } | null; onCloseMinimumNotice: () => void; mediaConfig: MediaConfig }) {
  const total = lines.reduce((sum, line) => sum + productPricing(line.product, line.qty).total, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  return <div className="overlay cart-overlay" onMouseDown={onClose}><aside className="cart-drawer" onMouseDown={e => e.stopPropagation()}>
    <header className="cart-fixed-head"><h2>Meu carrinho <span>({count})</span></h2><button onClick={onClose}><Icon name="close"/></button></header>
    <div className={`cart-lines ${minimumNotice ? 'with-minimum-notice' : ''}`}>{lines.length === 0 && <div className="empty"><Icon name="cart"/><h3>Seu carrinho está vazio</h3><p>Adicione bebidas para continuar.</p></div>}{lines.map(line => {
      const pricing = productPricing(line.product, line.qty)
      return <article className="cart-line" key={line.product.id}>
      <div className="cart-line-top">
        <div className="cart-product-media"><ManagedProductImage src={line.product.image} alt="" settings={mediaConfig[line.product.id]?.card}/></div>
        <div className="cart-info">
          <strong className="cart-product-name">{line.product.name}{line.product.size && <span className="cart-inline-size"> {line.product.size}</span>}</strong>
          <div className="cart-price-row"><b className="cart-unit-price">{money(pricing.effectiveUnitPrice)} cada</b>{pricing.savings > 0 && <span className="cart-discount-badge">Economizou {money(pricing.savings)}</span>}</div>
        </div>
        <button className="trash" onClick={() => onRemove(line.product.id)}><Icon name="trash"/></button>
      </div>
      <div className="cart-line-divider"/>
      <div className="cart-line-bottom">
        <div className="cart-q"><button onClick={() => onQty(line.product.id, Math.max(1, line.qty - 1))}><Icon name="minus"/></button><span>{line.qty}</span><button onClick={() => onQty(line.product.id, line.qty + 1)}><Icon name="plus"/></button></div>
        <strong className="line-total">{money(pricing.total)}</strong>
      </div>
    </article>})}</div>
    <footer className={`cart-footer ${minimumNotice ? 'has-minimum-notice' : ''}`}>
      {minimumNotice && <aside className="minimum-notice cart-only-minimum-notice" role="alert" aria-live="assertive">
        <div className="minimum-error-icon" aria-hidden="true">×</div>
        <div className="minimum-notice-copy">
          <strong>Pedido mínimo de R$ 20,00</strong>
          <span>Adicione mais {money(Math.max(0, 20 - minimumNotice.total))} para finalizar o pedido.</span>
        </div>
        <button className="minimum-close" aria-label="Fechar aviso" onClick={onCloseMinimumNotice}><Icon name="close" /></button>
      </aside>}
      <div className="cart-total-row"><b>Total do pedido</b><strong>{money(total)}</strong></div>
      <button disabled={!lines.length} onClick={() => onCheckout(total)}>Finalizar pedido <span>→</span></button>
    </footer>
  </aside></div>
}

function CheckoutScreen({ lines, onBack, onSubmitted }: { lines: CartLine[]; onBack: () => void; onSubmitted: () => void }) {
  const { user, profile } = useSession()
  const [sending, setSending] = useState(false)
  const sendingLock = useRef(false)
  const [sendError, setSendError] = useState('')
  const orderId = useRef('')
  const subtotal = lines.reduce((sum, line) => sum + productPricing(line.product, line.qty).total, 0)
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState(profile?.name || user?.displayName || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup' | ''>('')
  const [neighborhood, setNeighborhood] = useState('')
  const [otherNeighborhood, setOtherNeighborhood] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [noNumber, setNoNumber] = useState(false)
  const [complement, setComplement] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<'pix' | 'credit' | 'debit' | 'cash' | ''>('')
  const [needsChange, setNeedsChange] = useState(false)
  const [changeAnswered, setChangeAnswered] = useState(false)
  const [changeFor, setChangeFor] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [paymentAttempted, setPaymentAttempted] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)
  const deliveryRef = useRef<HTMLDivElement>(null)
  const pickupRef = useRef<HTMLDivElement>(null)
  const paymentRef = useRef<HTMLDivElement>(null)
  const pixRef = useRef<HTMLDivElement>(null)
  const cashRef = useRef<HTMLDivElement>(null)
  const changeRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  const effectiveNeighborhood = neighborhood === 'Outras' ? otherNeighborhood.trim() : neighborhood
  const deliveryFee = fulfillment === 'delivery' ? deliveryFeeFor(effectiveNeighborhood) : 0
  const total = subtotal + deliveryFee
  const phoneDigits = phone.replace(/\D/g, '')
  const nameParts = name.trim().split(/\s+/).filter(Boolean)
  const nameValid = nameParts.length >= 2 && nameParts.every(part => part.length >= 2)
  const customerDataValid = nameValid && phoneDigits.length >= 10
  const streetValid = street.trim().length >= 3
  const numberValid = noNumber || number.trim().length >= 1
  const complementValid = complement.trim().length === 0 || complement.trim().length >= 5
  const referenceValid = reference.trim().length >= 10
  const addressValid = fulfillment === 'pickup' || (
    fulfillment === 'delivery' && effectiveNeighborhood.length >= 2 && streetValid && numberValid && complementValid && referenceValid
  )
  const firstStepValid = customerDataValid && !!fulfillment && addressValid
  const parsedChange = Number(changeFor.replace(',', '.'))
  const changeValid = payment !== 'cash' || (changeAnswered && (!needsChange || (Number.isFinite(parsedChange) && parsedChange > total)))

  const paymentLabel: Record<'pix' | 'credit' | 'debit' | 'cash', string> = {
    pix: 'Pix',
    credit: 'Cartão de crédito',
    debit: 'Cartão de débito',
    cash: 'Dinheiro',
  }

  function selectFulfillment(value: 'delivery' | 'pickup') {
    setFulfillment(value)
    setAttempted(false)
    window.setTimeout(() => {
      const target = value === 'delivery' ? deliveryRef.current : pickupRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  function continueToPayment() {
    setAttempted(true)
    if (!firstStepValid) {
      window.setTimeout(() => {
        if (!fulfillment) document.querySelector('.checkout-fulfillment')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        else if (fulfillment === 'delivery' && !addressValid) deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else document.querySelector('.checkout-customer-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
      return
    }
    setStep(2)
    window.setTimeout(() => paymentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90)
  }

  function scrollToSummary() {
    window.setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 110)
  }

  function selectPayment(value: 'pix' | 'credit' | 'debit' | 'cash') {
    setPayment(value)
    setPaymentAttempted(false)
    if (value === 'cash') {
      setNeedsChange(false)
      setChangeAnswered(false)
      setChangeFor('')
    } else {
      setNeedsChange(false)
      setChangeAnswered(false)
      setChangeFor('')
    }
    window.setTimeout(() => {
      if (value === 'pix') pixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else if (value === 'cash') cashRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 90)
  }

  async function copyPixKey() {
    try {
      await navigator.clipboard.writeText(PIX_KEY)
    } catch {
      const area = document.createElement('textarea')
      area.value = PIX_KEY
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.focus()
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setPixCopied(true)
    window.setTimeout(() => setPixCopied(false), 2200)
  }

  function buildWhatsAppMessage() {
    if (!payment || !fulfillment) return ''
    const rows: string[] = [
      '*NOVO PEDIDO - KARAVELA BISTRÔ & DISTRIBUIDORA*',
      '',
      `*Cliente:* ${name.trim()}`,
      `*WhatsApp:* ${phone.trim()}`,
      `*Recebimento:* ${fulfillment === 'delivery' ? 'Entrega' : 'Retirada na loja'}`,
    ]

    if (fulfillment === 'delivery') {
      rows.push(`*Bairro:* ${effectiveNeighborhood}`)
      rows.push(`*Endereço:* ${street.trim()}, ${noNumber ? 'S/N' : number.trim()}`)
      if (complement.trim()) rows.push(`*Complemento:* ${complement.trim()}`)
      if (reference.trim()) rows.push(`*Referência:* ${reference.trim()}`)
    } else {
      rows.push(`*Retirada:* ${PICKUP_ADDRESS}`)
    }

    rows.push('', `*Pagamento:* ${paymentLabel[payment]}`)
    if (payment === 'cash') rows.push(needsChange ? `*Troco para:* ${money(parsedChange)}` : '*Troco:* Não precisa')
    if (payment === 'pix') rows.push('*Pix:* comprovante deve ser enviado pelo WhatsApp após o pagamento.')

    rows.push('', '*ITENS DO PEDIDO:*')
    lines.forEach(line => {
      const label = `${line.product.name}${line.product.size ? ` ${line.product.size}` : ''}`
      const pricing = productPricing(line.product, line.qty)
      rows.push(`${line.qty}x ${label} — ${money(pricing.total)}${pricing.savings > 0 ? ` (desconto de caixa: -${money(pricing.savings)})` : ''}`)
    })

    rows.push('', `*Subtotal:* ${money(subtotal)}`)
    if (fulfillment === 'delivery') rows.push(`*Taxa de entrega:* ${money(deliveryFee)}`)
    rows.push(`*TOTAL:* ${money(total)}`)
    return rows.join('\n')
  }

  async function sendWhatsApp() {
    if (sendingLock.current) return
    setPaymentAttempted(true)
    if (!firstStepValid || !lines.length || !user || !fulfillment) { setSendError('Confira seus dados e o carrinho antes de enviar.'); return }
    if (!payment) {
      paymentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!changeValid) {
      cashRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => changeRef.current?.focus(), 350)
      return
    }
    sendingLock.current = true
    setSending(true); setSendError('')
    try {
      const draft: OrderDraft = {
        customer: { name: name.trim(), phone: phone.trim() }, fulfillment,
        address: { neighborhood: effectiveNeighborhood, street: street.trim(), number: noNumber ? 'S/N' : number.trim(), complement: complement.trim(), reference: reference.trim() },
        payment, changeFor: payment === 'cash' && needsChange ? parsedChange : null,
        items: lines.map(line => ({ productId: line.product.id, qty: line.qty })),
      }
      const fingerprint = JSON.stringify(draft)
      const key = 'karavela-order-draft-' + user.uid
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || 'null')
        if (saved?.fingerprint === fingerprint && typeof saved.id === 'string') orderId.current = saved.id
        else { orderId.current = crypto.randomUUID(); sessionStorage.setItem(key, JSON.stringify({ id: orderId.current, fingerprint })) }
      } catch { orderId.current ||= crypto.randomUUID() }
      const order = await submitWhatsAppOrder(user.uid, orderId.current, draft)
      const message = buildWhatsAppMessage() + '\n\n*Pedido:* ' + order.code
      try { sessionStorage.removeItem(key) } catch { /* Browser storage may be disabled. */ }
      onSubmitted()
      window.location.href = 'https://wa.me/' + WHATSAPP_ORDER_NUMBER + '?text=' + encodeURIComponent(message)
    } catch (error) { setSendError(accountError(error)) }
    finally { sendingLock.current = false; setSending(false) }
  }

  const addressSummary = fulfillment === 'delivery'
    ? `${street.trim()}, ${noNumber ? 'S/N' : number.trim()} · ${effectiveNeighborhood}${complement.trim() ? ` · ${complement.trim()}` : ''}`
    : PICKUP_ADDRESS
  const paymentComplete = !!payment && changeValid
  const pixComplete = payment === 'pix'
  const cardComplete = payment === 'credit' || payment === 'debit'
  const cashComplete = payment === 'cash' && changeAnswered && changeValid

  return <section className="checkout-page">
    <div className="checkout-topline">
      <button className="checkout-back" onClick={onBack}><Icon name="back" /> <span>Voltar ao catálogo</span></button>
      <h1>Finalizar pedido</h1>
    </div>

    <div className="checkout-progress">
      <div className={step >= 1 ? 'active' : ''}><b>{step > 1 ? '✓' : '1'}</b><span>Dados</span></div>
      <i />
      <div className={step === 2 ? 'active' : ''}><b>2</b><span>Pagamento</span></div>
    </div>

    {step === 1 && <div className="checkout-stage">
      <section className="checkout-card checkout-customer-card">
        <div className="checkout-card-title"><span>1</span><div><b>Seus dados</b><small>Informe quem vai receber o pedido</small></div>{customerDataValid && <i className="checkout-complete-check" aria-label="Concluído">✓</i>}</div>
        <div className="checkout-fields two-cols-responsive">
          <label className={attempted && !nameValid ? 'invalid' : ''}><span>Nome e sobrenome *</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome e sobrenome" />{attempted && !nameValid && <small>Informe pelo menos nome e sobrenome.</small>}</label>
          <label className={attempted && phoneDigits.length < 10 ? 'invalid' : ''}><span>Telefone/WhatsApp *</span><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(88) 99999-9999" /></label>
        </div>
      </section>

      <section className="checkout-card checkout-fulfillment">
        <div className="checkout-card-title"><span>2</span><div><b>Como quer receber?</b><small>Toque em uma opção para continuar</small></div>{fulfillment && <i className="checkout-complete-check" aria-label="Concluído">✓</i>}</div>
        <div className="fulfillment-grid">
          <button className={fulfillment === 'delivery' ? 'selected' : ''} onClick={() => selectFulfillment('delivery')}>
            <strong>▣</strong><b>Entrega</b><small>Receber em casa</small><em>Escolher <span className="choice-arrow">›</span></em>
          </button>
          <button className={fulfillment === 'pickup' ? 'selected' : ''} onClick={() => selectFulfillment('pickup')}>
            <strong>⌂</strong><b>Retirar na loja</b><small>Eu vou buscar</small><em>Escolher <span className="choice-arrow">›</span></em>
          </button>
        </div>
        {attempted && !fulfillment && <p className="checkout-error">Escolha Entrega ou Retirar na loja.</p>}
      </section>

      {fulfillment === 'delivery' && <section ref={deliveryRef} className="checkout-card checkout-address-card">
        <div className="checkout-card-title"><span>3</span><div><b>Endereço de entrega</b><small>Boa Viagem, CE</small></div>{addressValid && <i className="checkout-complete-check" aria-label="Concluído">✓</i>}</div>
        <div className="checkout-fields">
          <label className={attempted && effectiveNeighborhood.length < 2 ? 'invalid' : ''}><span>Bairro *</span>
            <div className="checkout-input-wrap select-check-wrap">
              <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)}>
                <option value="">Selecione seu bairro</option>
                {BOA_VIAGEM_NEIGHBORHOODS.map(item => <option key={item} value={item}>{item} — {money(deliveryFeeFor(item))}</option>)}
              </select>
              {neighborhood && <i className="field-complete-check" aria-label="Preenchido">✓</i>}
            </div>
          </label>
          {neighborhood === 'Outras' && <label className={attempted && otherNeighborhood.trim().length < 2 ? 'invalid' : ''}><span>Qual bairro? *</span>
            <div className="checkout-input-wrap">
              <input value={otherNeighborhood} onChange={e => setOtherNeighborhood(e.target.value)} placeholder="Digite seu bairro" />
              {otherNeighborhood.trim().length >= 2 && <i className="field-complete-check" aria-label="Preenchido">✓</i>}
            </div>
          </label>}
          <label className={attempted && !streetValid ? 'invalid' : ''}><span>Rua *</span>
            <div className="checkout-input-wrap">
              <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Nome da rua" />
              {streetValid && <i className="field-complete-check" aria-label="Preenchido">✓</i>}
            </div>
          </label>
          <div className="address-pair">
            <label className={attempted && !numberValid ? 'invalid' : ''}><span>Número * <button type="button" className={noNumber ? 'mini-toggle active' : 'mini-toggle'} onClick={() => { setNoNumber(v => !v); setNumber('') }}>Sem nº</button></span>
              <div className="checkout-input-wrap">
                <input inputMode="numeric" pattern="[0-9]*" disabled={noNumber} value={noNumber ? 'S/N' : number} onChange={e => setNumber(e.target.value.replace(/\D/g, ''))} placeholder="123" />
                {numberValid && <i className="field-complete-check" aria-label="Preenchido">✓</i>}
              </div>
            </label>
            <label className={attempted && !complementValid ? 'invalid' : ''}><span>Complemento</span>
              <div className="checkout-input-wrap">
                <input value={complement} onChange={e => setComplement(e.target.value)} placeholder="Apto, casa..." />
                {complement.trim().length >= 5 && <i className="field-complete-check" aria-label="Preenchido">✓</i>}
              </div>
              {complement.trim().length > 0 && complement.trim().length < 5 && <small className="field-rule-hint">Mínimo de 5 caracteres.</small>}
            </label>
          </div>
          <label className={attempted && !referenceValid ? 'invalid' : ''}><span>Ponto de referência *</span>
            <div className="checkout-input-wrap reference-input-wrap">
              <span className="reference-pin" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
              </span>
              <input maxLength={100} value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex: perto da padaria, casa azul..." />
              {referenceValid && <i className="field-complete-check" aria-label="Preenchido">✓</i>}
            </div>
            <small className={reference.trim().length > 0 && !referenceValid ? 'reference-helper invalid-helper' : 'reference-helper'}>Facilita a entrega. {reference.length}/100</small>
          </label>
        </div>
        <div className="checkout-fee-line"><span>Taxa de entrega</span><strong>{effectiveNeighborhood ? money(deliveryFee) : `a partir de ${money(DELIVERY_FEE)}`}</strong></div>
      </section>}

      {fulfillment === 'pickup' && <section ref={pickupRef} className="checkout-card pickup-address-card">
        <div className="checkout-card-title"><span>3</span><div><b>Retirada na loja</b><small>Sem taxa de entrega</small></div><i className="checkout-complete-check" aria-label="Concluído">✓</i></div>
        <div className="pickup-location"><div className="pickup-pin">⌖</div><div><small>Endereço para retirada</small><strong>{PICKUP_ADDRESS}</strong><span>Retirada grátis</span></div></div>
      </section>}

      <div className="checkout-total-card"><span>{fulfillment === 'delivery' ? 'Total com entrega' : 'Total dos itens'}</span><strong>{money(total)}</strong></div>
      <button className="checkout-primary" onClick={continueToPayment}>Continuar para pagamento <span>›</span></button>
    </div>}

    {step === 2 && <div ref={paymentRef} className="checkout-stage payment-stage">
      <section className="checkout-card checkout-summary-card compact-customer-summary">
        <div className="checkout-card-title"><span>✓</span><div><b>{name}</b><small>{phone} · {fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</small></div></div>
        <button onClick={() => { setStep(1); window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50) }}>Editar</button>
      </section>

      <section className="checkout-card payment-card">
        <div className="checkout-card-title"><span>2</span><div><b>Forma de pagamento</b><small>Escolha uma opção para continuar</small></div>{paymentComplete && <i className="checkout-complete-check" aria-label="Concluído">✓</i>}</div>
        <div className="payment-options">
          <button className={payment === 'pix' ? 'selected' : ''} onClick={() => selectPayment('pix')}><span>PIX</span><div><b>Pix</b><small>Pagamento pelo aplicativo do banco</small></div></button>
          <div className={(payment === 'credit' || payment === 'debit') ? 'payment-combined selected fillable-check-card' : 'payment-combined fillable-check-card'}>
            {cardComplete && <i className="checkout-complete-check payment-option-check" aria-label="Concluído">✓</i>}
            <span>▣</span>
            <div className="payment-card-copy"><b>Cartão</b><small>Crédito ou débito</small></div>
            <div className="card-type-buttons"><button className={payment === 'credit' ? 'active' : ''} onClick={() => selectPayment('credit')}>Crédito</button><button className={payment === 'debit' ? 'active' : ''} onClick={() => selectPayment('debit')}>Débito</button></div>
          </div>
          <button className={payment === 'cash' ? 'selected' : ''} onClick={() => selectPayment('cash')}><span>R$</span><div><b>Dinheiro</b><small>Pague na entrega ou retirada</small></div></button>
        </div>
        {paymentAttempted && !payment && <p className="checkout-error">Escolha uma forma de pagamento.</p>}

        {payment === 'pix' && <div ref={pixRef} className="payment-detail pix-detail checkout-pix-box fillable-check-card">{pixComplete && <i className="checkout-complete-check detail-complete-check" aria-label="Concluído">✓</i>}
          <div className="checkout-pix-heading"><span className="checkout-pix-badge">PIX</span><div><b>Dados para pagamento</b><small>Copie a chave e faça o pagamento no seu banco.</small></div></div>
          <div className="checkout-pix-data"><div><small>Titular</small><strong>{PIX_RECEIVER}</strong></div><div><small>Chave Pix (CPF)</small><strong>{PIX_KEY}</strong></div></div>
          <button className={pixCopied ? 'checkout-copy-pix copied' : 'checkout-copy-pix'} type="button" onClick={() => void copyPixKey()}>{pixCopied ? 'Chave Pix copiada!' : 'Copiar chave Pix'}</button>
          <div className="pix-confirmation-note"><b>Confirmação do Pix</b><span>Envie o comprovante junto com o pedido no WhatsApp.</span></div>
          <button type="button" className="payment-next-link" onClick={scrollToSummary}>Continuar <span>›</span></button>
        </div>}

        {payment === 'cash' && <div ref={cashRef} className="payment-detail cash-detail fillable-check-card">{cashComplete && <i className="checkout-complete-check detail-complete-check" aria-label="Concluído">✓</i>}
          <b>Precisa de troco?</b>
          <span>Escolha uma opção para continuar.</span>
          <div className="change-actions">
            <button className={changeAnswered && !needsChange ? 'active' : ''} onClick={() => { setNeedsChange(false); setChangeAnswered(true); setChangeFor(''); scrollToSummary() }}>Não preciso</button>
            <button className={changeAnswered && needsChange ? 'active' : ''} onClick={() => { setNeedsChange(true); setChangeAnswered(true); window.setTimeout(() => changeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80) }}>Preciso de troco</button>
          </div>
          {needsChange && <label className={!changeValid && paymentAttempted ? 'invalid' : ''}><span>Troco para quanto?</span><input ref={changeRef} inputMode="decimal" value={changeFor} onChange={e => setChangeFor(e.target.value.replace(/[^0-9,.]/g, ''))} onBlur={() => { if (Number(changeFor.replace(',', '.')) > total) scrollToSummary() }} placeholder="Ex.: 50,00" />{!changeValid && (paymentAttempted || changeFor) && <small>O valor precisa ser maior que {money(total)}.</small>}</label>}
        </div>}
      </section>

      <section ref={summaryRef} className="checkout-card order-review-card">
        <div className="review-heading"><b>Resumo do pedido</b><small>Confira antes de enviar</small></div>
        <div className="review-block"><div><small>CLIENTE</small><strong>{name}</strong><span>{phone}</span></div><button onClick={() => setStep(1)}>Editar</button></div>
        <div className="review-block"><div><small>{fulfillment === 'delivery' ? 'ENTREGA' : 'RETIRADA'}</small><strong>{addressSummary}</strong>{fulfillment === 'delivery' && reference.trim() && <span>Referência: {reference.trim()}</span>}</div><button onClick={() => setStep(1)}>Editar</button></div>
        <div className="review-block"><div><small>PAGAMENTO</small><strong>{payment ? paymentLabel[payment] : 'Escolha a forma de pagamento'}</strong>{payment === 'cash' && changeAnswered && <span>{needsChange ? `Troco para ${changeFor || '...'}` : 'Sem troco'}</span>}</div></div>
        <div className="review-items"><small>{lines.length} {lines.length === 1 ? 'ITEM' : 'ITENS'}</small>{lines.map(line => { const pricing = productPricing(line.product, line.qty); return <div key={line.product.id}><span>{line.qty}x {line.product.name}{line.product.size ? ` ${line.product.size}` : ''}{pricing.savings > 0 && <em> Desconto aplicado</em>}</span><b>{money(pricing.total)}</b></div> })}</div>
        <div className="review-totals"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{fulfillment === 'delivery' && <div><span>Taxa de entrega</span><b>{money(deliveryFee)}</b></div>}<div className="review-grand"><span>Total</span><strong>{money(total)}</strong></div></div>
      </section>

      <div className="checkout-final-actions">
        <button className="checkout-secondary" onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Voltar</button>
        <button className="checkout-whatsapp" onClick={() => void sendWhatsApp()} disabled={sending}>{sending ? 'Registrando pedido…' : 'Enviar pedido para o WhatsApp'} <span>›</span></button>
      </div>
    </div>}
    {sendError && <p className="checkout-error order-send-error" role="alert">{sendError}</p>}
  </section>
}

function ProductRail({ categoryId, categories, products, onOpen, onAll, mediaConfig }: { categoryId: string; categories: CatalogCategory[]; products: Product[]; onOpen: (p: Product) => void; onAll: (id: string) => void; mediaConfig: MediaConfig }) {
  const category = categories.find(c => c.id === categoryId)
  const rawItems = products.filter(product => product.categoryId === categoryId)
  const items = categoryId === 'cervejas' ? sortBeerProducts(rawItems) : rawItems
  if (!category || !items.length) return null
  return <section className="section product-section">
    <div className="section-title"><h2>{category.label}</h2><button onClick={() => onAll(category.id)}>Ver todas <span className="blink-arrow"><Icon name="arrow"/></span></button></div>
    <div className="rail-wrap"><div className="product-strip">{items.map(product => <ProductCard key={product.id} product={product} onOpen={onOpen} media={mediaConfig[product.id]}/>)}</div>{items.length > 3 && <div className="rail-arrow"><Icon name="arrow"/></div>}</div>
  </section>
}


function BeerCategoryPage({ products: allProducts, filter, onFilter, onHome, onOpen, mediaConfig }: {
  products: Product[]
  filter: BeerFilterId
  onFilter: (filter: BeerFilterId) => void
  onHome: () => void
  onOpen: (product: Product) => void
  mediaConfig: MediaConfig
}) {
  const filtered = filterBeerProducts(allProducts, filter)

  return <section className="beer-category-page">
    <button className="beer-home-link" onClick={onHome}><Icon name="back"/> <span>Início</span></button>

    <div className="beer-category-heading">
      <div className="beer-category-name"><span className="beer-category-icon"><CategoryIcon name="beer-mug"/></span><h1>Cervejas</h1></div>
      <span className="beer-count">{filtered.length} de {allProducts.length}</span>
    </div>

    <div className="beer-filter-sticky">
      <span className="beer-filter-label">TAMANHO</span>
      <div className="beer-filter-scroll">
        {beerFilters.map(option => <button key={option.id} className={filter === option.id ? 'active' : ''} onClick={() => onFilter(option.id)}>{option.label}</button>)}
      </div>
      <span className="size-filter-arrow" aria-hidden="true"><Icon name="arrow"/></span>
    </div>

    <div className="category-product-grid beer-product-grid">
      {filtered.map(product => <ProductCard key={product.id} product={product} onOpen={onOpen} media={mediaConfig[product.id]}/>) }
    </div>
  </section>
}


function EnergyCategoryPage({ products: allProducts, filter, onFilter, onHome, onOpen, mediaConfig }: {
  products: Product[]
  filter: EnergyFilterId
  onFilter: (filter: EnergyFilterId) => void
  onHome: () => void
  onOpen: (product: Product) => void
  mediaConfig: MediaConfig
}) {
  const filtered = filterEnergyProducts(allProducts, filter)

  return <section className="beer-category-page energy-category-page">
    <button className="beer-home-link" onClick={onHome}><Icon name="back"/> <span>Início</span></button>

    <div className="beer-category-heading">
      <div className="beer-category-name"><span className="beer-category-icon energy-category-icon"><CategoryIcon name="energy-can"/></span><h1>Energéticos</h1></div>
      <span className="beer-count">{filtered.length} de {allProducts.length}</span>
    </div>

    <div className="beer-filter-sticky">
      <span className="beer-filter-label">TIPO</span>
      <div className="beer-filter-scroll">
        {energyFilters.map(option => <button key={option.id} className={filter === option.id ? 'active' : ''} onClick={() => onFilter(option.id)}>{option.label}</button>)}
      </div>
    </div>

    <div className="category-product-grid beer-product-grid">
      {filtered.map(product => <ProductCard key={product.id} product={product} onOpen={onOpen} media={mediaConfig[product.id]}/>) }
    </div>
  </section>
}

export default function App() {
  const { user, profile, isOwner, loading: sessionLoading } = useSession()
  const [accountView, setAccountView] = useState<'account' | 'orders' | 'admin' | null>(() => { const route = window.location.hash.slice(2); return route === 'conta' ? 'account' : route === 'pedidos' ? 'orders' : route === 'admin' ? 'admin' : null })
  const [serviceNotice, setServiceNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [addedNotice, setAddedNotice] = useState<{ product: Product; qty: number } | null>(null)
  const [minimumNotice, setMinimumNotice] = useState<{ total: number } | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [beerFilter, setBeerFilter] = useState<BeerFilterId>('all')
  const [energyFilter, setEnergyFilter] = useState<EnergyFilterId>('all')
  const [adminOpen, setAdminOpen] = useState(false)
  const [savedMediaConfig, setMediaConfig] = useState<MediaConfig>(mediaSnapshot as MediaConfig)
  // As novas caixas começam com a foto já cadastrada da mesma cerveja.
  // Uma edição na caixa passa a ter seu próprio ajuste, sem alterar a unidade.
  const mediaConfig = useMemo(() => {
    const merged = { ...savedMediaConfig }
    for (const product of baseProducts) {
      if (product.categoryId !== 'cervejas-300-caixa' || merged[product.id]) continue
      const unitId = product.id.replace('cervejas-300-caixa-', 'cervejas-300-unidades-')
      if (savedMediaConfig[unitId]) merged[product.id] = savedMediaConfig[unitId]
    }
    return merged
  }, [savedMediaConfig])
  const [catalogConfig, setCatalogConfig] = useState<CatalogConfig>(catalogSnapshot as CatalogConfig)
  const [catalogReady, setCatalogReady] = useState(false)
  // Mantém a Home completamente parada enquanto a área administrativa está aberta.
  // O painel administrativo continua rolável; somente a página atrás fica bloqueada.
  useEffect(() => {
    if (!adminOpen) return

    const body = document.body
    const html = document.documentElement
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior
    const previousHtmlOverflow = html.style.overflow
    const previousHtmlOverscroll = html.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
      html.style.overflow = previousHtmlOverflow
      html.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [adminOpen])

  // Mantém a Home parada enquanto o produto está aberto,
  // sem usar position: fixed e sem executar scrollTo ao fechar.
  // Assim a página de trás não "salta" depois que o modal é fechado.
  useEffect(() => {
    if (!selected) return

    const body = document.body
    const html = document.documentElement

    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior
    const previousHtmlOverflow = html.style.overflow
    const previousHtmlOverscroll = html.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
      html.style.overflow = previousHtmlOverflow
      html.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [selected])

  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('karavela-distribuidora-cart') || '[]') as CartLine[]
      return saved.flatMap(line => {
        const currentProduct = baseProducts.find(product => product.id === line.product.id)
        if (!currentProduct) return []
        return [{ product: currentProduct, qty: line.qty, unitPrice: productPricing(currentProduct, line.qty).effectiveUnitPrice }]
      })
    } catch { return [] }
  })
  const cartButton = useRef<HTMLButtonElement>(null)

  useEffect(() => { localStorage.setItem('karavela-distribuidora-cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => {
    setCatalogReady(true)
    if (!firebaseReady) return
    const failed = () => setServiceNotice('Não foi possível atualizar o catálogo. Confira sua conexão.')
    const offMedia = watchSetting<MediaConfig>('media', setMediaConfig, failed)
    const offCatalog = watchSetting<CatalogConfig>('catalog', setCatalogConfig, failed)
    return () => { offMedia(); offCatalog() }
  }, [])
  useEffect(() => {
    const syncHash = () => { const route = window.location.hash.slice(2); setAccountView(route === 'conta' ? 'account' : route === 'pedidos' ? 'orders' : route === 'admin' ? 'admin' : null) }
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])
  useEffect(() => { if (!isOwner) setAdminOpen(false) }, [isOwner])
  useEffect(() => {
    if (!addedNotice) return
    const timer = window.setTimeout(() => setAddedNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [addedNotice])
  useEffect(() => {
    if (!minimumNotice) return
    const timer = window.setTimeout(() => setMinimumNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [minimumNotice])

  const catalogBrands = catalogConfig.brands ?? defaultBrands
  const catalogCategories = useMemo(() => {
    const configured = catalogConfig.categories ?? defaultCategories
    if ((catalogConfig.revision ?? 0) >= 1 || configured.some(category => category.id === 'cervejas-300-caixa')) return configured
    const crateCategory = defaultCategories.find(category => category.id === 'cervejas-300-caixa')!
    const index = configured.findIndex(category => category.id === 'cervejas-300-unidades')
    const next = [...configured]
    next.splice(index >= 0 ? index + 1 : 0, 0, crateCategory)
    return next
  }, [catalogConfig.categories, catalogConfig.revision])
  const catalogProducts = useMemo(() => {
    const hidden = new Set(catalogConfig.hiddenProductIds ?? [])
    const allowedCategories = new Set(catalogCategories.map(category => category.id))
    return baseProducts.filter(product => !hidden.has(product.id) && allowedCategories.has(product.categoryId))
  }, [catalogConfig.hiddenProductIds, catalogCategories])

  useEffect(() => {
    if (!catalogReady) return
    const visibleIds = new Set(catalogProducts.map(product => product.id))
    setCart(previous => previous.filter(line => visibleIds.has(line.product.id)))
    if (selected && !visibleIds.has(selected.id)) setSelected(null)
    if (activeCategoryId && !catalogCategories.some(category => category.id === activeCategoryId)) {
      setActiveCategoryId(null)
    }
  }, [catalogProducts, catalogCategories, catalogReady, selected, activeCategoryId])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    if (!q) return []
    return catalogProducts.filter(p => `${p.name} ${p.category} ${p.size}`.toLocaleLowerCase('pt-BR').includes(q))
  }, [query, catalogProducts])

  const count = cart.reduce((s, l) => s + l.qty, 0)
  const activeCategory = catalogCategories.find(c => c.id === activeCategoryId)
  const activeProducts = activeCategoryId ? catalogProducts.filter(product => product.categoryId === activeCategoryId) : []
  const allBeerProducts = catalogProducts.filter(product => beerCategoryIds.includes(product.categoryId))
  const allEnergyProducts = catalogProducts.filter(product => product.categoryId === 'energeticos')

  function closeSearch() { setSearchOpen(false); setQuery('') }
  function goHome() { setAccountView(null); setCheckoutOpen(false); if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search); setActiveCategoryId(null); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function openCategory(id: string) { setAccountView(null); setCheckoutOpen(false); if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search); if (id === 'cervejas') setBeerFilter('all'); if (id === 'energeticos') setEnergyFilter('all'); setActiveCategoryId(id); setMenuOpen(false); closeSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  function checkBanner(destination: BannerDestination) {
    if (destination === 'catalogo') {
      document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (destination === 'brahma-caixa') {
      openCategory('cervejas-300-caixa')
      const brahma = catalogProducts.find(product => product.id === 'cervejas-300-caixa-brahma-300ml')
      if (brahma) openProduct(brahma)
    } else {
      openCategory('long-necks')
    }
  }

  function fly(from: HTMLElement) {
    const target = cartButton.current
    if (!target) return
    const a = from.getBoundingClientRect(), b = target.getBoundingClientRect()
    const el = document.createElement('div')
    el.className = 'fly-drink'
    el.innerHTML = '<span></span>'
    el.style.left = `${a.left + a.width / 2 - 10}px`
    el.style.top = `${a.top + a.height / 2 - 18}px`
    document.body.appendChild(el)
    requestAnimationFrame(() => { el.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(.45) rotate(18deg)`; el.style.opacity = '0.2' })
    setTimeout(() => { el.remove(); target.classList.add('cart-pop'); setTimeout(() => target.classList.remove('cart-pop'), 420) }, 650)
  }

  function add(product: Product, qty: number, unitPrice: number, el: HTMLElement) {
    void unitPrice
    setCart(prev => {
      const ex = prev.find(x => x.product.id === product.id)
      if (ex) return prev.map(x => {
        if (x.product.id !== product.id) return x
        const nextQty = x.qty + qty
        return { ...x, product, qty: nextQty, unitPrice: productPricing(product, nextQty).effectiveUnitPrice }
      })
      return [...prev, { product, qty, unitPrice: productPricing(product, qty).effectiveUnitPrice }]
    })
    fly(el)
    setAddedNotice({ product, qty })
    setSelected(null)
  }

  function openProduct(product: Product) { closeSearch(); setSelected(product) }
  function openAccount(view: 'account' | 'orders' | 'admin') { setAccountView(view); setCheckoutOpen(false); setMenuOpen(false); closeSearch(); window.location.hash = view === 'account' ? '/conta' : view === 'orders' ? '/pedidos' : '/admin'; window.scrollTo({ top: 0 }) }

  function checkout(total: number) {
    if (total < 20) {
      setMinimumNotice({ total })
      return
    }
    setMinimumNotice(null)
    setCartOpen(false)
    setAccountView(null)
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search)
    setCheckoutOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <div className="app-shell">
    <header className="topbar"><div className="top-left"><button className="icon-btn menu-trigger" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><StoreStatus/></div><img className="top-logo" src="/assets/logo-karavela.png" alt="Karavela Bistrô & Distribuidora"/><div className="top-actions"><button className="icon-btn search-trigger" aria-label="Buscar bebidas" onClick={() => { setSearchOpen(v => !v); setQuery('') }}><Icon name="search"/></button><button ref={cartButton} className="icon-btn cart-btn" aria-label="Abrir carrinho" onClick={() => setCartOpen(true)}><Icon name="cart"/>{count > 0 && <><span className="drink-dot"/><span className="cart-count">{count}</span></>}</button></div></header>

    {searchOpen && <><div className="search-dismiss" onMouseDown={closeSearch}/><div className="search-popover" onMouseDown={e => e.stopPropagation()}><div className="search-panel"><Icon name="search"/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar bebida pelo nome..."/><button onClick={closeSearch}><Icon name="close"/></button></div>{query.trim() && <div className="search-results">{filtered.length ? filtered.slice(0, 12).map(p => <button key={p.id} className="search-result" onClick={() => openProduct(p)}><span className="search-result-image"><ManagedProductImage src={p.image} alt="" settings={mediaConfig[p.id]?.card}/></span><span className="search-result-copy"><strong>{p.name}</strong><small>{p.category}{p.size ? ` • ${p.size}` : ''}</small></span><b>{money(p.price)}</b></button>) : <div className="search-empty">Nenhum produto encontrado.</div>}</div>}</div></>}

    {addedNotice && <aside className="added-notice" role="status" aria-live="polite">
      <div className="added-notice-image"><ManagedProductImage src={addedNotice.product.image} alt="" settings={mediaConfig[addedNotice.product.id]?.card} /></div>
      <div className="added-notice-copy">
        <div className="added-label"><span className="added-check">✓</span><strong>ADICIONADO</strong></div>
        <div className="added-product">{addedNotice.qty}× {addedNotice.product.name}{addedNotice.product.size ? ` ${addedNotice.product.size}` : ''}</div>
        <button onClick={() => { setAddedNotice(null); setCartOpen(true) }}>Ver carrinho <span>→</span></button>
      </div>
      <button className="added-close" aria-label="Fechar notificação" onClick={() => setAddedNotice(null)}><Icon name="close" /></button>
    </aside>}

    {serviceNotice && <p className="service-notice" role="status">{serviceNotice}</p>}
    <main>
      {accountView || checkoutOpen ? (sessionLoading ? <div className="account-page" role="status">Carregando sua conta…</div> : !user ? <AuthScreen title={checkoutOpen ? 'Entre para enviar seu pedido' : accountView === 'admin' ? 'Acesso do administrador' : 'Minha conta'} onBack={goHome} onSuccess={() => undefined}/> : accountView === 'orders' ? <CustomerOrders onBack={goHome}/> : accountView === 'admin' && isOwner ? <OwnerDashboard onBack={goHome} onPhotos={() => setAdminOpen(true)}/> : checkoutOpen ? <CheckoutScreen lines={cart} onBack={goHome} onSubmitted={() => { setCart([]); openAccount('orders') }}/> : <AccountScreen onBack={goHome} onOrders={() => openAccount('orders')} onAdmin={() => openAccount('admin')}/>) : !activeCategory ? <>
        <HomeBanner onCheck={checkBanner} paused={menuOpen || cartOpen || searchOpen || adminOpen || !!selected || !!accountView}/>
        <section id="catalogo" className="section category-section"><div className="section-title"><h2>Categorias</h2></div><div className="rail-wrap"><div className="category-strip">{catalogCategories.map(category => <button className={`category-card${category.image ? ' category-card--photo' : ''}`} key={category.id} onClick={() => openCategory(category.id)}>{category.image ? <CategoryCardPhoto src={freshCatalogImageUrl(category.image)} label={category.label} style={catalogImageStyle(category)}/> : <><CategoryIcon name={category.icon}/><CategoryCardLabel label={category.label}/></>}</button>)}</div><div className="rail-arrow category-arrow"><Icon name="arrow"/></div></div></section>
        {catalogCategories.map(category => <ProductRail key={category.id} categoryId={category.id} categories={catalogCategories} products={catalogProducts} onOpen={openProduct} onAll={openCategory} mediaConfig={mediaConfig}/>)}
        <SiteFooter/>
      </> : activeCategoryId === 'cervejas' ? <BeerCategoryPage products={allBeerProducts} filter={beerFilter} onFilter={setBeerFilter} onHome={goHome} onOpen={openProduct} mediaConfig={mediaConfig} /> : activeCategoryId === 'energeticos' ? <EnergyCategoryPage products={allEnergyProducts} filter={energyFilter} onFilter={setEnergyFilter} onHome={goHome} onOpen={openProduct} mediaConfig={mediaConfig} /> : activeCategory ? <section className="category-page"><div className="category-page-head"><button className="back-btn" onClick={goHome} aria-label="Voltar"><Icon name="back"/></button><h1>{activeCategory.label}</h1></div><div className="category-product-grid">{activeProducts.map(product => <ProductCard key={product.id} product={product} onOpen={openProduct} media={mediaConfig[product.id]}/>)}</div></section> : null}
    </main>

    {menuOpen && <SideMenu categories={catalogCategories} onClose={() => setMenuOpen(false)} onCart={() => { setMenuOpen(false); setCartOpen(true) }} onHome={goHome} onCategory={openCategory} onAdmin={() => openAccount('admin')} onAccount={() => openAccount('account')} onOrders={() => openAccount('orders')} isOwner={isOwner} accountName={user ? (profile?.name || user.displayName || 'Minha conta') : ''}/>}
    {cartOpen && <CartDrawer lines={cart} onClose={() => { setCartOpen(false); setMinimumNotice(null) }} onQty={(id, q) => setCart(prev => prev.map(x => x.product.id === id ? { ...x, qty: q, unitPrice: productPricing(x.product, q).effectiveUnitPrice } : x))} onRemove={id => setCart(prev => prev.filter(x => x.product.id !== id))} onCheckout={checkout} minimumNotice={minimumNotice} onCloseMinimumNotice={() => setMinimumNotice(null)} mediaConfig={mediaConfig}/>}
    {selected && <ProductSheet product={selected} onClose={() => setSelected(null)} onAdd={add} media={mediaConfig[selected.id]}/>}
    {adminOpen && isOwner && <AdminMedia products={catalogProducts} brands={catalogBrands} categories={catalogCategories} catalogConfig={{ ...catalogConfig, revision: 1, categories: catalogCategories }} config={mediaConfig} detailImageForProduct={(product) => detailImageByProductId[product.id] ?? product.image} onClose={() => setAdminOpen(false)} onSaved={setMediaConfig} onCatalogSaved={setCatalogConfig}/>}
  </div>
}
