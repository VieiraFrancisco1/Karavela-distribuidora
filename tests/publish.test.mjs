import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function run(env, args = ['--service-account']) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/publish-firebase.mjs', ...args], { encoding: 'utf8', env })
}
test('desativar a conta técnica exige seleção explícita do modo de publicação', () => {
  const result = run({ ...process.env }, ['--disable-publisher'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /exige o modo de conta de serviço explícito/)
  assert.doesNotMatch(result.stdout, /Entre no navegador|Verificando projeto/)
})
test('publicação por conta de serviço exige uma credencial explícita', () => {
  const env = { ...process.env }; delete env.GOOGLE_APPLICATION_CREDENTIALS
  const result = run(env)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Informe a credencial de publicação/)
  assert.doesNotMatch(result.stdout, /Ativando autenticação/)
})
test('uma credencial de outro projeto é rejeitada antes de acessar as APIs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'karavela-credential-test-'))
  try {
    const path = join(directory, 'fixture.json')
    await writeFile(path, JSON.stringify({ type: 'service_account', project_id: 'outro-projeto', client_email: 'test@outro-projeto.iam.gserviceaccount.com' }))
    const result = run({ ...process.env, GOOGLE_APPLICATION_CREDENTIALS: path })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /A credencial não pertence ao projeto autorizado/)
    assert.doesNotMatch(result.stdout, /Ativando autenticação/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
