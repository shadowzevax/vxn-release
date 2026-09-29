# Descarga la ultima version desde GitHub y reemplaza los archivos de esta
# carpeta. Los datos del usuario (anuncios guardados, ajustes...) NO estan
# aqui: viven en el perfil del navegador, y no se tocan.
# Tras copiar, la extension se recarga sola en menos de un minuto; despues
# basta con refrescar las pestanas de la Biblioteca de anuncios.

$ErrorActionPreference = "Stop"
$Repo = "USUARIO/REPOSITORIO"
$Rama = "main"
$Destino = $PSScriptRoot

if ($Repo -like "USUARIO/*") { Write-Host "Falta configurar el repositorio en actualizar.ps1" -ForegroundColor Red; exit 1 }

$tmp = Join-Path $env:TEMP ("vyxen-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null
try {
  Write-Host "Descargando la ultima version..." -ForegroundColor Cyan
  $zip = Join-Path $tmp "v.zip"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Repo/zip/refs/heads/$Rama" -OutFile $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $origen = Get-ChildItem -LiteralPath $tmp -Directory | Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } | Select-Object -First 1
  if (-not $origen) { throw "El archivo descargado no contiene la extension." }

  $nueva = (Get-Content -Raw (Join-Path $origen.FullName "manifest.json") | ConvertFrom-Json).version
  $actual = (Get-Content -Raw (Join-Path $Destino "manifest.json") | ConvertFrom-Json).version
  Write-Host "Version instalada: $actual  ->  version nueva: $nueva"

  Get-ChildItem -LiteralPath $origen.FullName -Force | Where-Object { $_.Name -ne ".git" } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destino -Recurse -Force
  }
  Write-Host "Listo. La extension se recargara sola en menos de un minuto." -ForegroundColor Green
  Write-Host "Luego refresca las pestanas de la Biblioteca de anuncios."
} catch {
  Write-Host ("No se pudo actualizar: " + $_.Exception.Message) -ForegroundColor Red
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
