import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import {
  getFirebaseServices,
  isOwner,
  loadCustomerProfile,
  loginWithIdentifier,
  logoutAccount,
  registerWithIdentifier,
  type CustomerProfile,
} from './firebaseClient'

type AccountContextValue = {
  user: User | null
  profile: CustomerProfile | null
  loading: boolean
  isAdmin: boolean
}

const AccountContext = createContext<AccountContextValue>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
})

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => undefined

    void getFirebaseServices()
      .then(({ auth }) => {
        if (cancelled) return
        unsubscribe = onAuthStateChanged(auth, async currentUser => {
          if (cancelled) return
          setUser(currentUser)
          if (!currentUser) {
            setProfile(null)
            setLoading(false)
            return
          }

          try {
            setProfile(await loadCustomerProfile(currentUser))
          } catch {
            setProfile({
              uid: currentUser.uid,
              name: currentUser.displayName || (isOwner(currentUser) ? 'Administrador' : 'Cliente'),
              email: currentUser.email,
              phone: '',
              loginType: 'email',
            })
          } finally {
            if (!cancelled) setLoading(false)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    isAdmin: isOwner(user),
  }), [user, profile, loading])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  return useContext(AccountContext)
}

function authErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail/telefone ou senha incorretos.'
  if (code.includes('email-already-in-use')) return 'Já existe uma conta com esse e-mail ou telefone.'
  if (code.includes('weak-password')) return 'Use uma senha com pelo menos 6 caracteres.'
  if (code.includes('invalid-email')) return 'Informe um e-mail ou telefone válido.'
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  return error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.'
}

export function AccountModal({
  onClose,
  adminOnly = false,
  onSuccess,
}: {
  onClose: () => void
  adminOnly?: boolean
  onSuccess?: () => void
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState(adminOnly ? '0vieira.francisco0@gmail.com' : '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      if (tab === 'login' || adminOnly) {
        const credential = await loginWithIdentifier(identifier, password)
        if (adminOnly && !isOwner(credential.user)) {
          await logoutAccount()
          throw new Error('Acesso permitido apenas ao proprietário da loja.')
        }
      } else {
        if (password !== confirmPassword) throw new Error('As senhas não são iguais.')
        await registerWithIdentifier({ name, identifier, phone, password })
      }
      onSuccess?.()
      onClose()
    } catch (cause) {
      setError(authErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <div className="account-overlay" onMouseDown={onClose}>
    <section className="account-modal" onMouseDown={event => event.stopPropagation()}>
      <button className="account-close" onClick={onClose} aria-label="Fechar">×</button>
      <img src="/assets/logo-karavela.png" alt="Karavela Distribuidora" />
      <div className="account-heading">
        <h2>{adminOnly ? 'Área administrativa' : tab === 'login' ? 'Entrar na sua conta' : 'Criar sua conta'}</h2>
        <p>{adminOnly ? 'Acesso exclusivo do proprietário da loja.' : 'Use e-mail ou telefone e sua senha.'}</p>
      </div>

      {!adminOnly && <div className="account-tabs">
        <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError('') }}>Entrar</button>
        <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError('') }}>Criar conta</button>
      </div>}

      <form onSubmit={submit}>
        {tab === 'register' && !adminOnly && <label>
          <span>Nome completo</span>
          <input value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome e sobrenome" autoComplete="name" required />
        </label>}

        <label>
          <span>{adminOnly ? 'E-mail do administrador' : 'E-mail ou telefone'}</span>
          <input
            value={identifier}
            onChange={event => setIdentifier(event.target.value)}
            placeholder={adminOnly ? 'E-mail' : 'exemplo@email.com ou (88) 99999-9999'}
            autoComplete="username"
            required
          />
        </label>

        {tab === 'register' && !adminOnly && <label>
          <span>Telefone / WhatsApp</span>
          <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="(88) 99999-9999" inputMode="tel" autoComplete="tel" required />
          <small>Se você usar o telefone para entrar, pode repetir o mesmo número aqui.</small>
        </label>}

        <label>
          <span>Senha</span>
          <input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="Mínimo de 6 caracteres" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
        </label>

        {tab === 'register' && !adminOnly && <label>
          <span>Confirmar senha</span>
          <input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" placeholder="Digite a senha novamente" autoComplete="new-password" required />
        </label>}

        {error && <div className="account-error">{error}</div>}

        <button className="account-primary" disabled={busy} type="submit">
          {busy ? 'Aguarde...' : adminOnly ? 'Entrar como administrador' : tab === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </section>
  </div>
}

type StoredOrder = {
  id: string
  userId: string
  customerName: string
  customerPhone: string
  fulfillment: 'delivery' | 'pickup'
  neighborhood?: string
  address?: string
  payment: 'pix' | 'credit' | 'debit' | 'cash'
  subtotal: number
  deliveryFee: number
  total: number
  status: 'pending' | 'finalized'
  createdAt?: Timestamp | null
  finalizedAt?: Timestamp | null
  items: Array<{
    productId: string
    name: string
    size?: string
    qty: number
    unitPrice: number
    total: number
  }>
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function orderDate(order: StoredOrder) {
  return order.createdAt?.toDate?.() ?? new Date(0)
}

function dateLabel(order: StoredOrder) {
  const date = orderDate(order)
  if (date.getTime() === 0) return 'Agora'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function paymentLabel(payment: StoredOrder['payment']) {
  return {
    pix: 'Pix',
    credit: 'Crédito',
    debit: 'Débito',
    cash: 'Dinheiro',
  }[payment]
}

function OrderCard({
  order,
  admin = false,
  onFinalize,
  onDelete,
}: {
  order: StoredOrder
  admin?: boolean
  onFinalize?: (order: StoredOrder) => void
  onDelete?: (order: StoredOrder) => void
}) {
  return <article className="order-card">
    <div className="order-card-top">
      <div>
        <strong>{admin ? order.customerName : `Pedido #${order.id.slice(0, 6).toUpperCase()}`}</strong>
        <span>{dateLabel(order)}</span>
      </div>
      <span className={order.status === 'finalized' ? 'order-status finalized' : 'order-status pending'}>
        {order.status === 'finalized' ? 'Finalizado' : 'Pendente'}
      </span>
    </div>

    {admin && <div className="order-customer-line">{order.customerPhone} · {order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'} · {paymentLabel(order.payment)}</div>}

    <div className="order-items">
      {order.items.map((item, index) => <div key={`${item.productId}-${index}`}>
        <span>{item.qty}x {item.name}{item.size ? ` ${item.size}` : ''}</span>
        <b>{money(item.total)}</b>
      </div>)}
    </div>

    <div className="order-card-bottom">
      <div><small>Total</small><strong>{money(order.total)}</strong></div>
      {admin && <div className="order-admin-actions">
        {order.status !== 'finalized' && <button className="finish" onClick={() => onFinalize?.(order)}>Finalizar</button>}
        <button className="delete" onClick={() => onDelete?.(order)}>Excluir</button>
      </div>}
    </div>
  </article>
}

export function CustomerOrdersPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAccount()
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    let unsubscribe = () => undefined
    void getFirebaseServices().then(({ db }) => {
      const ownOrders = query(collection(db, 'orders'), where('userId', '==', user.uid))
      unsubscribe = onSnapshot(ownOrders, snapshot => {
        const next = snapshot.docs
          .map(document => ({ id: document.id, ...document.data() } as StoredOrder))
          .sort((a, b) => orderDate(b).getTime() - orderDate(a).getTime())
        setOrders(next)
        setLoading(false)
      }, () => setLoading(false))
    })

    return () => unsubscribe()
  }, [user])

  return <div className="account-overlay" onMouseDown={onClose}>
    <section className="orders-panel" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div><h2>Meus pedidos</h2><p>Acompanhe os pedidos enviados para a Karavela.</p></div>
        <button onClick={onClose}>×</button>
      </header>
      <div className="orders-list">
        {loading ? <div className="orders-empty">Carregando...</div> : orders.length ? orders.map(order => <OrderCard key={order.id} order={order} />) : <div className="orders-empty">Você ainda não enviou nenhum pedido.</div>}
      </div>
    </section>
  </div>
}

function sameDay(date: Date, target: Date) {
  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate()
}

function sameMonth(date: Date, target: Date) {
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth()
}

function ReportSummary({ title, orders }: { title: string; orders: StoredOrder[] }) {
  const finalized = orders.filter(order => order.status === 'finalized')
  const pending = orders.filter(order => order.status === 'pending')
  const revenue = finalized.reduce((sum, order) => sum + Number(order.total || 0), 0)

  return <section className="report-card">
    <div className="report-card-title"><strong>{title}</strong><span>{orders.length} pedido{orders.length === 1 ? '' : 's'}</span></div>
    <div className="report-metrics">
      <div><span>Faturamento</span><b>{money(revenue)}</b></div>
      <div><span>Finalizados</span><b>{finalized.length}</b></div>
      <div><span>Pendentes</span><b>{pending.length}</b></div>
    </div>
  </section>
}

export function AdminDashboard({
  onClose,
  onOpenCatalog,
}: {
  onClose: () => void
  onOpenCatalog: () => void
}) {
  const { isAdmin, profile } = useAccount()
  const [tab, setTab] = useState<'orders' | 'reports'>('orders')
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    let unsubscribe = () => undefined

    void getFirebaseServices().then(({ db }) => {
      const allOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
      unsubscribe = onSnapshot(allOrders, snapshot => {
        setOrders(snapshot.docs.map(document => ({ id: document.id, ...document.data() } as StoredOrder)))
        setLoading(false)
      }, () => setLoading(false))
    })

    return () => unsubscribe()
  }, [isAdmin])

  if (!isAdmin) return null

  async function finalize(order: StoredOrder) {
    const { db } = await getFirebaseServices()
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'finalized',
      finalizedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function remove(order: StoredOrder) {
    if (!window.confirm(`Excluir o pedido de ${order.customerName}? Esta ação não pode ser desfeita.`)) return
    const { db } = await getFirebaseServices()
    await deleteDoc(doc(db, 'orders', order.id))
  }

  const now = new Date()
  const todayOrders = orders.filter(order => sameDay(orderDate(order), now))
  const monthOrders = orders.filter(order => sameMonth(orderDate(order), now))
  const pendingCount = orders.filter(order => order.status === 'pending').length

  return <div className="admin-dashboard-shell">
    <header className="admin-dashboard-top">
      <div>
        <small>KARAVELA DISTRIBUIDORA</small>
        <h1>Controle da loja</h1>
        <span>{profile?.name || 'Administrador'}</span>
      </div>
      <button onClick={onClose}>Sair do painel</button>
    </header>

    <nav className="admin-dashboard-nav">
      <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Pedidos {pendingCount > 0 && <b>{pendingCount}</b>}</button>
      <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Relatórios</button>
      <button onClick={onOpenCatalog}>Editar catálogo</button>
    </nav>

    <main className="admin-dashboard-main">
      {tab === 'orders' && <>
        <div className="admin-section-heading">
          <div><h2>Pedidos recebidos</h2><p>Entram aqui somente depois de o cliente tocar em “Enviar pedido para o WhatsApp”.</p></div>
          <span>{pendingCount} pendente{pendingCount === 1 ? '' : 's'}</span>
        </div>
        <div className="admin-order-list">
          {loading ? <div className="orders-empty">Carregando pedidos...</div> : orders.length ? orders.map(order => <OrderCard key={order.id} order={order} admin onFinalize={finalize} onDelete={remove} />) : <div className="orders-empty">Nenhum pedido recebido ainda.</div>}
        </div>
      </>}

      {tab === 'reports' && <>
        <div className="admin-section-heading"><div><h2>Relatórios</h2><p>O faturamento considera apenas pedidos finalizados.</p></div></div>
        <div className="report-grid">
          <ReportSummary title="Hoje" orders={todayOrders} />
          <ReportSummary title={now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} orders={monthOrders} />
        </div>

        <section className="report-detail">
          <h3>Pedidos de hoje</h3>
          {todayOrders.length ? todayOrders.map(order => <div key={order.id}><span>{order.customerName}</span><span>{order.status === 'finalized' ? 'Finalizado' : 'Pendente'}</span><b>{money(order.total)}</b></div>) : <p>Nenhum pedido hoje.</p>}
        </section>
      </>}
    </main>
  </div>
}

export function AccountMenuCard({
  onOrders,
  onClose,
}: {
  onOrders: () => void
  onClose: () => void
}) {
  const { profile, isAdmin } = useAccount()

  return <div className="account-overlay" onMouseDown={onClose}>
    <section className="profile-card" onMouseDown={event => event.stopPropagation()}>
      <button className="account-close" onClick={onClose}>×</button>
      <div className="profile-avatar">{(profile?.name || 'C').slice(0, 1).toUpperCase()}</div>
      <h2>{profile?.name || 'Minha conta'}</h2>
      <p>{profile?.email || profile?.phone || ''}</p>
      {!isAdmin && <button className="profile-action" onClick={onOrders}>Meus pedidos</button>}
      <button className="profile-action secondary" onClick={() => void logoutAccount()}>Sair da conta</button>
    </section>
  </div>
}
