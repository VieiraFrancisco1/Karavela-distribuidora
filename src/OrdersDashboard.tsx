import { useMemo, useState } from 'react'
import { useSession } from './AuthProvider'
import { accountError } from './AccountScreen'
import { useOrders } from './useOrders'
import { finishOrder, hideOrder, restoreOrder } from './firebaseStore'
import { orderPricing, orderProduct, orderTotal, periodBounds, storeDay, summarizeOrders } from './ordersModel'
import type { StoreOrder } from './ordersModel'
import { money } from './pricing'
const payments: Record<string, string> = { pix: 'Pix', credit: 'Crédito', debit: 'Débito', cash: 'Dinheiro' }
const dateTime = (value: number) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' })
function OrderCard({ order, admin = false, onAction }: { order: StoreOrder; admin?: boolean; onAction?: (action: 'finish' | 'delete' | 'restore', order: StoreOrder) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  async function act(action: 'finish' | 'delete' | 'restore') {
    setBusy(true)
    try { await onAction?.(action, order); setConfirm(false) } finally { setBusy(false) }
  }
  return <article className="order-card"><div className="order-card-head"><div><b>{order.code}</b><small>{dateTime(order.createdAt)}</small></div><span className={'order-status ' + (order.deletedAt ? 'deleted' : order.status)}>{order.deletedAt ? 'Excluído' : order.status === 'completed' ? 'Finalizado' : 'Pendente'}</span></div>
    <div className="order-card-summary"><div><strong>{order.customer.name}</strong><span>{order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'} · {payments[order.payment]}</span></div><b>{money(orderTotal(order))}</b></div>
    <button className="order-details-toggle" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Recolher detalhes' : 'Ver detalhes'} <span>{expanded ? '−' : '+'}</span></button>
    {expanded && <div className="order-details"><p><b>WhatsApp:</b> {order.customer.phone}</p>{order.fulfillment === 'delivery' && <><p>{order.address.street}, {order.address.number} · {order.address.neighborhood}</p>{order.address.complement && <p>{order.address.complement}</p>}{order.address.reference && <p><b>Referência:</b> {order.address.reference}</p>}</>}
      <ul>{order.items.map(item => <li key={item.productId}>{item.qty}× {orderProduct(item.productId)?.name || 'Item não disponível'} {orderProduct(item.productId)?.size}</li>)}</ul>
      <p>Entrega: {money(order.settlement?.deliveryFee ?? orderPricing(order)?.deliveryFee ?? 0)}</p>{order.changeFor && <p>Troco para {money(order.changeFor)}</p>}
      {!admin && <p className="order-footnote">O pedido foi registrado ao abrir o WhatsApp. A confirmação da loja acontece na conversa.</p>}
    </div>}
    {admin && <div className="order-actions">{order.deletedAt ? <button disabled={busy} onClick={() => void act('restore')}>Restaurar pedido</button> : <>{order.status === 'pending' && <button className="finish-order" disabled={busy} onClick={() => void act('finish')}>{busy ? 'Aguarde…' : 'Finalizar'}</button>}<button className="delete-order" disabled={busy} onClick={() => setConfirm(v => !v)}>Excluir</button></>}</div>}
    {confirm && <div className="order-delete-confirm"><span>Retirar este pedido do controle?</span><button disabled={busy} onClick={() => void act('delete')}>Sim, excluir</button><button onClick={() => setConfirm(false)}>Cancelar</button></div>}
  </article>
}
export function CustomerOrders({ onBack }: { onBack: () => void }) {
  const { user } = useSession()
  const { orders, loading, error } = useOrders({ customerId: user!.uid })
  const visible = orders.filter(order => !order.deletedAt)
  return <section className="orders-page"><button className="account-back" onClick={onBack}>‹ Voltar ao catálogo</button><h1>Meus pedidos</h1><p className="orders-intro">Pedidos enviados pelo botão do WhatsApp.</p>{error && <p className="account-error" role="alert">{error}</p>}{loading ? <p role="status">Carregando pedidos…</p> : visible.length ? visible.map(order => <OrderCard key={order.id} order={order}/>) : <div className="orders-empty">Você ainda não enviou nenhum pedido.</div>}</section>
}
export function OwnerDashboard({ onBack, onPhotos }: { onBack: () => void; onPhotos: () => void }) {
  const [tab, setTab] = useState<'pending' | 'completed' | 'reports' | 'deleted'>('pending')
  const [monthly, setMonthly] = useState(false)
  const [day, setDay] = useState(storeDay())
  const [month, setMonth] = useState(storeDay().slice(0, 7))
  const [notice, setNotice] = useState('')
  const bounds = useMemo(() => periodBounds(monthly ? month : day, monthly), [day, month, monthly])
  const pending = useOrders({ pending: true })
  const period = useOrders({ start: bounds.start, end: bounds.end })
  const stats = useMemo(() => summarizeOrders(period.orders), [period.orders])
  const source = tab === 'pending' ? pending : period
  const visible = source.orders.filter(order => tab === 'deleted' ? !!order.deletedAt : !order.deletedAt && (tab !== 'completed' || order.status === 'completed'))
  async function act(action: 'finish' | 'delete' | 'restore', order: StoreOrder) {
    setNotice('')
    try {
      if (action === 'finish') await finishOrder(order)
      else if (action === 'delete') await hideOrder(order.id)
      else await restoreOrder(order.id)
      setNotice(action === 'finish' ? 'Pedido finalizado.' : action === 'delete' ? 'Pedido excluído. Você pode recuperá-lo em Excluídos.' : 'Pedido restaurado.')
    } catch (error) { setNotice(accountError(error)) }
  }
  function exportReport() {
    const rows = [['Pedido', 'Data', 'Cliente', 'Situação', 'Pagamento', 'Total'], ...period.orders.filter(order => !order.deletedAt).map(order => [order.code, dateTime(order.createdAt), order.customer.name, order.status === 'completed' ? 'Finalizado' : 'Pendente', payments[order.payment], orderTotal(order).toFixed(2).replace('.', ',')])]
    const escape = (value: string) => {
      const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value
      return '"' + safe.replace(/"/g, '""') + '"'
    }
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'relatorio-karavela-' + (monthly ? month : day) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="orders-page owner-dashboard"><div className="owner-heading"><div><button className="account-back" onClick={onBack}>‹ Voltar ao catálogo</button><h1>Controle da loja</h1></div><button className="owner-catalog" onClick={onPhotos}>Fotos e catálogo</button></div>
    <div className="owner-tabs">{([['pending', 'Pendentes'], ['completed', 'Finalizados'], ['reports', 'Relatórios'], ['deleted', 'Excluídos']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}{id === 'pending' && <b>{pending.orders.filter(order => !order.deletedAt).length}</b>}</button>)}</div>
    {tab !== 'pending' && <div className="report-controls"><div className="report-period"><button className={!monthly ? 'active' : ''} onClick={() => setMonthly(false)}>Diário</button><button className={monthly ? 'active' : ''} onClick={() => setMonthly(true)}>Mensal</button></div><label>{monthly ? 'Mês' : 'Dia'}<input aria-label={monthly ? 'Mês do relatório' : 'Dia do relatório'} type={monthly ? 'month' : 'date'} value={monthly ? month : day} onChange={e => { if (e.target.value) monthly ? setMonth(e.target.value) : setDay(e.target.value) }}/></label></div>}
    {notice && <p className="account-notice" role="status">{notice}</p>}{source.error && <p className="account-error" role="alert">{source.error}</p>}
    {tab === 'reports' ? <><div className="report-cards"><div><span>Recebidos</span><b>{stats.received}</b></div><div><span>Finalizados</span><b>{stats.completed}</b></div><div><span>Pendentes</span><b>{stats.pending}</b></div><div className="report-revenue"><span>Total finalizado</span><b>{money(stats.revenue)}</b></div></div><p className="order-footnote">O total considera os pedidos finalizados, pela data em que foram enviados. Pedidos excluídos não entram no relatório.</p><div className="report-payment-list">{Object.entries(payments).map(([id, label]) => <div key={id}><span>{label}</span><b>{money(stats.payments[id])}</b></div>)}<div><span>Taxas de entrega incluídas</span><b>{money(stats.delivery)}</b></div></div><button className="account-primary" onClick={exportReport} disabled={period.loading || !!period.error}>Baixar relatório</button></> : source.loading ? <p role="status">Carregando pedidos…</p> : visible.length ? visible.map(order => <OrderCard key={order.id} order={order} admin onAction={act}/>) : <div className="orders-empty">{tab === 'pending' ? 'Nenhum pedido pendente.' : 'Nenhum pedido neste período.'}</div>}
  </section>
}
