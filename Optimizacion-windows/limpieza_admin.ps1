# Limpieza de temporales de Windows (requiere ejecutar como Administrador)
#Requires -RunAsAdministrator

function Get-SizeMB($path) {
    [math]::Round(((Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1)
}

$targets = @(
    "$env:SystemRoot\Temp",
    "$env:SystemRoot\SoftwareDistribution\Download"   # instaladores de Windows Update ya aplicados
)

foreach ($t in $targets) {
    $before = Get-SizeMB $t
    Get-ChildItem $t -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    $after = Get-SizeMB $t
    Write-Host ("{0}: liberados {1} MB" -f $t, [math]::Round($before - $after, 1))
}

# Vaciar cache DNS
ipconfig /flushdns | Select-Object -Last 1

# Liberador de espacio de Windows en modo automatico (limpieza segura, mantiene puntos de restauracion)
Start-Process cleanmgr.exe -ArgumentList '/verylowdisk /d C' -Wait

Write-Host "Listo. Reinicia el equipo para completar la limpieza."
