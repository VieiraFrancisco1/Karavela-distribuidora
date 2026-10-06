import { useState } from 'react'
import type { FormEvent } from 'react'
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { accountIdentity, isPhoneAccount } from './accountIdentity'
import { requireAuth, requireDb } from './firebaseClient'
import { useSession } from './AuthProvider'

export function accountError(error: unknown) {
  const code = (error as { code?: string })?.code
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email ou telefone e senha não conferem.', 'auth/wrong-password': 'Email ou telefone e senha não conferem.',
    'auth/user-not-found': 'Email ou telefone e senha não conferem.', 'auth/email-already-in-use': 'Essa conta já existe. Toque em Entrar.',
    'auth/weak-password': 'Use uma senha com pelo menos 8 caracteres.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/network-request-failed': 'Confira sua conexão e tente novamente.', 'auth/operation-not-allowed': 'O login ainda não foi ativado no Firebase.',
    'permission-denied': 'Essa conta não tem permissão para essa ação.', 'unavailable': 'Não foi possível conectar. Confira sua internet e tente novamente.',
  }
  return (code && messages[code]) || (error instanceof Error && !code ? error.message : 'Não foi possível concluir. Tente novamente.')
}
export function AuthScreen({ onBack, onSuccess, title = 'Minha conta' }: { onBack: () => void; onSuccess: () => void; title?: string }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  function changeMode(next: typeof mode) { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirm('') }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setError(''); setNotice(''); setBusy(true)
    try {
      const identity = accountIdentity(identifier)
      if (mode === 'reset') {
        if (identity.kind === 'phone') throw new Error('A recuperação por email está disponível para contas cadastradas com email.')
        await sendPasswordResetEmail(requireAuth(), identity.email)
        setNotice('Se houver uma conta com esse email, você receberá o link para criar uma nova senha.')
      } else if (mode === 'register') {
        if (name.trim().length < 3) throw new Error('Informe seu nome.')
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.')
        if (password !== confirm) throw new Error('As senhas precisam ser iguais.')
        const { user } = await createUserWithEmailAndPassword(requireAuth(), identity.email, password)
        await updateProfile(user, { displayName: name.trim() })
        await setDoc(doc(requireDb(), 'customers', user.uid), { name: name.trim(), phone: identity.phone, identifier: identifier.trim(), kind: identity.kind, createdAt: serverTimestamp() })
        if (identity.kind === 'email') await sendEmailVerification(user).catch(() => undefined)
        onSuccess()
      } else {
        await signInWithEmailAndPassword(requireAuth(), identity.email, password)
        onSuccess()
      }
    } catch (failure) { setError(accountError(failure)) }
    finally { setBusy(false) }
  }
  return <section className="account-page"><button className="account-back" onClick={onBack}>‹ Voltar ao catálogo</button><div className="auth-card">
    <img className="account-logo" src="/assets/logo-karavela.png" alt="Karavela"/><h1>{title}</h1>
    <p>{mode === 'register' ? 'Crie sua conta para enviar e acompanhar pedidos.' : mode === 'reset' ? 'Recupere o acesso à sua conta.' : 'Entre para enviar e acompanhar seus pedidos.'}</p>
    {mode !== 'reset' && <div className="account-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Entrar</button><button className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Criar conta</button></div>}
    <form onSubmit={event => void submit(event)}>
      {mode === 'register' && <label>Seu nome<input autoComplete="name" value={name} maxLength={100} onChange={e => setName(e.target.value)} required/></label>}
      <label>{mode === 'reset' ? 'Email' : 'Email ou telefone'}<input name="username" autoComplete="username" value={identifier} maxLength={254} onChange={e => setIdentifier(e.target.value)} placeholder="Seu email ou telefone com DDD" required/></label>
      {mode !== 'reset' && <label>Senha<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1}/></label>}
      {mode === 'register' && <><label>Confirmar senha<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required/></label><small>Você entrará usando o email ou telefone escolhido neste cadastro.</small></>}
      {error && <p className="account-error" role="alert">{error}</p>}{notice && <p className="account-notice" role="status">{notice}</p>}
      <button className="account-primary" type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'register' ? 'Criar conta' : mode === 'reset' ? 'Enviar link de recuperação' : 'Entrar'}</button>
    </form>
    <button className="account-link" onClick={() => changeMode(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? 'Voltar para entrar' : 'Esqueci minha senha'}</button>
  </div></section>
}
export function AccountScreen({ onBack, onOrders, onAdmin }: { onBack: () => void; onOrders: () => void; onAdmin: () => void }) {
  const { user, profile, isOwner, logout, refresh } = useSession()
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  if (!user) return null
  async function verify() {
    setBusy(true)
    try { await sendEmailVerification(user!); setNotice('Enviamos o link de confirmação para seu email.') }
    catch (error) { setNotice(accountError(error)) } finally { setBusy(false) }
  }
  async function checkVerified() {
    setBusy(true)
    try { await refresh(); setNotice('Conta atualizada. Se o email estiver confirmado, o acesso será liberado.') }
    catch (error) { setNotice(accountError(error)) } finally { setBusy(false) }
  }
  return <section className="account-page"><button className="account-back" onClick={onBack}>‹ Voltar ao catálogo</button><div className="auth-card account-profile"><h1>Minha conta</h1><h2>{profile?.name || user.displayName || 'Cliente'}</h2><p>{profile?.identifier || (isPhoneAccount(user.email) ? 'Conta por telefone' : user.email)}</p>
    <button className="account-primary" onClick={onOrders}>Meus pedidos</button>
    {isOwner && <button className="account-primary account-admin-link" onClick={onAdmin}>Administrar loja</button>}
    {!isPhoneAccount(user.email) && !user.emailVerified && <div className="account-verification"><strong>Confirme seu email</strong><p>A conta administrativa precisa de um email confirmado.</p><button disabled={busy} onClick={() => void verify()}>Enviar confirmação</button><button disabled={busy} onClick={() => void checkVerified()}>Já confirmei meu email</button></div>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
    <button className="account-link" onClick={() => void logout().then(onBack)}>Sair da conta</button>
  </div></section>
}
