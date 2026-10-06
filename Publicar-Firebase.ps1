param(
  [string]$Projeto = 'karavela-distribuidora-bv',
  [string]$ContaFirebase = '0vieira.francisco0@gmail.com',
  [string]$EmailDono = '0vieira.francisco0@gmail.com'
)
$ErrorActionPreference = 'Stop'
$PastaProjeto = $PSScriptRoot
if (-not (Test-Path (Join-Path $PastaProjeto 'package.json'))) {
  $PastaProjeto = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Karavela-Firebase'
  if (Test-Path $PastaProjeto) { throw "A pasta $PastaProjeto ja existe. Execute o script dentro dela ou escolha outra pasta antes de baixar novamente." }
  $ZipTemporario = Join-Path ([System.IO.Path]::GetTempPath()) ('karavela-firebase-' + [guid]::NewGuid().ToString() + '.zip')
  $ExtracaoTemporaria = Join-Path ([System.IO.Path]::GetTempPath()) ('karavela-firebase-' + [guid]::NewGuid().ToString())
  try {
    Invoke-WebRequest -Uri 'https://github.com/VieiraFrancisco1/Karavela-distribuidora/archive/refs/heads/firebase-migration.zip' -OutFile $ZipTemporario
    Expand-Archive -Path $ZipTemporario -DestinationPath $ExtracaoTemporaria
    $FonteProjeto = Get-ChildItem -LiteralPath $ExtracaoTemporaria -Directory | Select-Object -First 1
    Move-Item -LiteralPath $FonteProjeto.FullName -Destination $PastaProjeto
  } finally {
    Remove-Item -LiteralPath $ZipTemporario -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ExtracaoTemporaria -Recurse -Force -ErrorAction SilentlyContinue
  }
}
Set-Location $PastaProjeto
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale o Node.js LTS e execute novamente.' }
Write-Host "Preparando a Karavela. No navegador, use $ContaFirebase." -ForegroundColor Cyan
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependencias.' }
& node --import tsx scripts/publish-firebase.mjs --project $Projeto --account $ContaFirebase --owner-email $EmailDono
if ($LASTEXITCODE -ne 0) { throw 'A publicacao nao terminou. Confira a mensagem acima e execute novamente para continuar.' }
Write-Host 'Publicacao concluida. O endereco aparece acima.' -ForegroundColor Green
