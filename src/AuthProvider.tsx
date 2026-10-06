import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getIdTokenResult, onIdTokenChanged, reload, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore'
import { auth, db, requireAuth } from './firebaseClient'

export type CustomerProfile = { name: string; phone: string; identifier: string; kind: 'email' | 'phone' }
type Session = { user: User | null; profile: CustomerProfile | null; isOwner: boolean; loading: boolean; logout: () => Promise<void>; refresh: () => Promise<void> }
const SessionContext = createContext<Session | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [isOwner, setOwner] = useState(false)
  const [loading, setLoading] = useState(Boolean(auth))
  useEffect(() => {
    if (!auth || !db) return
    let generation = 0
    let offProfile: (() => void) | undefined
    const off = onIdTokenChanged(auth, next => {
      const version = ++generation
      offProfile?.(); setUser(next); setProfile(null); setOwner(false)
      if (!next) { setLoading(false); return }
      setLoading(true)
      offProfile = onSnapshot(doc(db!, 'customers', next.uid), snapshot => { if (version === generation) setProfile(snapshot.exists() ? snapshot.data() as CustomerProfile : null) })
      void (async () => {
        try {
          const token = await getIdTokenResult(next)
          if (token.claims.email_verified !== true) return
          const access = await getDocFromServer(doc(db!, 'access', 'owner'))
          if (version === generation) setOwner(access.exists() && access.data().email === token.claims.email)
        } catch { if (version === generation) setOwner(false) }
        finally { if (version === generation) setLoading(false) }
      })()
    })
    return () => { generation++; offProfile?.(); off() }
  }, [])
  async function refresh() {
    const current = requireAuth().currentUser
    if (!current) return
    await reload(current)
    await current.getIdToken(true)
  }
  return <SessionContext.Provider value={{ user, profile, isOwner, loading, logout: () => signOut(requireAuth()), refresh }}>{children}</SessionContext.Provider>
}
export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('Session provider missing')
  return context
}
