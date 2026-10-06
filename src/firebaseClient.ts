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
export const OWNER_LEGACY_AUTH_EMAIL = '88969166158@telefone.karavela.app'

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
  const email = user?.email?.toLocaleLowerCase('pt-BR')
  return Boolean(email && (email === OWNER_AUTH_EMAIL || email === OWNER_LEGACY_AUTH_EMAIL))
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizePhone(value: string) {
  const digits = phoneDigits(value)
  if (digits.length === 10 || digits.length === 11) {
    return { canonical: `55${digits}`, local: digits }
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return { canonical: digits, local: digits.slice(2) }
  }
  throw new Error('Informe um e-mail ou telefone válido.')
}

function identifierToAuthEmail(identifier: string) {
  const value = identifier.trim().toLocaleLowerCase('pt-BR')
  if (value.includes('@')) return { authEmail: value, loginType: 'email' as const, phone: '' }

  const phone = normalizePhone(value)
  return {
    authEmail: `${phone.canonical}@telefone.karavela.app`,
    loginType: 'phone' as const,
    phone: phone.local,
  }
}

export async function loginWithIdentifier(identifier: string, password: string) {
  const { auth } = await getFirebaseServices()
  const normalized = identifierToAuthEmail(identifier)

  try {
    return await signInWithEmailAndPassword(auth, normalized.authEmail, password)
  } catch (error) {
    if (normalized.loginType === 'phone' && normalized.authEmail === OWNER_AUTH_EMAIL) {
      return await signInWithEmailAndPassword(auth, OWNER_LEGACY_AUTH_EMAIL, password)
    }
    throw error
  }
}

export async function registerWithIdentifier(input: {
  name: string
  identifier: string
  password: string
}) {
  const { auth, db } = await getFirebaseServices()
  const normalized = identifierToAuthEmail(input.identifier)
  const nameParts = input.name.trim().split(/\s+/).filter(Boolean)

  if (nameParts.length < 2 || nameParts.some(part => part.length < 2)) {
    throw new Error('Informe nome e sobrenome.')
  }
  if (input.password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')

  const credential = await createUserWithEmailAndPassword(auth, normalized.authEmail, input.password)
  await updateProfile(credential.user, { displayName: input.name.trim() })

  const profile: CustomerProfile = {
    uid: credential.user.uid,
    name: input.name.trim(),
    email: normalized.loginType === 'email' ? normalized.authEmail : null,
    phone: normalized.loginType === 'phone' ? normalized.phone : '',
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


export async function saveCheckoutProfile(user: User, name: string, phone: string) {
  const { db } = await getFirebaseServices()
  const normalizedPhone = phoneDigits(phone)
  const profile = await loadCustomerProfile(user)

  await setDoc(doc(db, 'users', user.uid), {
    ...profile,
    uid: user.uid,
    name: name.trim() || profile.name,
    phone: normalizedPhone || profile.phone,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  if (name.trim() && name.trim() !== user.displayName) {
    await updateProfile(user, { displayName: name.trim() })
  }
}
