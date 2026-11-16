<#
  optimizacion.ps1 — Optimización de Windows 10/11 para consumir menos recursos
  ---------------------------------------------------------------------------------
  USO (PowerShell como Administrador):
      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\optimizacion.ps1                        # optimización estándar (segura)
      .\optimizacion.ps1 -Agresivo              # además desactiva indexado, SysMain y geolocalización
      .\optimizacion.ps1 -QuitarBloatware       # además desinstala apps preinstaladas inútiles (no Xbox)
      .\optimizacion.ps1 -QuitarXbox            # además desactiva servicios Xbox y quita sus apps
                                                #   (rompe Game Pass, mandos Xbox y juegos con cuenta Xbox)
      .\optimizacion.ps1 -BloquearSegundoPlano  # además bloquea apps de la Store en segundo plano
                                                #   (puede quitar notificaciones de WhatsApp, Teams, Correo...)
      .\optimizacion.ps1 -Revertir              # restaura los valores originales guardados en el respaldo

  QUÉ NO TOCA (a propósito): Windows Defender, Firewall, Windows Update,
  Hyper-V, WSL, Docker, red, impresión, audio ni drivers. No vacía la papelera.
  Antes de cambiar nada crea un PUNTO DE RESTAURACIÓN y guarda cada valor original
  en %ProgramData%\OptimizacionWindows\respaldo.json para que -Revertir lo deje todo como estaba.
#>

param(
    [switch]$Agresivo,
    [switch]$QuitarBloatware,
    [switch]$QuitarXbox,
    [switch]$BloquearSegundoPlano,
    [switch]$Revertir,
    [switch]$SinPuntoRestauracion   # continuar aunque no se pueda crear el punto de restauración
)

# ---------- Comprobaciones ----------
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Ejecuta PowerShell como ADMINISTRADOR." -ForegroundColor Red
    exit 1
}

$log = Join-Path ([Environment]::GetFolderPath("Desktop")) "optimizacion-log.txt"
function Log($msg, $color = "Gray") {
    Write-Host $msg -ForegroundColor $color
    Add-Content -Path $log -Value "$(Get-Date -Format 'HH:mm:ss')  $msg" -Encoding UTF8
}

# ---------- Respaldo de valores originales ----------
$dirRespaldo = Join-Path $env:ProgramData "OptimizacionWindows"
$archivoRespaldo = Join-Path $dirRespaldo "respaldo.json"
$respaldo = @{ Registro = @{}; Servicios = @{}; PlanEnergia = $null }
if (Test-Path $archivoRespaldo) {
    # Se conserva el respaldo de ejecuciones anteriores: solo se guarda el PRIMER valor visto (el original)
    $json = Get-Content $archivoRespaldo -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $json.Registro.PSObject.Properties) { $respaldo.Registro[$p.Name] = $p.Value }
    foreach ($p in $json.Servicios.PSObject.Properties) { $respaldo.Servicios[$p.Name] = $p.Value }
    $respaldo.PlanEnergia = $json.PlanEnergia
}
function Save-Respaldo {
    if (-not (Test-Path $dirRespaldo)) { New-Item -ItemType Directory -Path $dirRespaldo -Force | Out-Null }
    $respaldo | ConvertTo-Json -Depth 5 | Set-Content -Path $archivoRespaldo -Encoding UTF8
}

function Set-Reg($ruta, $nombre, $valor, $tipo = "DWord") {
    $id = "$ruta|$nombre"
    if (-not $respaldo.Registro.ContainsKey($id)) {
        $original = @{ Existe = $false; Valor = $null; Tipo = $null }
        $clave = Get-Item -Path $ruta -ErrorAction SilentlyContinue
        if ($clave -and ($clave.GetValueNames() -contains $nombre)) {
            $original.Existe = $true
            $original.Tipo = $clave.GetValueKind($nombre).ToString()
            $original.Valor = $clave.GetValue($nombre, $null, "DoNotExpandEnvironmentNames")
        }
        $respaldo.Registro[$id] = $original
    }
    try {
        if (-not (Test-Path $ruta)) { New-Item -Path $ruta -Force -ErrorAction Stop | Out-Null }
        Set-ItemProperty -Path $ruta -Name $nombre -Value $valor -Type $tipo -Force -ErrorAction Stop
    } catch {
        # Windows 11 protege algunos valores (p. ej. widgets) con el driver UCPD, incluso para administradores
        Log "  [registro] ${nombre}: bloqueado por Windows ($($_.Exception.Message))" "Yellow"
    }
}

function Set-Servicio($nombre, $inicio) {
    $s = Get-Service -Name $nombre -ErrorAction SilentlyContinue
    if (-not $s) { return }
    if (-not $respaldo.Servicios.ContainsKey($nombre)) { $respaldo.Servicios[$nombre] = $s.StartType.ToString() }
    try {
        if ($inicio -eq "Disabled") { Stop-Service $nombre -Force -ErrorAction SilentlyContinue }
        Set-Service -Name $nombre -StartupType $inicio -ErrorAction Stop
        Log "  [servicio] $nombre -> $inicio"
    } catch { Log "  [servicio] ${nombre}: no se pudo cambiar ($($_.Exception.Message))" "Yellow" }
}

# Servicios prescindibles para la mayoría de usuarios
$servicios = @(
    "DiagTrack"          # Telemetría (Experiencias del usuario conectado)
    "dmwappushservice"   # Enrutamiento de mensajes push de telemetría
    "MapsBroker"         # Administrador de mapas descargados
    "RetailDemo"         # Modo demo de tienda
    "Fax"                # Fax
    "WerSvc"             # Informe de errores de Windows
    "wisvc"              # Windows Insider
)
# Solo con -Agresivo
$serviciosAgresivo = @(
    "SysMain"            # Superfetch (poco útil con SSD)
    "WSearch"            # Indexado de búsqueda (la búsqueda sigue funcionando, más lenta)
    "lfsvc"              # Geolocalización (rompe "Buscar mi dispositivo" y zona horaria automática)
)
# Solo con -QuitarXbox
$serviciosXbox = @("XblAuthManager", "XblGameSave", "XboxNetApiSvc", "XboxGipSvc")

# ======================================================================
#  REVERTIR
# ======================================================================
if ($Revertir) {
    Log "=== REVIRTIENDO AJUSTES ===" "Cyan"
    if (-not (Test-Path $archivoRespaldo)) {
        Log "No hay respaldo en $archivoRespaldo. Usa el punto de restauración 'Antes de optimizar Windows'." "Yellow"
        exit 1
    }
    foreach ($nombre in $respaldo.Servicios.Keys) {
        $inicio = $respaldo.Servicios[$nombre]
        try {
            Set-Service -Name $nombre -StartupType $inicio -ErrorAction Stop
            if ($inicio -eq "Automatic") { Start-Service $nombre -ErrorAction SilentlyContinue }
            Log "  [servicio] $nombre -> $inicio"
        } catch { Log "  [servicio] ${nombre}: no se pudo restaurar ($($_.Exception.Message))" "Yellow" }
    }
    foreach ($id in $respaldo.Registro.Keys) {
        $ruta, $nombre = $id -split '\|', 2
        $o = $respaldo.Registro[$id]
        try {
            if ($o.Existe) {
                $valor = if ($o.Tipo -eq "Binary") { [byte[]]$o.Valor } elseif ($o.Tipo -eq "MultiString") { [string[]]$o.Valor } else { $o.Valor }
                if (-not (Test-Path $ruta)) { New-Item -Path $ruta -Force | Out-Null }
                Set-ItemProperty -Path $ruta -Name $nombre -Value $valor -Type $o.Tipo -Force -ErrorAction Stop
            } else {
                Remove-ItemProperty -Path $ruta -Name $nombre -ErrorAction SilentlyContinue
            }
        } catch { Log "  [registro] ${id}: no se pudo restaurar ($($_.Exception.Message))" "Yellow" }
    }
    Log "  Registro restaurado ($($respaldo.Registro.Count) valores)."
    if ($respaldo.PlanEnergia) { powercfg /setactive $respaldo.PlanEnergia | Out-Null; Log "  Plan de energía restaurado." }
    Remove-Item $archivoRespaldo -Force
    Log "Hecho. Reinicia el equipo. (Las apps desinstaladas se reinstalan desde Microsoft Store.)" "Green"
    exit 0
}

# ======================================================================
#  OPTIMIZAR
# ======================================================================
Log "=== OPTIMIZACION DE WINDOWS - $(Get-Date) ===" "Cyan"

# 1. Punto de restauración
Log "[1/8] Creando punto de restauración..." "Cyan"
$frecuenciaKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore"
$frecuenciaOriginal = (Get-ItemProperty $frecuenciaKey -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
try {
    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
    # Windows solo permite un punto cada 24 h; se quita el límite temporalmente
    Set-ItemProperty $frecuenciaKey -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord -Force
    Checkpoint-Computer -Description "Antes de optimizar Windows" -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
    Log "  Punto de restauración creado." "Green"
} catch {
    Log "  No se pudo crear el punto de restauración: $($_.Exception.Message)" "Yellow"
    if (-not $SinPuntoRestauracion) {
        Log "  Abortado. Usa -SinPuntoRestauracion para continuar sin él." "Red"
        exit 1
    }
} finally {
    if ($null -eq $frecuenciaOriginal) { Remove-ItemProperty $frecuenciaKey -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
    else { Set-ItemProperty $frecuenciaKey -Name SystemRestorePointCreationFrequency -Value $frecuenciaOriginal -Type DWord -Force }
}

# 2. Servicios innecesarios
Log "[2/8] Desactivando servicios innecesarios..." "Cyan"
foreach ($s in $servicios) { Set-Servicio $s "Disabled" }
if ($Agresivo)   { foreach ($s in $serviciosAgresivo) { Set-Servicio $s "Disabled" } }
if ($QuitarXbox) { foreach ($s in $serviciosXbox)     { Set-Servicio $s "Disabled" } }
Save-Respaldo

# 3. Telemetría y publicidad
Log "[3/8] Reduciendo telemetría, sugerencias y publicidad..." "Cyan"
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection" "AllowTelemetry" 0  # En Home/Pro equivale al mínimo permitido
Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" "Enabled" 0
$cdm = "HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"
foreach ($v in "SilentInstalledAppsEnabled","SystemPaneSuggestionsEnabled","SubscribedContent-338388Enabled",
               "SubscribedContent-338389Enabled","SubscribedContent-353694Enabled","SoftLandingEnabled") {
    Set-Reg $cdm $v 0
}
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent" "DisableWindowsConsumerFeatures" 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Dsh" "AllowNewsAndInterests" 0        # Widgets (Win 11)
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Feeds" "EnableFeeds" 0 # Noticias (Win 10)
Save-Respaldo
Log "  Hecho. Si los widgets salen como bloqueados, quítalos en Configuración > Personalización > Barra de tareas > Widgets."

# 4. Grabación de juegos y apps en segundo plano
Log "[4/8] Desactivando grabación de juegos en segundo plano..." "Cyan"
Set-Reg "HKCU:\System\GameConfigStore" "GameDVR_Enabled" 0
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR" "AllowGameDVR" 0
if ($BloquearSegundoPlano) {
    Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications" "GlobalUserDisabled" 1
    Log "  Apps de la Store en segundo plano bloqueadas."
}
Save-Respaldo
Log "  Hecho."

# 5. Efectos visuales -> rendimiento (mantiene suavizado de fuentes y miniaturas)
Log "[5/8] Ajustando efectos visuales para rendimiento..." "Cyan"
Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" "VisualFXSetting" 3
Set-Reg "HKCU:\Control Panel\Desktop" "UserPreferencesMask" ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) "Binary"
Set-Reg "HKCU:\Control Panel\Desktop" "FontSmoothing" "2" "String"
Set-Reg "HKCU:\Control Panel\Desktop\WindowMetrics" "MinAnimate" "0" "String"
Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "TaskbarAnimations" 0
Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "EnableTransparency" 0
Set-Reg "HKCU:\Control Panel\Desktop" "MenuShowDelay" "50" "String"
Save-Respaldo
Log "  Hecho (se aplica por completo al cerrar sesión o reiniciar)."

# 6. Plan de energía
Log "[6/8] Plan de energía..." "Cyan"
$esPortatil = $null -ne (Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)
if ($esPortatil) {
    Log "  Portátil detectado: se mantiene el plan actual (Alto rendimiento gastaría más batería y calentaría más)."
} else {
    if (-not $respaldo.PlanEnergia -and ((powercfg /getactivescheme) -match '([0-9a-f\-]{36})')) { $respaldo.PlanEnergia = $Matches[1] }
    $out = powercfg /duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null
    if ($out -match '([0-9a-f\-]{36})') { powercfg /setactive $Matches[1] | Out-Null; Log "  Plan 'Máximo rendimiento' activado." }
    else { powercfg /setactive SCHEME_MIN | Out-Null; Log "  Plan 'Alto rendimiento' activado." }
    Save-Respaldo
}

# 7. Bloatware (opcional)
$apps = @()
if ($QuitarBloatware) {
    $apps += "Microsoft.BingNews","Microsoft.BingWeather","Microsoft.GetHelp","Microsoft.Getstarted",
        "Microsoft.MicrosoftSolitaireCollection","Microsoft.MicrosoftOfficeHub","Microsoft.People",
        "Microsoft.WindowsFeedbackHub","Microsoft.WindowsMaps","Microsoft.ZuneMusic","Microsoft.ZuneVideo",
        "Microsoft.MixedReality.Portal","Microsoft.SkypeApp","Microsoft.Todos",
        "Microsoft.PowerAutomateDesktop","Clipchamp.Clipchamp","Microsoft.549981C3F5F10",  # Cortana
        "*CandyCrush*","*Disney*","*TikTok*","*Spotify*","*Facebook*","*Instagram*"
}
if ($QuitarXbox) {
    $apps += "Microsoft.XboxApp","Microsoft.GamingApp","Microsoft.Xbox.TCUI","Microsoft.XboxGamingOverlay",
        "Microsoft.XboxGameOverlay","Microsoft.XboxSpeechToTextOverlay","Microsoft.XboxIdentityProvider"
}
if ($apps) {
    Log "[7/8] Desinstalando apps preinstaladas innecesarias..." "Cyan"
    $provisionadas = Get-AppxProvisionedPackage -Online
    foreach ($a in $apps) {
        Get-AppxPackage -Name $a -AllUsers -ErrorAction SilentlyContinue | ForEach-Object {
            try { Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction Stop; Log "  [app] eliminada: $($_.Name)" }
            catch { Log "  [app] no se pudo eliminar $($_.Name)" "Yellow" }
        }
        $provisionadas | Where-Object DisplayName -like $a | ForEach-Object {
            Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null
        }
    }
} else {
    Log "[7/8] Apps: omitido (usa -QuitarBloatware y/o -QuitarXbox)." "DarkGray"
}

# 8. Limpieza de temporales (la papelera NO se toca)
Log "[8/8] Limpiando archivos temporales..." "Cyan"
$antes = (Get-PSDrive C).Free
# Parar Windows Update antes de borrar su caché de descargas para no dejar una actualización a medias
$wu = Get-Service wuauserv, bits -ErrorAction SilentlyContinue | Where-Object Status -eq "Running"
$wu | Stop-Service -Force -ErrorAction SilentlyContinue
foreach ($ruta in "$env:TEMP\*", "$env:SystemRoot\Temp\*", "$env:SystemRoot\SoftwareDistribution\Download\*") {
    Remove-Item $ruta -Recurse -Force -ErrorAction SilentlyContinue
}
$wu | Start-Service -ErrorAction SilentlyContinue
$liberado = [math]::Round(((Get-PSDrive C).Free - $antes) / 1MB)
Log "  Liberados ~$liberado MB (los archivos en uso se dejan)." "Green"

# ---------- Resumen: programas de inicio para revisar a mano ----------
Log "`n=== PROGRAMAS QUE ARRANCAN CON WINDOWS (revísalos) ===" "Cyan"
Get-CimInstance Win32_StartupCommand | Sort-Object Name -Unique | ForEach-Object { Log "  - $($_.Name)" }
Log "Desactiva los que no necesites en: Administrador de tareas > Aplicaciones de arranque." "Yellow"

Log "`nRespaldo para -Revertir: $archivoRespaldo"
Log "=== TERMINADO. REINICIA EL EQUIPO. Log en: $log ===" "Green"
