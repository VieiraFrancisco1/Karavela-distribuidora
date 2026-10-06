import type { Product, Tier } from './types'
export const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const productPricing = (product: Product, qty: number) => {
  const safeQty = Math.max(1, qty)
  const tier = (product.tiers ?? []).filter(option => safeQty >= option.qty).sort((a, b) => b.qty - a.qty)[0]
  if (!tier) return { total: roundMoney(safeQty * product.price), effectiveUnitPrice: product.price, savings: 0, tier: null as Tier | null }
  const bundles = Math.floor(safeQty / tier.qty)
  const total = roundMoney(bundles * tier.qty * tier.unitPrice + (safeQty % tier.qty) * product.price)
  return { total, effectiveUnitPrice: total / safeQty, savings: roundMoney(safeQty * product.price - total), tier }
}
export const deliveryFeeFor = (neighborhood: string) => ['floresta', 'capitão mor'].includes(neighborhood.trim().toLowerCase()) ? 4 : 3
