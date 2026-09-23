param([Parameter(Mandatory=$true)][string]$ClientName, [string]$MongoUri = '', [string]$JwtSecret = '')
. (Join-Path $PSScriptRoot 'distribution-common.ps1')
if ($MongoUri -or $JwtSecret) { throw 'Configure las credenciales en el equipo de destino mediante CONFIGURAR-INICIAL.bat; no se incluyen secretos en paquetes.' }
if ($ClientName -notmatch '^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$') { throw 'Nombre de cliente invalido.' }
& (Join-Path $PSScriptRoot 'build-all.ps1')
Write-Host "Paquete para $ClientName listo en distribucion. La configuracion se realiza localmente al instalar."
