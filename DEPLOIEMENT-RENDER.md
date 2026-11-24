# Mettre Awé en ligne gratuitement, sans carte bancaire

Trois services gratuits, sans carte :

| Service | Rôle |
|---|---|
| **GitHub** | garde le code ; Render le lit de là |
| **Neon** | la base de données Postgres (permanente) |
| **Render** | fait tourner Awé (site + bot Telegram), adresse `https://….onrender.com` |
| **cron-job.org** | réveille Awé toutes les 10 minutes (Render endort les services gratuits inactifs) |

Compte environ 30 minutes.

---

## 1. GitHub : envoyer le code

1. Crée un compte sur https://github.com/signup.
2. Crée un dépôt vide : https://github.com/new → nom `awe` → **Public** → ne coche rien → *Create repository*.
3. Ferme et rouvre VS Code (pour qu'il trouve git), puis dans le terminal, dans `C:\Users\HP\awe` (remplace `TON_PSEUDO`) :

```powershell
git remote add origin https://github.com/TON_PSEUDO/awe.git
git push -u origin main
```

(Le dépôt et le premier enregistrement du code sont déjà prêts.)

Une fenêtre GitHub s'ouvre pour te connecter la première fois. Ton `.env`, ta base et tes PDF ne sont **pas** envoyés (`.gitignore`).

Pour les mises à jour plus tard : `git add . ; git commit -m "maj" ; git push` → Render redéploie tout seul.

## 2. Neon : la base de données

1. Crée un compte sur https://neon.tech (connexion avec GitHub, c'est le plus simple).
2. Crée un projet `awe`, région la plus proche (Europe, ex. Frankfurt).
3. Bouton **Connect** → décoche *Connection pooling* → copie l'adresse qui commence par `postgresql://`.
4. Dans le terminal :

```powershell
powershell -ExecutionPolicy Bypass -File deploy\preparer-render.ps1
```

Le script te demande l'adresse : colle-la (elle reste invisible), puis Entrée.
Le fichier `.env.render` est créé (tes clés + les réglages en ligne). Il reste sur ton PC.

## 3. Render : faire tourner Awé

1. Crée un compte sur https://render.com avec **GitHub**.
2. **New → Web Service** → choisis le dépôt `awe`.
3. Réglages :
   - **Language / Runtime** : Docker
   - **Region** : Frankfurt
   - **Instance type** : **Free**
4. **Environment Variables → Add from .env** : ouvre `.env.render` (`notepad .env.render`), copie tout, colle, valide.
5. **Advanced → Health Check Path** : `/health`.
6. **Deploy**. La première construction prend 5 à 10 minutes. C'est prêt quand le journal affiche `Bot Telegram @… démarré (webhook)`.

Ton adresse est en haut de la page : `https://awe-xxxx.onrender.com`.

## 4. Google : autoriser la nouvelle adresse

https://console.cloud.google.com/apis/credentials → ton identifiant OAuth → **URI de redirection autorisés** → ajoute :

```
https://awe-xxxx.onrender.com/api/gmail/callback
```

(garde aussi celle de localhost). Puis dans Telegram : `/connecter_gmail`.

## 5. cron-job.org : garder Awé éveillé

Sans ça, Render endort Awé après 15 minutes sans visite : les rappels ne partiraient plus à l'heure.

1. Compte gratuit sur https://cron-job.org.
2. **Create cronjob** → URL `https://awe-xxxx.onrender.com/health` → *Every 10 minutes* → Create.

Render offre 750 h par mois : assez pour qu'Awé tourne tout le mois.

---

## À savoir

- **Ne lance plus `pnpm dev` avec le bot** sur ton PC : les deux Awé se disputeraient les messages Telegram. Pour développer en local, vide `TELEGRAM_BOT_TOKEN` dans ton `.env` (ou mets `DEMO=true`).
- **Base neuve en ligne** : tes listes et ton historique locaux restent sur ton PC. En ligne, tu repars de zéro (ton compte admin et tes ID Telegram sont recréés automatiquement). Reconnecte Gmail une fois.
- **PDF** : le disque de Render gratuit est effacé à chaque redéploiement. Les PDF déjà créés disparaissent alors ; demande simplement à Awé de les refaire.
- **Lien web** : dans Telegram, `/web` te donne le lien de connexion vers ton adresse Render.
