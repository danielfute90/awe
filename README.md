# Awé — un assistant personnel IA, sur Telegram et le web

Awé est un agent IA qui gère ta liste de courses, tes rappels, lit et résume tes emails,
prépare des emails (envoyés **seulement après ton clic « Valider »**), crée des PDF et
comprend les notes vocales. Telegram et l'interface web partagent la même mémoire,
en temps réel.

Construit avec **Claude** (Anthropic) comme cerveau, **ElevenLabs** pour la voix, et une
attention particulière à la sécurité d'un agent qui agit pour toi.

## Essayer la démo (sans aucune clé, sans rien payer)

Il faut **Node.js 20+** et **pnpm** (`npm install -g pnpm`).

```bash
pnpm install
pnpm web:install
pnpm web:build
cp .env.example .env        # Windows : copy .env.example .env
```

Dans `.env`, mets `DEMO=true`, puis :

```bash
pnpm dev
```

Ouvre **http://localhost:3000** et clique sur **« Entrer dans la démo »**.

En mode démo, Claude est remplacé par un petit cerveau à règles et Gmail par une fausse boîte
(avec un email piégé pour voir la protection en action). Mais ce sont **les vrais outils,
permissions et validations** du projet qui tournent. Essaie :

- « Ajoute 6 œufs et du beurre à ma liste »
- « Résume mes mails » (l'email d'arnaque est repéré)
- « Envoie ma liste à marie@exemple.com » puis **Valider** dans la page Validations
- « Supprime le mail de la banque » (refusé : action interdite)
- « Fais-moi un PDF de ma liste »

## Ce qu'il sait faire

| Domaine | Détail |
|---|---|
| Conversation | Telegram (texte et vocal) et interface web, même mémoire (20 derniers messages) |
| Courses | ajouter, retirer, cocher ; synchronisé en direct entre Telegram et le web |
| Rappels | « Rappelle-moi d'appeler maman demain à 18h », en tenant compte du fuseau horaire |
| Gmail | chercher, lire, résumer ; envoyer **après validation** ; jamais supprimer |
| PDF | création et envoi sur Telegram, aperçu et téléchargement sur le web |
| Voix | transcription des notes vocales et réponse vocale (ElevenLabs, mode économique) |
| Admin | invitations, utilisateurs, coûts par jour, journal de chaque tâche étape par étape |

## Sécurité : un agent qui ne fait pas n'importe quoi

- **Permissions vérifiées dans le code**, pas dans le prompt : chaque outil est `auto`,
  `approval` (validation humaine obligatoire) ou `forbidden` (ex. `supprimer_email`).
  Le modèle ne peut pas les contourner.
- **Validation humaine** des envois : brouillon exact, empreinte SHA-256, expiration 10 min,
  avertissement si le destinataire n'a jamais été contacté, un seul envoi même avec deux clics.
- **Protection contre l'injection de prompt** : le contenu des emails est encadré comme
  « donnée non fiable » ; le résumé est fait par un modèle sans aucun outil.
- **Jetons Gmail chiffrés** (AES-256-GCM), droits minimaux (`gmail.readonly` + `gmail.send`).
- Interface web : connexion sans mot de passe par lien magique à usage unique, cookie
  `httpOnly`, protection CSRF, limite de débit, isolation stricte des données par utilisateur.
- Limites : 15 étapes par tâche, budget de tokens par jour, alertes à l'admin
  (erreur répétée 3 fois, budget à 80 %).

## Utiliser sa propre version (avec ses clés)

Remplis `.env` (tout est expliqué dans `.env.example`) :

| Variable | Où l'obtenir |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID` | @BotFather et @userinfobot sur Telegram |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud, client OAuth de type « Application Web » |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ELEVENLABS_API_KEY` | elevenlabs.io (facultatif, pour la voix) |

Puis `pnpm dev`, et envoie `/start` à ton bot. Mise en ligne gratuite : voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | lance Awé (serveur, bot, interface) sur http://localhost:3000 |
| `pnpm chat` | parle à Awé depuis le terminal |
| `pnpm lien-web` | lien de connexion à l'interface web sans Telegram |
| `pnpm web:build` | recompile l'interface après une modification de `web/` |
| `pnpm web:dev` | interface avec rechargement instantané (http://localhost:5173) |
| `pnpm test` | tests automatiques |
| `pnpm build` / `pnpm start` | version compilée (production) |
| `pnpm db:generate` | migrations après une modification du schéma |

Commandes Telegram : `/aide`, `/liste`, `/web`, `/voix on|off`, `/connecter_gmail`,
`/deconnecter_gmail` ; admin : `/inviter`, `/utilisateurs`, `/retirer <n°>`, `/couts`, `/logs <n°>`.

## Organisation du code

```
src/server.ts        démarrage : base, bot, serveur web, tâches planifiées
src/agent/           la boucle de l'agent (handleUserMessage) et le prompt système
src/tools/           un fichier par famille d'outils (courses, rappels, gmail, envoi, pdf)
src/security/        permissions, limites, chiffrement, encadrement des données non fiables
src/services/        logique métier (Gmail, voix, validations, alertes, sessions...)
src/bot/             bot Telegram (identification, commandes, vocal, boutons, admin)
src/api/             API REST + temps réel (SSE) de l'interface web
src/demo/            mode démo (cerveau à règles, fausse boîte Gmail)
src/db/              schéma SQLite + Postgres (jumeaux) et connexion
web/                 interface React + Vite + Tailwind
deploy/              mise en ligne (Docker, HTTPS automatique, scripts)
test/                tests automatiques (node:test)
```

Base de données : SQLite par défaut (`DATABASE_URL=file:./data/awe.db`), Postgres possible
(`DATABASE_URL=postgres://...`). Le schéma existe en deux versions jumelles
(`src/db/schema.sqlite.ts` et `src/db/schema.pg.ts`) ; les migrations s'appliquent au démarrage.
