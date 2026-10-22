$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$publicRoot = Join-Path $repoRoot 'public\assets\models'

if (-not (Test-Path (Join-Path $repoRoot 'index.html') -PathType Leaf)) {
    throw "Could not find index.html next to the installer. Extract this update into the Kano Life repository root, then double-click Install-Kano-Life-Texture-Fix.cmd."
}
if (-not (Test-Path $publicRoot -PathType Container)) {
    throw "Could not find public\assets\models. No files were changed."
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Test-Png512 {
    param([byte[]]$Bytes, [string]$Label)
    if ($null -eq $Bytes -or $Bytes.Length -lt 24) {
        throw "$Label is too small to be a PNG."
    }
    $expectedSignature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    for ($i = 0; $i -lt $expectedSignature.Length; $i++) {
        if ($Bytes[$i] -ne $expectedSignature[$i]) {
            throw "$Label is not a PNG file. Download may have returned an HTML error page instead."
        }
    }
    $width = [long]$Bytes[16] * 16777216 + [long]$Bytes[17] * 65536 + [long]$Bytes[18] * 256 + [long]$Bytes[19]
    $height = [long]$Bytes[20] * 16777216 + [long]$Bytes[21] * 65536 + [long]$Bytes[22] * 256 + [long]$Bytes[23]
    if ($width -ne 512 -or $height -ne 512) {
        throw "$Label has dimensions ${width}x${height}; expected the 512x512 Kenney palette. No texture was installed."
    }
}

function Get-ZipEntryBytes {
    param($Entry)
    $stream = $null
    $memory = $null
    try {
        $stream = $Entry.Open()
        $memory = New-Object System.IO.MemoryStream
        $stream.CopyTo($memory)
        return ,([byte[]]$memory.ToArray())
    }
    finally {
        if ($stream) { $stream.Dispose() }
        if ($memory) { $memory.Dispose() }
    }
}

$kits = @(
    [pscustomobject]@{
        Name = 'City Kit (Industrial)'
        Url = 'https://kenney.nl/media/pages/assets/city-kit-industrial/0ec35b139d-1788171848/kenney_city-kit-industrial_2.0.zip'
        Destination = Join-Path $publicRoot 'world\buildings-industrial\Textures\colormap.png'
        ModelFolder = Join-Path $publicRoot 'world\buildings-industrial'
    },
    [pscustomobject]@{
        Name = 'City Kit (Suburban)'
        Url = 'https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip'
        Destination = Join-Path $publicRoot 'world\buildings-suburban\Textures\colormap.png'
        ModelFolder = Join-Path $publicRoot 'world\buildings-suburban'
    },
    [pscustomobject]@{
        Name = 'Car Kit (ambulance)'
        Url = 'https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip'
        Destination = Join-Path $publicRoot 'vehicles\special\Textures\colormap.png'
        ModelFolder = Join-Path $publicRoot 'vehicles\special'
        RequiredModel = Join-Path $publicRoot 'vehicles\special\ambulance.glb'
    }
)

# Preflight every target and source model folder before downloading or writing.
foreach ($kit in $kits) {
    if (-not (Test-Path $kit.ModelFolder -PathType Container)) {
        throw "Expected model folder is missing: $($kit.ModelFolder). This update was not extracted over the correct repository or asset layout differs. No files were changed."
    }
    if ($kit.RequiredModel -and -not (Test-Path $kit.RequiredModel -PathType Leaf)) {
        throw "Expected ambulance model is missing: $($kit.RequiredModel). No files were changed."
    }
    if (-not $kit.RequiredModel -and -not (Get-ChildItem -LiteralPath $kit.ModelFolder -Filter '*.glb' -File -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        throw "No GLB model was found in $($kit.ModelFolder). No files were changed."
    }
    if (Test-Path $kit.Destination -PathType Leaf) {
        $existing = [System.IO.File]::ReadAllBytes($kit.Destination)
        Test-Png512 -Bytes $existing -Label $kit.Destination
        Write-Host "PRESERVE existing valid texture: $($kit.Destination)" -ForegroundColor Yellow
    }
}

$downloadRoot = Join-Path $env:TEMP ('KanoLife-Kenney-Texture-Fix-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
$pendingWrites = New-Object System.Collections.Generic.List[object]

try {
    foreach ($kit in $kits) {
        if (Test-Path $kit.Destination -PathType Leaf) {
            $pendingWrites.Add([pscustomobject]@{ Kit = $kit; Bytes = $null; Preserved = $true })
            continue
        }

        $safeName = ($kit.Name -replace '[^A-Za-z0-9]+', '-').Trim('-')
        $archivePath = Join-Path $downloadRoot ($safeName + '.zip')
        Write-Host "Downloading official Kenney pack: $($kit.Name)" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $kit.Url -OutFile $archivePath -UseBasicParsing
        if (-not (Test-Path $archivePath -PathType Leaf) -or (Get-Item $archivePath).Length -lt 1024) {
            throw "Download for $($kit.Name) is missing or too small. No textures have been installed."
        }

        $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
        try {
            $entries = @($archive.Entries | Where-Object { $_.FullName -match '(?i)(^|/)Textures/colormap\.png$' })
            if ($entries.Count -eq 0) {
                throw "The official $($kit.Name) archive did not contain Textures/colormap.png. No textures have been installed; the kit/version needs manual review."
            }
            $glbEntries = @($entries | Where-Object { $_.FullName -match '(?i)GLB[^/]*/Textures/colormap\.png$' })
            if ($glbEntries.Count -eq 1) {
                $chosen = $glbEntries[0]
            }
            elseif ($entries.Count -eq 1) {
                $chosen = $entries[0]
            }
            else {
                throw "The official $($kit.Name) archive has multiple colormap candidates and no unambiguous GLB texture. No textures have been installed."
            }
            $bytes = Get-ZipEntryBytes -Entry $chosen
            Test-Png512 -Bytes $bytes -Label "$($kit.Name) $($chosen.FullName)"
            $pendingWrites.Add([pscustomobject]@{ Kit = $kit; Bytes = $bytes; Preserved = $false })
            Write-Host "Validated 512x512 source palette from $($chosen.FullName)" -ForegroundColor Green
        }
        finally {
            $archive.Dispose()
        }
    }

    # No output paths are written until all missing source palettes are fetched and validated.
    foreach ($item in $pendingWrites) {
        if ($item.Preserved) { continue }
        $destination = $item.Kit.Destination
        if (Test-Path $destination -PathType Leaf) {
            throw "A destination appeared during installation; refusing to overwrite it: $destination"
        }
        $parent = Split-Path -Parent $destination
        [System.IO.Directory]::CreateDirectory($parent) | Out-Null
        [System.IO.File]::WriteAllBytes($destination, $item.Bytes)
        Write-Host "INSTALLED $destination" -ForegroundColor Green
    }
}
finally {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Texture placement completed. Existing valid textures were not overwritten.' -ForegroundColor Green
$auditScript = Join-Path $repoRoot 'scripts\audit-glb-texture-references.mjs'
if (Test-Path $auditScript -PathType Leaf) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Set-Location $repoRoot
        Write-Host 'Running the read-only GLB texture reference audit...' -ForegroundColor Cyan
        & node $auditScript
        if ($LASTEXITCODE -ne 0) {
            throw 'Texture files were installed, but the follow-up Node audit failed. Review the audit output before continuing.'
        }
    }
    else {
        Write-Host 'Node.js was not found; texture files are installed, but the GLB audit did not run.' -ForegroundColor Yellow
    }
}
