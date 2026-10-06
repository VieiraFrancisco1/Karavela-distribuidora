import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { products } from '../src/data.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const require = createRequire(import.meta.url)
const firebaseAuth = require('firebase-tools/lib/auth.js')
const cli = require.resolve('firebase-tools/lib/bin/firebase.js')
const args = process.argv.slice(2)
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback }
const projectId = option('--project', 'karavela-distribuidora-bv')
const accountEmail = option('--account', '0vieira.francisco0@gmail.com').toLowerCase()
const ownerEmail = option('--owner-email', accountEmail).toLowerCase()
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('ID do projeto inválido.')
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error('Email do dono inválido.')
function firebase(command, json = false) {
  const child = spawnSync(process.execPath, [cli, ...command, ...(json ? ['--json'] : [])], { cwd: root, encoding: 'utf8', stdio: json ? ['inherit', 'pipe', 'pipe'] : 'inherit' })
  if (child.status !== 0) throw new Error('A etapa Firebase falhou: ' + command[0] + '. Confira a mensagem acima.')
  if (!json) return
  const output = JSON.parse(child.stdout)
  if (output.status !== 'success') throw new Error('O Firebase não confirmou a operação.')
  return output.result
}
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))
let account = firebaseAuth.getAllAccounts().find(item => item.user.email.toLowerCase() === accountEmail)
if (args.includes('--check')) {
  console.log('Projeto preparado: ' + projectId + '. Administrador exclusivo: ' + ownerEmail + '. Conta Firebase conectada: ' + Boolean(account))
  process.exit(0)
}
if (!account) {
  console.log('Entre no navegador com ' + accountEmail + '. Sua senha será digitada apenas no Google.')
  firebase(['login:add', accountEmail])
  account = firebaseAuth.getAllAccounts().find(item => item.user.email.toLowerCase() === accountEmail)
}
if (!account) throw new Error('A conta ' + accountEmail + ' não foi conectada. Nada foi publicado.')
const loginArgs = ['--account', accountEmail]
console.log('Verificando projeto Firebase…')
const projectResult = firebase(['projects:list', ...loginArgs], true)
const projects = Array.isArray(projectResult) ? projectResult : projectResult.projects
if (!Array.isArray(projects)) throw new Error('Não foi possível consultar seus projetos.')
if (!projects.some(project => project.projectId === projectId)) firebase(['projects:create', projectId, '--display-name', 'Karavela Distribuidora', ...loginArgs])
const scopes = ['email', 'openid', 'https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
const credential = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes)
const accessToken = credential.access_token
if (!accessToken) throw new Error('O Firebase não retornou uma autenticação válida.')
async function api(url, method = 'GET', body, acceptMissing = false) {
  const response = await fetch(url, { method, headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (acceptMissing && response.status === 404) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('Firebase (' + response.status + '): ' + (data.error?.message || 'Não foi possível concluir ' + method))
  return data
}
async function operation(base, op) {
  for (let attempt = 0; attempt < 90 && !op.done; attempt++) {
    await delay(1500)
    op = await api(base + '/' + op.name)
  }
  if (op.error) throw new Error(op.error.message || 'A configuração falhou.')
  if (!op.done) throw new Error('A configuração está demorando. Aguarde um pouco e execute novamente.')
  return op.response
}
console.log('Ativando autenticação, banco e hospedagem…')
for (const service of ['identitytoolkit.googleapis.com', 'firestore.googleapis.com', 'firebasehosting.googleapis.com']) {
  const op = await api('https://serviceusage.googleapis.com/v1/projects/' + projectId + '/services/' + service + ':enable', 'POST', {})
  await operation('https://serviceusage.googleapis.com/v1', op)
}
const configUrl = 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + projectId + '/config'
const previousAuth = await api(configUrl, 'GET', undefined, true) || {}
const domains = [...new Set([...(previousAuth.authorizedDomains || []), projectId + '.web.app', projectId + '.firebaseapp.com', 'karavela-distribuidora.vercel.app'])]
await api(configUrl + '?updateMask=signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains', 'PATCH', { name: 'projects/' + projectId + '/config', signIn: { email: { enabled: true, passwordRequired: true } }, authorizedDomains: domains })
const databaseUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)'
if (!await api(databaseUrl, 'GET', undefined, true)) {
  const op = await api('https://firestore.googleapis.com/v1/projects/' + projectId + '/databases?databaseId=(default)', 'POST', { type: 'FIRESTORE_NATIVE', locationId: 'southamerica-east1' })
  await operation('https://firestore.googleapis.com/v1', op)
}
const management = 'https://firebase.googleapis.com/v1beta1'
let apps = await api(management + '/projects/' + projectId + '/webApps')
let app = apps.apps?.find(item => item.displayName === 'Karavela Distribuidora') || apps.apps?.[0]
if (!app) {
  const op = await api(management + '/projects/' + projectId + '/webApps', 'POST', { displayName: 'Karavela Distribuidora' })
  app = await operation(management, op)
}
const publicConfig = await api(management + '/projects/' + projectId + '/webApps/' + app.appId + '/config')
const docsBase = databaseUrl + '/documents'
function value(data) {
  if (data === null) return { nullValue: null }
  if (typeof data === 'string') return { stringValue: data }
  if (typeof data === 'boolean') return { booleanValue: data }
  if (typeof data === 'number') return Number.isInteger(data) ? { integerValue: String(data) } : { doubleValue: data }
  if (Array.isArray(data)) return { arrayValue: { values: data.map(value) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(data).map(([key, entry]) => [key, value(entry)])) } }
}
async function seed(path, data) {
  const existing = await api(docsBase + '/' + path, 'GET', undefined, true)
  if (existing) {
    if (path === 'access/owner' && existing.fields?.email?.stringValue !== ownerEmail) throw new Error('Este projeto já tem outro administrador. Use um projeto separado ou confirme o email correto.')
    return
  }
  await api(docsBase + ':commit', 'POST', { writes: [{ update: { name: 'projects/' + projectId + '/databases/(default)/documents/' + path, fields: value(data).mapValue.fields }, currentDocument: { exists: false } }] })
}
console.log('Preservando fotos, categorias e preços…')
await seed('access/owner', { email: ownerEmail })
await seed('access/catalog', { productIds: products.map(product => product.id), quantities: Array.from({ length: 999 }, (_, index) => index + 1) })
await seed('settings/catalog', JSON.parse(await readFile('public/assets/migration/catalog-config.json', 'utf8')))
await seed('settings/media', JSON.parse(await readFile('public/assets/migration/media-config.json', 'utf8')))
await writeFile('src/firebase.public.json', JSON.stringify({ apiKey: publicConfig.apiKey, authDomain: publicConfig.authDomain, projectId: publicConfig.projectId, appId: publicConfig.appId }, null, 2) + '\n')
await writeFile('.firebaserc', JSON.stringify({ projects: { default: projectId } }, null, 2) + '\n')
const npmCli = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const build = spawnSync(npmCli, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
if (build.status !== 0) throw new Error('A compilação falhou. Nada foi publicado.')
const sites = await api('https://firebasehosting.googleapis.com/v1beta1/projects/' + projectId + '/sites')
if (!sites.sites?.some(site => site.name.endsWith('/' + projectId))) firebase(['hosting:sites:create', projectId, '--project', projectId, ...loginArgs])
firebase(['deploy', '--only', 'firestore,hosting', '--project', projectId, ...loginArgs])
const site = 'https://' + projectId + '.web.app/'
const health = await fetch(site)
if (!health.ok || !(await health.text()).includes('Karavela')) throw new Error('O Firebase publicou, mas a confirmação da página falhou. Confira o console antes de divulgar.')
console.log('\nPublicado: ' + site + '\nNo site, crie sua conta com ' + ownerEmail + ' e confirme o email para liberar Administrar loja.\nO catálogo não exige login; enviar e acompanhar pedidos exige uma conta.')
