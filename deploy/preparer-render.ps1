# =====================================================================
# Prépare les variables d'Awé pour Render (hébergement gratuit, sans carte).
# À lancer depuis le dossier du projet, sous Windows :
#
#   powershell -ExecutionPolicy Bypass -File deploy\preparer-render.ps1
#
# Le script demande l'adresse de votre base Neon (bouton « Connect » sur neon.tech).
# Collez-la quand il la demande : elle ne s'affiche pas et ne reste pas dans l'historique
# du terminal (contrairement à une adresse tapée dans la commande elle-même).
#
# Le script reprend votre .env, remplace ce qui change en ligne et écrit
# le fichier .env.render (jamais publié sur GitHub). Il suffit ensuite d'ouvrir
# ce fichier, de tout copier et de le coller dans Render (« Add from .env »).
# =====================================================================
param(
  [string]$BaseDeDonnees
)
$ErrorActionPreference = "Stop"
if (-not $BaseDeDonnees) {
  $saisie = Read-Host "Collez l'adresse Neon (postgresql://...) puis appuyez sur Entrée" -AsSecureString
  $BaseDeDonnees = [Net.NetworkCredential]::new("", $saisie).Password
}
$racine = Split-Path $PSScriptRoot -Parent
$source = Join-Path $racine ".env"
$sortie = Join-Path $racine ".env.render"

if (-not ($BaseDeDonnees.Trim() -match '^postgres(ql)?://')) {
  throw "L'adresse de la base doit commencer par postgresql:// (copie-la depuis Neon, bouton Connect)."
}

# Ce qui est différent en ligne (le reste de votre .env est repris tel quel).
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
Write-Host "Ouvrez-le (notepad .env.render), copiez tout son contenu, puis collez-le dans Render : Environment > Add from .env."
Write-Host "Ne le transmettez à personne : il contient vos clés. Il n'est pas publié sur GitHub."
