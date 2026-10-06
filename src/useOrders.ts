import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { requireDb } from './firebaseClient'
import type { StoreOrder } from './ordersModel'
import { accountError } from './AccountScreen'

type Scope = { customerId?: string; pending?: boolean; start?: number; end?: number }
const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : typeof value === 'number' ? value : null
export function useOrders({ customerId, pending, start, end }: Scope) {
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true); setError(''); setOrders([])
    const filters = []
    if (customerId) filters.push(where('customerId', '==', customerId))
    if (pending) filters.push(where('status', '==', 'pending'))
    if (start !== undefined) filters.push(where('createdAt', '>=', Timestamp.fromMillis(start)))
    if (end !== undefined) filters.push(where('createdAt', '<', Timestamp.fromMillis(end)))
    filters.push(orderBy('createdAt', 'desc'))
    try {
      return onSnapshot(query(collection(requireDb(), 'orders'), ...filters), snapshot => {
        setOrders(snapshot.docs.map(item => { const data = item.data(); return { ...data, items: Object.entries(data.items ?? {}).map(([productId, qty]) => ({ productId, qty: typeof qty === 'number' ? qty : 0 })), id: item.id, createdAt: millis(data.createdAt) ?? Date.now(), completedAt: millis(data.completedAt), deletedAt: millis(data.deletedAt) } as StoreOrder }))
        setLoading(false)
      }, failure => { setError(accountError(failure)); setLoading(false) })
    } catch (failure) { setError(accountError(failure)); setLoading(false) }
  }, [customerId, pending, start, end])
  return { orders, loading, error }
}
