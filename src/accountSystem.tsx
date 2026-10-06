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
  onSuccess,
  onCancel,
}: {
  onClose: () => void
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      if (tab === 'login') {
        await loginWithIdentifier(identifier, password)
      } else {
        await registerWithIdentifier({ name, identifier, password })
      }
      onSuccess?.()
      onClose()
    } catch (cause) {
      setError(authErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const cancel = onCancel ?? onClose

  return <div className="account-overlay" onMouseDown={cancel}>
    <section className="account-modal" onMouseDown={event => event.stopPropagation()}>
      <button className="account-close" onClick={cancel} aria-label="Fechar">×</button>

      <div className="account-brand">
        <img src="/assets/logo-karavela.png" alt="Karavela Distribuidora" />
      </div>

      <div className="account-heading">
        <h2>{tab === 'login' ? 'Entrar na sua conta' : 'Criar sua conta'}</h2>
        <p>{tab === 'login' ? 'Acesse com e-mail ou telefone e senha.' : 'Cadastro rápido para facilitar seus próximos pedidos.'}</p>
      </div>

      <div className="account-tabs">
        <button className={tab === 'login' ? 'active' : ''} type="button" onClick={() => { setTab('login'); setError('') }}>Entrar</button>
        <button className={tab === 'register' ? 'active' : ''} type="button" onClick={() => { setTab('register'); setError('') }}>Criar conta</button>
      </div>

      <form onSubmit={submit}>
        {tab === 'register' && <label>
          <span>Nome e sobrenome</span>
          <input value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome e sobrenome" autoComplete="name" required />
        </label>}

        <label>
          <span>E-mail ou telefone</span>
          <input
            value={identifier}
            onChange={event => setIdentifier(event.target.value)}
            placeholder="exemplo@email.com ou (88) 99999-9999"
            autoComplete="username"
            required
          />
        </label>

        <label>
          <span>Senha</span>
          <input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="Mínimo de 6 caracteres" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
        </label>

        {error && <div className="account-error">{error}</div>}

        <button className="account-primary" disabled={busy} type="submit">
          {busy ? 'Aguarde...' : tab === 'login' ? 'Entrar' : 'Criar conta'}
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

function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function escapePrint(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}


function printOrder(order: StoredOrder) {
  const popup = window.open('', '_blank', 'width=430,height=720')
  if (!popup) return

  const items = order.items.map(item => `
    <div class="row"><span>${item.qty}x ${escapePrint(item.name)}${item.size ? ` ${escapePrint(item.size)}` : ''}</span><b>${money(item.total)}</b></div>
  `).join('')

  popup.document.write(`<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Pedido ${order.id.slice(0, 6).toUpperCase()}</title>
      <style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#111}
        h1{font-size:20px;margin:0 0 4px}.muted{color:#555;font-size:12px}
        .line{border-top:1px dashed #999;margin:14px 0}.row{display:flex;justify-content:space-between;gap:12px;margin:7px 0;font-size:13px}
        .total{font-size:18px;margin-top:12px}.info{font-size:13px;line-height:1.55;margin-top:12px}
        @media print{body{padding:0}}
      </style>
    </head>
    <body>
      <h1>Karavela Distribuidora</h1>
      <div class="muted">Pedido #${order.id.slice(0, 6).toUpperCase()} · ${dateLabel(order)}</div>
      <div class="line"></div>
      <div class="info">
        <b>${escapePrint(order.customerName)}</b><br>
        ${escapePrint(order.customerPhone)}<br>
        ${order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'} · ${paymentLabel(order.payment)}
        ${order.address ? `<br>${escapePrint(order.address)}` : ''}
        ${order.neighborhood ? ` · ${escapePrint(order.neighborhood)}` : ''}
      </div>
      <div class="line"></div>
      ${items}
      <div class="line"></div>
      <div class="row total"><span>Total</span><b>${money(order.total)}</b></div>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script>
    </body>
  </html>`)
  popup.document.close()
}

function callCustomer(order: StoredOrder) {
  const phone = whatsappNumber(order.customerPhone)
  if (!phone) return
  const message = [
    `Olá, ${order.customerName}! Aqui é da Karavela Distribuidora.`,
    `Estamos falando sobre o pedido #${order.id.slice(0, 6).toUpperCase()}.`,
  ].join('\n')
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
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
  return <article className={`order-card${admin ? ' order-card-admin' : ''}`}>
    <div className="order-card-top">
      <div className="order-main-title">
        <strong>{admin ? order.customerName : `Pedido #${order.id.slice(0, 6).toUpperCase()}`}</strong>
        <span>{dateLabel(order)}</span>
      </div>
      <span className={order.status === 'finalized' ? 'order-status finalized' : 'order-status pending'}>
        {order.status === 'finalized' ? 'Finalizado' : 'Pendente'}
      </span>
    </div>

    {admin && <div className="order-admin-summary">
      <div><small>PEDIDO</small><b>#{order.id.slice(0, 6).toUpperCase()}</b></div>
      <div><small>RECEBIMENTO</small><b>{order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</b></div>
      <div><small>PAGAMENTO</small><b>{paymentLabel(order.payment)}</b></div>
    </div>}

    {admin && <div className="order-customer-box">
      <div>
        <small>Cliente</small>
        <strong>{order.customerPhone}</strong>
        {order.fulfillment === 'delivery' && order.address && <span>{order.address}{order.neighborhood ? ` · ${order.neighborhood}` : ''}</span>}
      </div>
      <button className="whatsapp" onClick={() => callCustomer(order)}>Chamar no WhatsApp</button>
    </div>}

    <div className="order-items">
      {order.items.map((item, index) => <div key={`${item.productId}-${index}`}>
        <span>{item.qty}x {item.name}{item.size ? ` ${item.size}` : ''}</span>
        <b>{money(item.total)}</b>
      </div>)}
    </div>

    <div className="order-card-bottom">
      <div><small>Total</small><strong>{money(order.total)}</strong></div>
      {admin && <div className="order-admin-actions">
        <button className="print" onClick={() => printOrder(order)}>Imprimir</button>
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
      <header className="orders-panel-header">
        <button className="orders-back-button" onClick={onClose} aria-label="Voltar">‹ <span>Voltar</span></button>
        <div className="orders-panel-title"><h2>Meus pedidos</h2><p>Acompanhe os pedidos enviados para a Karavela.</p></div>
        <button className="orders-close-button" onClick={onClose} aria-label="Fechar">×</button>
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

function dateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, Math.max(0, month - 1), day || 1)
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
  const [view, setView] = useState<'pending' | 'finalized'>('pending')
  const [showReports, setShowReports] = useState(false)
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [finalizedDate, setFinalizedDate] = useState(() => dateInputValue(new Date()))

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
  const selectedFinalizedDate = dateFromInput(finalizedDate)
  const todayOrders = orders.filter(order => sameDay(orderDate(order), now))
  const monthOrders = orders.filter(order => sameMonth(orderDate(order), now))
  const pendingToday = todayOrders.filter(order => order.status === 'pending')
  const finalizedForDate = orders.filter(order =>
    order.status === 'finalized' && sameDay(orderDate(order), selectedFinalizedDate)
  )
  const visibleOrders = view === 'pending' ? pendingToday : finalizedForDate

  return <div className="admin-dashboard-shell">
    <header className="admin-dashboard-top">
      <button className="admin-back-button" onClick={onClose} aria-label="Voltar">‹ <span>Voltar</span></button>
      <div className="admin-dashboard-title">
        <small>KARAVELA DISTRIBUIDORA</small>
        <h1>Pedidos</h1>
        <span>{profile?.name || 'Loja'} · {now.toLocaleDateString('pt-BR')}</span>
      </div>
      <button className="admin-close-button" onClick={onClose} aria-label="Fechar">×</button>
    </header>

    <main className="admin-dashboard-main">
      <div className="admin-quick-links">
        <button className={showReports ? 'active' : ''} onClick={() => setShowReports(value => !value)}>
          {showReports ? 'Voltar aos pedidos' : 'Relatórios'}
        </button>
        <button onClick={onOpenCatalog}>Editar catálogo</button>
      </div>

      {showReports ? <>
        <div className="admin-section-heading">
          <div><h2>Relatórios</h2><p>O faturamento considera apenas pedidos finalizados.</p></div>
        </div>
        <div className="report-grid">
          <ReportSummary title="Hoje" orders={todayOrders} />
          <ReportSummary title={now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} orders={monthOrders} />
        </div>
        <section className="report-detail">
          <h3>Pedidos de hoje</h3>
          {todayOrders.length ? todayOrders.map(order => <div key={order.id}><span>{order.customerName}</span><span>{order.status === 'finalized' ? 'Finalizado' : 'Pendente'}</span><b>{money(order.total)}</b></div>) : <p>Nenhum pedido hoje.</p>}
        </section>
      </> : <>
        <section className="order-status-selector" aria-label="Filtrar pedidos">
          <button className={view === 'pending' ? 'active pending-card' : 'pending-card'} onClick={() => setView('pending')}>
            <span>Pendentes</span>
            <strong>{pendingToday.length}</strong>
            <small>Pedidos de hoje</small>
          </button>
          <button className={view === 'finalized' ? 'active finalized-card' : 'finalized-card'} onClick={() => setView('finalized')}>
            <span>Finalizados</span>
            <strong>{finalizedForDate.length}</strong>
            <small>{sameDay(selectedFinalizedDate, now) ? 'Hoje' : selectedFinalizedDate.toLocaleDateString('pt-BR')}</small>
          </button>
        </section>

        {view === 'finalized' && <section className="finalized-date-filter">
          <div>
            <strong>Data dos pedidos finalizados</strong>
            <small>Escolha um dia para consultar.</small>
          </div>
          <input
            type="date"
            value={finalizedDate}
            max={dateInputValue(now)}
            onChange={event => setFinalizedDate(event.target.value || dateInputValue(now))}
          />
        </section>}

        <div className="admin-section-heading order-list-heading">
          <div>
            <h2>{view === 'pending' ? 'Pendentes de hoje' : 'Pedidos finalizados'}</h2>
            <p>{view === 'pending'
              ? 'Pedidos recebidos hoje que ainda precisam ser finalizados.'
              : `Mostrando pedidos de ${selectedFinalizedDate.toLocaleDateString('pt-BR')}.`}
            </p>
          </div>
          <span>{visibleOrders.length} pedido{visibleOrders.length === 1 ? '' : 's'}</span>
        </div>

        <div className="admin-order-list">
          {loading
            ? <div className="orders-empty">Carregando pedidos...</div>
            : visibleOrders.length
              ? visibleOrders.map(order => <OrderCard key={order.id} order={order} admin onFinalize={finalize} onDelete={remove} />)
              : <div className="orders-empty">{view === 'pending' ? 'Nenhum pedido pendente hoje.' : 'Nenhum pedido finalizado nesta data.'}</div>}
        </div>
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
      <h2>{profile?.name || 'Meu perfil'}</h2>
      <p>{profile?.email || profile?.phone || ''}</p>
      <button className="profile-action" onClick={onOrders}>{isAdmin ? 'Pedidos da loja' : 'Meus pedidos'}</button>
      <button className="profile-action secondary" onClick={() => void logoutAccount()}>Sair da conta</button>
    </section>
  </div>
}
