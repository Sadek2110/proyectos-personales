# Optimizacion Windows 11 - ejecutar como administrador
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
function Step($name, [scriptblock]$action) {
    try { & $action; $log.Add("OK    $name") }
    catch { $log.Add("FALLO $name -> $($_.Exception.Message)") }
}
function RegSet($path, $name, $value, $type = 'DWord') {
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $type -Force | Out-Null
}
$adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$cdm = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'

# --- 2. Arranque sin animacion (GUI) ---
Step 'Arranque: quietboot' { bcdedit /set '{current}' quietboot on | Out-Null; if ($LASTEXITCODE) { throw "bcdedit $LASTEXITCODE" } }

# --- 3. Servicios (solo los seguros sin preguntar) ---
$services = @{
    'MapsBroker'     = 'Administrador de mapas descargados'
    'stisvc'         = 'Adquisicion de imagenes de Windows (WIA)'
    'SharedAccess'   = 'Conexion compartida a Internet (ICS)'
    'DiagTrack'      = 'Experiencias del usuario y telemetria'
    'RemoteRegistry' = 'Registro remoto'
    'wisvc'          = 'Servicio de Windows Insider'
}
foreach ($s in $services.Keys) {
    Step "Servicio deshabilitado: $($services[$s])" {
        $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
        if (-not $svc) { throw 'no existe en este equipo' }
        Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
        Set-Service -Name $s -StartupType Disabled
    }
}

# --- 4. Efectos visuales: mejor rendimiento + miniaturas, seleccion translucida, suavizado de fuentes ---
Step 'Efectos visuales (rendimiento)' {
    RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 3
    RegSet 'HKCU:\Control Panel\Desktop' 'UserPreferencesMask' ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) 'Binary'
    RegSet 'HKCU:\Control Panel\Desktop' 'FontSmoothing' '2' 'String'
    RegSet 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' 'String'
    RegSet $adv 'IconsOnly' 0
    RegSet $adv 'ListviewAlphaSelect' 1
    RegSet $adv 'ListviewShadow' 0
    RegSet $adv 'TaskbarAnimations' 0
    RegSet 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 0
}

# --- 5. Energia: Maximo rendimiento ---
Step 'Plan de energia: Maximo rendimiento' {
    $existing = powercfg /list | Select-String 'e9a42b02-d5df-448d-aa00-03f14749eb61|M.ximo rendimiento|Ultimate Performance'
    if ($existing) { $guid = ([regex]'[0-9a-f-]{36}').Match($existing[0].Line).Value }
    else { $out = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61; $guid = ([regex]'[0-9a-f-]{36}').Match(($out -join ' ')).Value }
    if (-not $guid) { throw 'no se pudo crear el plan' }
    powercfg /setactive $guid
}

# --- 5. Notificaciones: sugerencias y ofertas ---
Step 'Notificaciones: sin sugerencias ni ofertas' {
    RegSet $cdm 'SubscribedContent-310093Enabled' 0
    RegSet $cdm 'SubscribedContent-338389Enabled' 0
    RegSet $cdm 'SoftLandingEnabled' 0
    RegSet $cdm 'SystemPaneSuggestionsEnabled' 0
    RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement' 'ScoobeSystemSettingEnabled' 0
}

# --- 5. Sensor de almacenamiento (sin tocar Descargas) ---
Step 'Sensor de almacenamiento activado' {
    $sp = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
    RegSet $sp '01' 1
    RegSet $sp '04' 1     # borrar temporales de apps
    RegSet $sp '512' 0    # NO borrar Descargas
}
Step 'Limpieza cache de Optimizacion de distribucion' { Delete-DeliveryOptimizationCache -Force }

# --- 5. Apps en segundo plano: Nunca (Enlace movil, Game Bar, Obtener ayuda) ---
foreach ($pfn in 'Microsoft.YourPhone_8wekyb3d8bbwe','Microsoft.XboxGamingOverlay_8wekyb3d8bbwe','Microsoft.GetHelp_8wekyb3d8bbwe') {
    Step "Segundo plano Nunca: $pfn" {
        $p = "HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications\$pfn"
        RegSet $p 'Disabled' 1
        RegSet $p 'DisabledByUser' 1
    }
}

# --- 5. Desinstalar Copilot ---
Step 'Desinstalar Copilot' {
    $pkgs = Get-AppxPackage -Name '*Copilot*'
    if (-not $pkgs) { throw 'no esta instalado' }
    $pkgs | Remove-AppxPackage
}

# --- 5. DNS AdGuard en adaptadores activos y Wi-Fi ---
Step 'DNS AdGuard (94.140.14.14 / 94.140.15.15)' {
    $ads = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -or $_.Name -match 'Wi-?Fi' }
    foreach ($a in $ads) { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses '94.140.14.14','94.140.15.15' }
    Clear-DnsClientCache
}

# --- 5. Pantalla de bloqueo ---
Step 'Pantalla de bloqueo: sin datos curiosos ni Spotlight' {
    RegSet $cdm 'RotatingLockScreenEnabled' 0
    RegSet $cdm 'RotatingLockScreenOverlayEnabled' 0
    RegSet $cdm 'SubscribedContent-338387Enabled' 0
}

# --- 5. Menu Inicio ---
Step 'Inicio: sin recientes, recomendados ni sugerencias' {
    RegSet 'HKCU:\Software\Policies\Microsoft\Windows\Explorer' 'HideRecentlyAddedApps' 1
    RegSet $adv 'Start_TrackDocs' 0
    RegSet $adv 'Start_IrisRecommendations' 0
    RegSet $adv 'Start_AccountNotifications' 0
}

# --- 5. Barra de tareas ---
Step 'Barra de tareas: sin Vista de tareas' { RegSet $adv 'ShowTaskViewButton' 0 }
Step 'Barra de tareas: buscador solo icono' { RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' 1 }
Step 'Barra de tareas: sin Widgets' { RegSet $adv 'TaskbarDa' 0 }

# --- 5. Juegos ---
Step 'Game Bar / capturas desactivadas' {
    RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0
    RegSet 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 0
    RegSet 'HKCU:\Software\Microsoft\GameBar' 'UseNexusForGameBarEnabled' 0
}
Step 'Modo de juego activado' {
    RegSet 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 1
    RegSet 'HKCU:\Software\Microsoft\GameBar' 'AllowAutoGameMode' 1
}

# --- 5. Accesibilidad: transparencia y animaciones ---
Step 'Transparencia desactivada' { RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 0 }
Step 'Efectos de animacion desactivados' {
    Add-Type -Namespace W -Name SPI -MemberDefinition '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, IntPtr c, uint d);'
    [W.SPI]::SystemParametersInfo(0x1043, 0, [IntPtr]::Zero, 3) | Out-Null   # SPI_SETCLIENTAREAANIMATION = off
}

# --- 6. Defender ---
Step 'Defender: tiempo real, nube, PUA' {
    Set-MpPreference -DisableRealtimeMonitoring $false -MAPSReporting Advanced -SubmitSamplesConsent SendSafeSamples -PUAProtection Enabled
}
Step 'SmartScreen para apps y archivos' { RegSet 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' 'SmartScreenEnabled' 'Warn' 'String' }

# --- 6. Privacidad ---
Step 'Privacidad: ID de publicidad y ofertas' {
    RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' 0
    RegSet 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Privacy' 'TailoredExperiencesWithDiagnosticDataEnabled' 0
    RegSet 'HKCU:\Control Panel\International\User Profile' 'HttpAcceptLanguageOptOut' 1
    RegSet $adv 'Start_TrackProgs' 0
    RegSet $cdm 'SubscribedContent-338393Enabled' 0
    RegSet $cdm 'SubscribedContent-353694Enabled' 0
    RegSet $cdm 'SubscribedContent-353696Enabled' 0
}
Step 'Visor de datos de diagnostico desactivado' {
    RegSet 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Diagnostics\DiagTrack\EventTranscriptKey' 'EnableEventTranscript' 0
}

# --- 7. Temporales (NO Prefetch) ---
foreach ($dir in $env:TEMP, "$env:WINDIR\Temp") {
    Step "Limpiar $dir" {
        Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$log
