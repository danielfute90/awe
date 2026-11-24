# Mettre Awé en ligne gratuitement, sans carte bancaire

Ce guide utilise quatre services gratuits, qui ne demandent pas de carte bancaire :

| Service | Rôle |
|---|---|
| **GitHub** | héberge le code ; Render le récupère à partir de là |
| **Neon** | la base de données Postgres (permanente) |
| **Render** | fait tourner Awé (site et bot Telegram), à une adresse `https://….onrender.com` |
| **cron-job.org** | interroge Awé toutes les 10 minutes (Render met en veille les services gratuits inactifs) |

Durée : environ 30 minutes.

---

## 1. GitHub : publier le code

1. Créez un compte sur https://github.com/signup.
2. Créez un dépôt vide : https://github.com/new, nom `awe`, visibilité **Public**, sans cocher aucune option, puis *Create repository*.
3. Dans un terminal, depuis le dossier du projet (remplacez `VOTRE_PSEUDO`) :

```powershell
git init -b main
git add .
git commit -m "Première version"
git remote add origin https://github.com/VOTRE_PSEUDO/awe.git
git push -u origin main
```

Lors du premier envoi, une fenêtre GitHub s'ouvre pour vous authentifier. Le fichier `.env`, la base locale et le dossier `storage/` ne sont **pas** envoyés (voir `.gitignore`).

Pour les mises à jour suivantes : `git add .`, `git commit -m "description"`, `git push`. Render redéploie automatiquement.

## 2. Neon : la base de données

1. Créez un compte sur https://neon.tech (la connexion avec GitHub est la plus simple).
2. Créez un projet `awe`, dans la région la plus proche (par exemple Frankfurt pour l'Europe).
3. Cliquez sur **Connect**, désactivez *Connection pooling* et copiez l'adresse qui commence par `postgresql://`.
4. Dans le terminal :

```powershell
powershell -ExecutionPolicy Bypass -File deploy\preparer-render.ps1
```

Le script demande l'adresse : collez-la (elle reste invisible), puis appuyez sur Entrée.
Il crée le fichier `.env.render`, qui reprend vos clés et ajoute les réglages de production. Ce fichier reste sur votre ordinateur et n'est jamais publié.

## 3. Render : faire tourner Awé

1. Créez un compte sur https://render.com avec **GitHub**.
2. **New**, puis **Web Service**, et choisissez le dépôt `awe`.
3. Réglages :
   - **Language / Runtime** : Docker
   - **Region** : Frankfurt
   - **Instance type** : **Free**
4. **Environment Variables**, puis **Add from .env** : ouvrez `.env.render` (`notepad .env.render`), copiez l'intégralité du contenu, collez-le et validez.
5. **Advanced**, **Health Check Path** : `/health`.
6. **Deploy**. La première construction prend 5 à 10 minutes. Le service est prêt lorsque le journal (*Logs*) affiche `Bot Telegram @… démarré (webhook)`.

L'adresse du service apparaît en haut de la page : `https://awe-xxxx.onrender.com`.
Une fois les variables saisies dans Render, vous pouvez supprimer `.env.render`.

## 4. Google : autoriser la nouvelle adresse

Dans https://console.cloud.google.com/apis/credentials, ouvrez votre identifiant OAuth, puis dans **URI de redirection autorisés**, ajoutez :

```
https://awe-xxxx.onrender.com/api/gmail/callback
```

Conservez l'adresse `localhost` pour le développement. Envoyez ensuite `/connecter_gmail` au bot Telegram.

## 5. cron-job.org : éviter la mise en veille

Sans visite pendant 15 minutes, Render met Awé en veille : les rappels ne partiraient plus à l'heure et le premier message mettrait environ une minute à recevoir une réponse.

1. Créez un compte gratuit sur https://cron-job.org.
2. **Create cronjob** : URL `https://awe-xxxx.onrender.com/health`, fréquence *Every 10 minutes*, puis **Create**.

L'offre gratuite de Render inclut 750 heures par mois, ce qui suffit pour un service actif en continu.

---

## Points d'attention

- **Une seule instance du bot à la fois.** Ne lancez pas `pnpm dev` avec le même `TELEGRAM_BOT_TOKEN` pendant que le service tourne sur Render : les deux instances se disputeraient les messages. Pour développer en local, videz `TELEGRAM_BOT_TOKEN` dans `.env` ou utilisez `DEMO=true`.
- **Base de données distincte.** Les données locales (SQLite) ne sont pas transférées : la base en ligne démarre vide. Le compte administrateur et les identifiants Telegram sont recréés automatiquement ; Gmail doit être reconnecté une fois.
- **PDF.** Ils sont stockés dans la base Neon et survivent donc aux redéploiements (le disque de Render est effacé à chaque fois).
- **Accès au site.** Dans Telegram, la commande `/web` fournit un lien de connexion vers l'adresse Render.
