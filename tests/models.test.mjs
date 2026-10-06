import test from 'node:test'
import assert from 'node:assert/strict'
import { accountIdentity } from '../src/accountIdentity.ts'
import { orderPricing, periodBounds, storeDay, summarizeOrders } from '../src/ordersModel.ts'
import { products } from '../src/data.ts'
const draft = { customer: { name: 'Cliente Teste', phone: '88999999999' }, fulfillment: 'pickup', address: { neighborhood: '', street: '', number: '', complement: '', reference: '' }, payment: 'pix', changeFor: null, items: [] }
test('telefone com ou sem DDI acessa a mesma identidade; email preservado', () => {
  assert.equal(accountIdentity('(88) 99999-9999').email, accountIdentity('+55 88 99999-9999').email)
  assert.equal(accountIdentity(' CLIENTE@EXAMPLE.COM ').email, 'cliente@example.com')
  assert.throws(() => accountIdentity('12345'))
  assert.throws(() => accountIdentity('5588999999999@telefone.karavela.invalid'))
})
test('preço da caixa e desconto da lata usam catálogo; dados de preço enviados não influenciam', () => {
  const crate = products.find(product => product.categoryId === 'cervejas-300-caixa' && product.name.startsWith('Brahma —'))
  assert.equal(orderPricing({ ...draft, items: [{ productId: crate.id, qty: 2, price: 0.01 }] }).total, 127.6)
  const can = products.find(product => product.categoryId === 'cervejas-lata' && product.name === 'Skol')
  assert.equal(orderPricing({ ...draft, items: [{ productId: can.id, qty: 12 }] }).total, 43.8)
  assert.equal(orderPricing({ ...draft, fulfillment: 'delivery', address: { ...draft.address, neighborhood: 'Floresta' }, items: [{ productId: crate.id, qty: 1 }] }).total, 67.8)
  assert.equal(orderPricing({ ...draft, items: [{ productId: 'nao-existe', qty: 1 }] }), null)
  assert.equal(orderPricing({ ...draft, items: [{ productId: crate.id, qty: -2 }] }), null)
})
test('relatório usa valores confirmados pelo dono e exclui pendentes/excluídos da receita', () => {
  const completed = { ...draft, status: 'completed', deletedAt: null, settlement: { subtotal: 63.8, deliveryFee: 3, total: 66.8 } }
  const stats = summarizeOrders([completed, { ...completed, deletedAt: 5 }, { ...draft, status: 'pending', deletedAt: null, total: 100000 }])
  assert.deepEqual({ received: stats.received, completed: stats.completed, pending: stats.pending, revenue: stats.revenue, delivery: stats.delivery }, { received: 2, completed: 1, pending: 1, revenue: 66.8, delivery: 3 })
})
test('dia e mês seguem Fortaleza, inclusive virada de ano', () => {
  assert.equal(storeDay(Date.parse('2026-10-07T01:30:00Z')), '2026-10-06')
  const december = periodBounds('2026-12', true)
  assert.equal(new Date(december.end).toISOString(), '2027-01-01T03:00:00.000Z')
  const day = periodBounds('2026-10-06', false)
  assert.equal(day.end - day.start, 86400000)
})
