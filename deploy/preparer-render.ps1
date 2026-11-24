# =====================================================================
# Prépare les variables d'Awé pour Render (hébergement gratuit, sans carte).
# À lancer depuis le dossier du projet, sur ton PC Windows :
#
#   powershell -ExecutionPolicy Bypass -File deploy\preparer-render.ps1 -BaseDeDonnees "postgresql://..."
#
#   -BaseDeDonnees : l'adresse de ta base Neon (bouton « Connect » sur neon.tech)
#
# Le script reprend ton .env, remplace ce qui change en ligne et écrit
# le fichier .env.render (jamais publié sur GitHub). Tu ouvres ce fichier,
# tu copies tout, et tu le colles dans Render (« Add from .env »).
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$BaseDeDonnees
)
$ErrorActionPreference = "Stop"
$racine = Split-Path $PSScriptRoot -Parent
$source = Join-Path $racine ".env"
$sortie = Join-Path $racine ".env.render"

if (-not ($BaseDeDonnees.Trim() -match '^postgres(ql)?://')) {
  throw "L'adresse de la base doit commencer par postgresql:// (copie-la depuis Neon, bouton Connect)."
}

# Ce qui est différent en ligne (le reste de ton .env est repris tel quel).
$aRemplacer = '^\s*(NODE_ENV|PORT|PUBLIC_URL|GOOGLE_REDIRECT_URI|DATABASE_URL|STORAGE_DIR|BOT_MODE|TELEGRAM_WEBHOOK_SECRET|DEMO|DOMAINE)\s*='
$lignes = @(Get-Content $source -Encoding UTF8 | Where-Object { $_ -match '^\s*[A-Z_]+\s*=\s*\S' -and $_ -notmatch $aRemplacer })

# Secret du webhook Telegram : une chaîne aléatoire de 64 caractères.
$octets = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
$secret = -join ($octets | ForEach-Object { $_.ToString("x2") })

$lignes += @(
  "NODE_ENV=production",
  "PORT=3000",
  "DEMO=false",
  "BOT_MODE=webhook",
  "TELEGRAM_WEBHOOK_SECRET=$secret",
  "DATABASE_URL=$($BaseDeDonnees.Trim())"
)
# PUBLIC_URL et GOOGLE_REDIRECT_URI : Render donne l'adresse tout seul (RENDER_EXTERNAL_URL).
[IO.File]::WriteAllLines($sortie, $lignes, (New-Object Text.UTF8Encoding($false)))

Write-Host "`nFichier prêt : $sortie" -ForegroundColor Green
Write-Host "Ouvre-le (notepad .env.render), copie TOUT, puis colle-le dans Render : Environment > Add from .env."
Write-Host "Ne l'envoie à personne : il contient tes clés. Il n'est pas publié sur GitHub."
