import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { requireDb } from './firebaseClient'
import type { CatalogConfig } from './types'
import type { MediaConfig, MediaViewSettings } from './mediaAdmin'
import type { OrderDraft, StoreOrder } from './ordersModel'
import { orderPricing } from './ordersModel'
import { persistWhatsAppOrder } from './orderPersistence'

export function watchSetting<T>(name: string, callback: (value: T) => void, error: (error: Error) => void) {
  return onSnapshot(doc(requireDb(), 'settings', name), snapshot => {
    if (snapshot.exists()) callback(snapshot.data() as T)
  }, error)
}
export async function saveCatalogConfig(config: CatalogConfig) {
  await setDoc(doc(requireDb(), 'settings', 'catalog'), config)
  return config
}
export type MediaPatch = { productId: string; slot: 'card' | 'detail'; value: MediaViewSettings | null }
export async function saveMediaPatches(operations: MediaPatch[]): Promise<MediaConfig> {
  const ref = doc(requireDb(), 'settings', 'media')
  return runTransaction(requireDb(), async transaction => {
    const current = await transaction.get(ref)
    const config = (current.exists() ? current.data() : {}) as MediaConfig
    for (const operation of operations) {
      const settings = { ...config[operation.productId] }
      if (operation.value) settings[operation.slot] = operation.value
      else delete settings[operation.slot]
      if (settings.card || settings.detail) config[operation.productId] = settings
      else delete config[operation.productId]
    }
    transaction.set(ref, config)
    return config
  })
}
export async function uploadPhoto(file: Blob) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.')
  const source = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Não foi possível abrir a imagem.')); img.src = source })
    let side = 1800
    let quality = 0.92
    let result: Blob | null = null
    for (let i = 0; i < 6; i++) {
      const scale = Math.min(1, side / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Não foi possível preparar a imagem.')
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality))
      if (result && result.size < 650_000) break
      side = Math.round(side * 0.85); quality -= 0.025
    }
    if (!result || result.size >= 650_000) throw new Error('Escolha uma foto menor.')
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(result!) })
    const ref = doc(collection(requireDb(), 'photos'))
    await setDoc(ref, { dataUrl, createdAt: serverTimestamp() })
    return 'fmedia:' + ref.id
  } finally { URL.revokeObjectURL(source) }
}
const photoPromises = new Map<string, Promise<string>>()
export async function resolvePhotoUrl(url: string) {
  if (!url.startsWith('fmedia:')) return url
  const id = url.slice(7).split('?')[0]
  if (!photoPromises.has(id)) photoPromises.set(id, (async () => {
    const snapshot = await getDoc(doc(requireDb(), 'photos', id))
    if (!snapshot.exists() || typeof snapshot.data().dataUrl !== 'string') throw new Error('Foto não encontrada.')
    return snapshot.data().dataUrl as string
  })().catch(error => { photoPromises.delete(id); throw error }))
  return photoPromises.get(id)!
}
export const submitWhatsAppOrder = (customerId: string, id: string, draft: OrderDraft) => persistWhatsAppOrder(requireDb(), customerId, id, draft)
export async function finishOrder(order: StoreOrder) {
  const settlement = orderPricing(order)
  if (!settlement) throw new Error('Há um item inválido neste pedido. Confira com o cliente antes de finalizar.')
  await updateDoc(doc(requireDb(), 'orders', order.id), { status: 'completed', completedAt: serverTimestamp(), settlement })
}
export async function hideOrder(id: string) { await updateDoc(doc(requireDb(), 'orders', id), { deletedAt: serverTimestamp() }) }
export async function restoreOrder(id: string) { await updateDoc(doc(requireDb(), 'orders', id), { deletedAt: null }) }
