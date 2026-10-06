import { products } from './data'
import { deliveryFeeFor, productPricing, roundMoney } from './pricing'

export type OrderItem = { productId: string; qty: number }
export type OrderDraft = {
  customer: { name: string; phone: string }
  fulfillment: 'delivery' | 'pickup'
  address: { neighborhood: string; street: string; number: string; complement: string; reference: string }
  payment: 'pix' | 'credit' | 'debit' | 'cash'
  changeFor: number | null
  items: OrderItem[]
}
export type Settlement = { subtotal: number; deliveryFee: number; total: number }
export type StoreOrder = OrderDraft & {
  id: string; code: string; customerId: string; status: 'pending' | 'completed'
  createdAt: number; completedAt: number | null; deletedAt: number | null; settlement: Settlement | null
}
const catalog = new Map(products.map(product => [product.id, product]))
export function orderPricing(order: OrderDraft): Settlement | null {
  if (!Array.isArray(order.items) || !order.items.length || order.items.length > 200) return null
  let subtotal = 0
  const ids = new Set<string>()
  for (const item of order.items) {
    const product = catalog.get(item.productId)
    if (!product || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 999 || ids.has(item.productId)) return null
    ids.add(item.productId)
    subtotal += productPricing(product, item.qty).total
  }
  const fee = order.fulfillment === 'delivery' ? deliveryFeeFor(order.address.neighborhood) : 0
  return { subtotal: roundMoney(subtotal), deliveryFee: fee, total: roundMoney(subtotal + fee) }
}
export const orderTotal = (order: StoreOrder) => order.status === 'completed' ? order.settlement?.total ?? 0 : orderPricing(order)?.total ?? 0
export const orderProduct = (id: string) => catalog.get(id)
export function storeDay(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp)
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return part('year') + '-' + part('month') + '-' + part('day')
}
export function periodBounds(value: string, monthly: boolean) {
  const start = new Date(value + (monthly ? '-01' : '') + 'T00:00:00-03:00')
  const end = new Date(start)
  if (monthly) end.setUTCMonth(end.getUTCMonth() + 1)
  else end.setUTCDate(end.getUTCDate() + 1)
  if (!Number.isFinite(start.getTime())) throw new Error('Selecione uma data válida.')
  return { start: start.getTime(), end: end.getTime() }
}
export function summarizeOrders(orders: StoreOrder[]) {
  const visible = orders.filter(order => !order.deletedAt)
  const completed = visible.filter(order => order.status === 'completed' && order.settlement)
  return {
    received: visible.length, pending: visible.filter(order => order.status === 'pending').length,
    completed: completed.length, revenue: roundMoney(completed.reduce((sum, order) => sum + order.settlement!.total, 0)),
    delivery: roundMoney(completed.reduce((sum, order) => sum + order.settlement!.deliveryFee, 0)),
    payments: Object.fromEntries(['pix', 'credit', 'debit', 'cash'].map(payment => [payment, roundMoney(completed.filter(order => order.payment === payment).reduce((sum, order) => sum + order.settlement!.total, 0))])),
  }
}
