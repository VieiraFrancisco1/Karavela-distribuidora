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
