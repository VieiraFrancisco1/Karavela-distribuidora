import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import publicConfig from './firebase.public.json'

const emulators = import.meta.env.VITE_FIREBASE_EMULATORS === 'true'
const config = emulators ? { apiKey: 'demo-key', projectId: 'demo-karavela', authDomain: 'demo-karavela.firebaseapp.com', appId: 'demo-app' } : publicConfig
export const firebaseReady = Boolean(config.apiKey && config.projectId)
const app = firebaseReady ? initializeApp(config) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
if (auth) auth.languageCode = 'pt-BR'
if (emulators && auth && db) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
export function requireDb() {
  if (!db) throw new Error('O Firebase ainda não foi conectado. A publicação precisa ser concluída.')
  return db
}
export function requireAuth() {
  if (!auth) throw new Error('O login ficará disponível quando a publicação no Firebase for concluída.')
  return auth
}
