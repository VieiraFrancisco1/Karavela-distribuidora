export function isAdmin(request: Request) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return { ok: false, status: 503, message: 'A senha administrativa ainda não foi configurada no Vercel.' }
  const received = request.headers.get('x-admin-password') || ''
  if (received !== expected) return { ok: false, status: 401, message: 'Senha administrativa incorreta.' }
  return { ok: true, status: 200, message: '' }
}

export function safeProductId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
}
