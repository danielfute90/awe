# =====================================================================
# Envoie Awé sur votre serveur Oracle et l'installe (ou le met à jour).
# À lancer depuis le dossier du projet, sous Windows :
#
#   powershell -ExecutionPolicy Bypass -File deploy\envoyer.ps1 -Ip 132.145.10.20 -Cle C:\Users\HP\Downloads\ssh-key.key
#
#   -Ip  : l'adresse IP publique de votre machine Oracle
#   -Cle : la clé privée SSH téléchargée à la création de la machine
#
# Ce que fait le script :
#   1. prépare le .env de production (adresse HTTPS publique, mode production)
#   2. emballe le code (sans node_modules ni secrets inutiles)
#   3. l'envoie au serveur avec votre base de données (la première fois seulement)
#   4. lance deploy/installer.sh sur le serveur
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [Parameter(Mandatory = $true)][string]$Cle,
  [string]$Utilisateur = "ubuntu"
)
$ErrorActionPreference = "Stop"
$racine = Split-Path $PSScriptRoot -Parent
$travail = Join-Path $env:TEMP "awe-envoi"
New-Item -ItemType Directory -Force $travail | Out-Null

# Adresse publique gratuite avec HTTPS : 132.145.10.20 → 132-145-10-20.sslip.io
$domaine = ($Ip.Trim() -replace '\.', '-') + ".sslip.io"
$url = "https://$domaine"
$cible = "$Utilisateur@$($Ip.Trim())"

Write-Host "`n==> Adresse publique d'Awé : $url" -ForegroundColor Green

# SSH refuse une clé lisible par d'autres comptes Windows : on la protège.
icacls $Cle /inheritance:r /grant:r "$($env:USERNAME):R" | Out-Null
$ssh = @("-i", $Cle, "-o", "StrictHostKeyChecking=accept-new")

# 1. .env de production : on reprend votre .env et on remplace ce qui change en ligne.
Write-Host "==> 1/4 Préparation du .env de production"
$aRemplacer = '^\s*(NODE_ENV|PUBLIC_URL|GOOGLE_REDIRECT_URI|DATABASE_URL|STORAGE_DIR|DOMAINE|PORT|BOT_MODE)\s*='
$lignes = @(Get-Content (Join-Path $racine ".env") | Where-Object { $_ -notmatch $aRemplacer })
$lignes += @(
  "",
  "# --- Ajouté par deploy/envoyer.ps1 ---",
  "NODE_ENV=production",
  "PORT=3000",
  "PUBLIC_URL=$url",
  "GOOGLE_REDIRECT_URI=$url/api/gmail/callback",
  "DATABASE_URL=file:./data/awe.db",
  "BOT_MODE=polling",
  "DOMAINE=$domaine"
)
# UTF-8 sans BOM (sinon Docker lit mal la première ligne).
[IO.File]::WriteAllLines((Join-Path $travail "env.production"), $lignes, (New-Object Text.UTF8Encoding($false)))

# 2. Archive du code (sans dépendances, compilations, données ni secrets).
Write-Host "==> 2/4 Emballage du code"
$archive = Join-Path $travail "awe.tgz"
tar -czf $archive --exclude "./node_modules" --exclude "./web/node_modules" --exclude "./dist" --exclude "./web/dist" `
  --exclude "./data" --exclude "./storage" --exclude "./.env" --exclude "*.log" -C $racine .
if ($LASTEXITCODE -ne 0) { throw "Échec de l'emballage du code" }

# 3. Envoi.
Write-Host "==> 3/4 Envoi vers $cible"
$fichiers = @($archive, (Join-Path $travail "env.production"))
$base = Join-Path $racine "data\awe.db"
if (Test-Path $base) { $fichiers += $base }
scp @ssh @fichiers "${cible}:~/"
if ($LASTEXITCODE -ne 0) { throw "Envoi impossible : vérifie l'IP, la clé et que le port 22 est ouvert." }

# 4. Installation sur le serveur. La base locale n'est copiée que si le serveur n'en a pas encore
#    (ensuite, c'est la base du serveur qui fait foi : on ne l'écrase jamais).
Write-Host "==> 4/4 Installation sur le serveur (la première fois : 5 à 10 minutes)"
$commandes = @(
  "set -e",
  "mkdir -p ~/awe",
  "tar -xzf ~/awe.tgz -C ~/awe",
  "mv ~/env.production ~/awe/.env",
  "if [ -f ~/awe.db ]; then if [ ! -f ~/awe/data/awe.db ]; then mkdir -p ~/awe/data && mv ~/awe.db ~/awe/data/awe.db && echo 'Base de données copiée.'; else rm ~/awe.db; fi; fi",
  "rm -f ~/awe.tgz",
  "sed -i 's/\r$//' ~/awe/deploy/installer.sh",
  "bash ~/awe/deploy/installer.sh"
) -join " && "
ssh @ssh $cible $commandes
if ($LASTEXITCODE -ne 0) { throw "L'installation a échoué : copie les messages ci-dessus à Claude." }

Write-Host "`nTerminé. Dernière étape (une seule fois) : ajoute cette adresse dans Google Cloud," -ForegroundColor Green
Write-Host "Clients OAuth > votre client > URI de redirection autorisés :" -ForegroundColor Green
Write-Host "   $url/api/gmail/callback`n" -ForegroundColor Yellow
