import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

export const OWNER_PHONE = '558896916158'
export const OWNER_AUTH_EMAIL = `${OWNER_PHONE}@telefone.karavela.app`

export type CustomerProfile = {
  uid: string
  name: string
  email: string | null
  phone: string
  loginType: 'email' | 'phone'
}

export type OrderItemInput = {
  productId: string
  name: string
  size: string
  qty: number
  unitPrice: number
  total: number
}

export type CreateOrderInput = {
  customerName: string
  customerPhone: string
  fulfillment: 'delivery' | 'pickup'
  neighborhood: string
  address: string
  complement: string
  reference: string
  payment: 'pix' | 'credit' | 'debit' | 'cash'
  changeFor: number | null
  subtotal: number
  deliveryFee: number
  total: number
  items: OrderItemInput[]
}

let servicesPromise: Promise<ReturnType<typeof buildServices>> | null = null

function buildServices(app: ReturnType<typeof initializeApp>) {
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  }
}

async function loadFirebaseConfig() {
  const response = await fetch('/__/firebase/init.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Não foi possível carregar a configuração do Firebase.')
  return await response.json()
}

export function getFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const app = getApps().length ? getApp() : initializeApp(await loadFirebaseConfig())
      const services = buildServices(app)
      await setPersistence(services.auth, browserLocalPersistence)
      return services
    })()
  }
  return servicesPromise
}

export function isOwner(user: User | null) {
  return Boolean(user?.email && user.email.toLocaleLowerCase('pt-BR') === OWNER_AUTH_EMAIL)
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

function identifierToAuthEmail(identifier: string) {
  const value = identifier.trim().toLocaleLowerCase('pt-BR')
  if (value.includes('@')) return { authEmail: value, loginType: 'email' as const, phone: '' }

  const digits = phoneDigits(value)
  if (digits.length < 10 || digits.length > 13) {
    throw new Error('Informe um e-mail ou telefone válido.')
  }
  return {
    authEmail: `${digits}@telefone.karavela.app`,
    loginType: 'phone' as const,
    phone: digits,
  }
}

export async function loginWithIdentifier(identifier: string, password: string) {
  const { auth } = await getFirebaseServices()
  const normalized = identifierToAuthEmail(identifier)
  return await signInWithEmailAndPassword(auth, normalized.authEmail, password)
}

export async function registerWithIdentifier(input: {
  name: string
  identifier: string
  phone: string
  password: string
}) {
  const { auth, db } = await getFirebaseServices()
  const normalized = identifierToAuthEmail(input.identifier)
  const contactPhone = phoneDigits(normalized.loginType === 'phone' ? normalized.phone : input.phone)

  if (input.name.trim().length < 3) throw new Error('Informe seu nome completo.')
  if (contactPhone.length < 10) throw new Error('Informe um telefone/WhatsApp válido.')
  if (input.password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')

  const credential = await createUserWithEmailAndPassword(auth, normalized.authEmail, input.password)
  await updateProfile(credential.user, { displayName: input.name.trim() })

  const profile: CustomerProfile = {
    uid: credential.user.uid,
    name: input.name.trim(),
    email: normalized.loginType === 'email' ? normalized.authEmail : null,
    phone: contactPhone,
    loginType: normalized.loginType,
  }

  await setDoc(doc(db, 'users', credential.user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return credential
}

export async function loadCustomerProfile(user: User): Promise<CustomerProfile> {
  const { db } = await getFirebaseServices()
  const snapshot = await getDoc(doc(db, 'users', user.uid))

  if (snapshot.exists()) {
    const data = snapshot.data() as Partial<CustomerProfile>
    return {
      uid: user.uid,
      name: data.name || user.displayName || 'Cliente',
      email: data.email ?? (user.email && !user.email.endsWith('@telefone.karavela.app') ? user.email : null),
      phone: data.phone || '',
      loginType: data.loginType === 'phone' ? 'phone' : 'email',
    }
  }

  return {
    uid: user.uid,
    name: user.displayName || (isOwner(user) ? 'Administrador' : 'Cliente'),
    email: user.email && !user.email.endsWith('@telefone.karavela.app') ? user.email : null,
    phone: '',
    loginType: 'email',
  }
}

export async function logoutAccount() {
  const { auth } = await getFirebaseServices()
  await signOut(auth)
}

export async function createCustomerOrder(user: User, input: CreateOrderInput) {
  const { db } = await getFirebaseServices()
  const orderRef = doc(db, 'orders', crypto.randomUUID())

  await setDoc(orderRef, {
    ...input,
    userId: user.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return orderRef.id
}
