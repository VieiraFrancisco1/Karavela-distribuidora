export async function POST(request: Request) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return Response.json({ message: 'A senha administrativa ainda não foi configurada no Vercel.' }, { status: 503 })
  let body: { password?: string } = {}
  try { body = await request.json() } catch { /* vazio */ }
  if (!body.password || body.password !== expected) return Response.json({ message: 'Senha administrativa incorreta.' }, { status: 401 })
  return Response.json({ ok: true })
}
