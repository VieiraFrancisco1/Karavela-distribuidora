import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp, updateDoc } from 'firebase/firestore'
import { persistWhatsAppOrder } from '../src/orderPersistence.ts'
import { products } from '../src/data.ts'
import { accountIdentity } from '../src/accountIdentity.ts'
let env
const ownerEmail = 'dono@example.com'
const item = products.find(product => product.categoryId === 'cervejas-300-caixa' && product.name.startsWith('Brahma —'))
const draft = { customer: { name: 'Cliente Teste', phone: '88999999999' }, fulfillment: 'pickup', address: { neighborhood: '', street: '', number: '', complement: '', reference: '' }, payment: 'pix', changeFor: null, items: [{ productId: item.id, qty: 1 }] }
const pending = uid => ({ ...draft, items: { [item.id]: 1 }, customerId: uid, code: 'KD-TESTE', fingerprint: 'a'.repeat(64), source: 'whatsapp', status: 'pending', createdAt: serverTimestamp(), completedAt: null, deletedAt: null, settlement: null })
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-karavela', firestore: { rules: await readFile('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'access', 'owner'), { email: ownerEmail })
    await setDoc(doc(db, 'access', 'catalog'), { productIds: products.map(p => p.id), quantities: Array.from({ length: 999 }, (_, i) => i + 1) })
    await setDoc(doc(db, 'settings', 'catalog'), { categories: [] })
    await setDoc(doc(db, 'customers', 'bob'), { name: 'Outro Cliente' })
  })
})
after(async () => { await env?.cleanup() })
test('cadastro e login por email ou telefone usam senha e identidade normalizada', async () => {
  for (const identity of [accountIdentity('cliente@example.com'), accountIdentity('(88) 99999-4444')]) {
    const app = initializeApp({ projectId: 'demo-karavela', apiKey: 'demo-key' }, 'auth-' + identity.kind)
    const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    const created = await createUserWithEmailAndPassword(auth, identity.email, 'SenhaTeste123!')
    const uid = created.user.uid
    await signOut(auth)
    assert.equal((await signInWithEmailAndPassword(auth, identity.email, 'SenhaTeste123!')).user.uid, uid)
    await assert.rejects(() => signInWithEmailAndPassword(auth, identity.email, 'SenhaErrada'))
    await deleteApp(app)
  }
})
test('visitante vê catálogo e não lê pedidos nem altera administração', async () => {
  const db = env.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(db, 'settings', 'catalog')))
  await assertFails(getDocs(collection(db, 'orders')))
  await assertFails(setDoc(doc(db, 'settings', 'catalog'), { categories: [] }))
})
test('cliente só lê seus pedidos e não pode promover a própria conta', async () => {
  const db = env.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true }).firestore()
  await assertSucceeds(setDoc(doc(db, 'orders', 'alice-order'), pending('alice')))
  await assertSucceeds(getDocs(query(collection(db, 'orders'), where('customerId', '==', 'alice'))))
  await assertFails(getDocs(collection(db, 'orders')))
  await assertFails(getDoc(doc(db, 'customers', 'bob')))
  await assertFails(setDoc(doc(db, 'access', 'owner'), { email: 'alice@example.com' }))
  await assertFails(setDoc(doc(db, 'customers', 'alice'), { name: 'Cliente Alice', phone: '', identifier: 'alice@example.com', kind: 'email', createdAt: serverTimestamp(), role: 'owner' }))
})
test('pedido só nasce pendente, com itens válidos e sem valores confirmados pelo cliente', async () => {
  const db = env.authenticatedContext('charlie', { email: 'charlie@example.com', email_verified: false }).firestore()
  await assertFails(setDoc(doc(db, 'orders', 'forge-owner'), { ...pending('charlie'), customerId: 'bob' }))
  await assertFails(setDoc(doc(db, 'orders', 'forge-status'), { ...pending('charlie'), status: 'completed' }))
  await assertFails(setDoc(doc(db, 'orders', 'forge-price'), { ...pending('charlie'), total: 0.01 }))
  await assertFails(setDoc(doc(db, 'orders', 'forge-settlement'), { ...pending('charlie'), settlement: { subtotal: 1, deliveryFee: 0, total: 1 } }))
  await assertFails(setDoc(doc(db, 'orders', 'forge-product'), { ...pending('charlie'), items: { desconhecido: 1 } }))
  await assertFails(setDoc(doc(db, 'orders', 'forge-quantity'), { ...pending('charlie'), items: { [item.id]: -1 } }))
  await assertSucceeds(setDoc(doc(db, 'orders', 'valid-quantity'), { ...pending('charlie'), items: { [item.id]: 999 } }))
})
test('envio repetido tem um único registro e preserva o pedido após falha ou nova tentativa', async () => {
  const db = env.authenticatedContext('retry', { email: 'retry@example.com', email_verified: false }).firestore()
  const [first, second] = await Promise.all([persistWhatsAppOrder(db, 'retry', 'retry-same-id', draft), persistWhatsAppOrder(db, 'retry', 'retry-same-id', draft)])
  assert.equal(first.code, second.code)
  assert.equal((await getDocs(query(collection(db, 'orders'), where('customerId', '==', 'retry')))).size, 1)
  await assert.rejects(() => persistWhatsAppOrder(db, 'retry', 'retry-same-id', { ...draft, payment: 'cash' }))
})
test('somente dono com email confirmado finaliza, exclui/restaura e edita fotos', async () => {
  const client = env.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true }).firestore()
  const unverified = env.authenticatedContext('owner-unverified', { email: ownerEmail, email_verified: false }).firestore()
  const owner = env.authenticatedContext('owner', { email: ownerEmail, email_verified: true }).firestore()
  const ref = db => doc(db, 'orders', 'alice-order')
  const completion = { status: 'completed', completedAt: serverTimestamp(), settlement: { subtotal: 63.8, deliveryFee: 0, total: 63.8 } }
  await assertFails(updateDoc(ref(client), completion))
  await assertFails(updateDoc(ref(unverified), completion))
  await assertSucceeds(getDocs(collection(owner, 'orders')))
  await assertSucceeds(updateDoc(ref(owner), completion))
  await assertFails(updateDoc(ref(client), { deletedAt: serverTimestamp() }))
  await assertSucceeds(updateDoc(ref(owner), { deletedAt: serverTimestamp() }))
  await assertSucceeds(updateDoc(ref(owner), { deletedAt: null }))
  await assertFails(setDoc(doc(client, 'photos', 'fake-photo'), { dataUrl: 'data:image/webp;base64,AAAA', createdAt: serverTimestamp() }))
  await assertSucceeds(setDoc(doc(owner, 'photos', 'owner-photo'), { dataUrl: 'data:image/webp;base64,AAAA', createdAt: serverTimestamp() }))
  await assertFails(setDoc(doc(client, 'settings', 'media'), {}))
  await assertSucceeds(setDoc(doc(owner, 'settings', 'media'), {}))
})
