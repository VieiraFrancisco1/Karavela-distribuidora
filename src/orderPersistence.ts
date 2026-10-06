import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { OrderDraft } from './ordersModel'
import { orderPricing } from './ordersModel'
export async function persistWhatsAppOrder(db: Firestore, customerId: string, id: string, draft: OrderDraft) {
  if (!orderPricing(draft)) throw new Error('O carrinho contém um item inválido. Confira os produtos.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(draft)))
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const ref = doc(db, 'orders', id)
  return runTransaction(db, async transaction => {
    const existing = await transaction.get(ref)
    if (existing.exists()) {
      if (existing.data().customerId !== customerId || existing.data().fingerprint !== fingerprint) throw new Error('Este envio já foi registrado. Confira Meus pedidos antes de tentar novamente.')
      return { id, code: String(existing.data().code) }
    }
    const code = 'KD-' + id.replace(/-/g, '').slice(0, 8).toUpperCase()
    transaction.set(ref, { ...draft, items: Object.fromEntries(draft.items.map(item => [item.productId, item.qty])), customerId, fingerprint, code, source: 'whatsapp', status: 'pending', createdAt: serverTimestamp(), completedAt: null, deletedAt: null, settlement: null })
    return { id, code }
  })
}
