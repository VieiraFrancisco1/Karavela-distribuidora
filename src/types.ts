export type Tier = {
  qty: number
  unitPrice: number
}

export type ProductKind = 'common' | 'returnable' | 'pack'

export type Product = {
  id: string
  name: string
  category: string
  categoryId: string
  size: string
  price: number
  image: string
  kind: ProductKind
  cold?: boolean
  provisional?: boolean
  basePrice?: number
  tiers?: Tier[]
  packUnits?: number
  description?: string
}

export type CartLine = {
  product: Product
  qty: number
  unitPrice: number
}


export type CatalogImageAdjustments = {
  imageScale?: number
  imageX?: number
  imageY?: number
}

export type CatalogBrand = CatalogImageAdjustments & {
  id: string
  name: string
  image?: string | null
  accent?: string
}

export type CatalogCategory = CatalogImageAdjustments & {
  id: string
  label: string
  icon: string
  image?: string | null
}

export type CatalogConfig = {
  hiddenProductIds?: string[]
  brands?: CatalogBrand[]
  categories?: CatalogCategory[]
}
