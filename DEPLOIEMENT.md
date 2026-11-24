# Mettre Awé en ligne sur Oracle Cloud (gratuit)

Résultat : Awé tourne 24 h/24 sur un serveur gratuit, avec une adresse HTTPS
(`https://<ton-ip>.sslip.io`). Telegram, les rappels et l'interface web marchent
même quand ton PC est éteint.

Durée : environ 30 minutes, dont 10 d'attente.

---

## Étape 1 — Créer le compte Oracle Cloud

1. Va sur **https://signup.cloud.oracle.com** et crée un compte (offre « Free Tier »).
2. **Région d'origine** : choisis la plus proche de toi (ex. *France Central (Paris)* ou
   *Germany Central (Frankfurt)*). Elle ne pourra plus être changée.
3. Une carte bancaire est demandée pour vérifier ton identité. Les ressources « Always Free »
   ne sont pas facturées.

## Étape 2 — Créer la machine

1. Menu (en haut à gauche) → **Compute** → **Instances** → **Create instance**.
2. **Name** : `awe`.
3. **Image and shape** → **Edit** :
   - Image : **Canonical Ubuntu** (22.04 ou 24.04).
   - Shape : **Ampere** → `VM.Standard.A1.Flex`, 1 OCPU, 6 GB de mémoire (badge *Always Free-eligible*).
     Si Oracle répond « Out of capacity », prends `VM.Standard.E2.1.Micro` (AMD, aussi gratuit).
4. **Networking** : laisse « Create new virtual cloud network » et vérifie que
   **Assign a public IPv4 address** est coché.
5. **Add SSH keys** : choisis **Generate a key pair for me**, puis clique sur
   **Save private key**. Garde ce fichier (ex. `ssh-key-2026-11-15.key` dans Téléchargements).
6. Clique sur **Create**. Au bout d'une minute, la machine passe en **Running** (vert).
7. Note l'**adresse IP publique** affichée sur la page de la machine (ex. `132.145.10.20`).

## Étape 3 — Ouvrir les ports web (80 et 443)

1. Sur la page de la machine, clique sur le lien du **Subnet** (section *Primary VNIC*).
2. **Security Lists** → **Default Security List** → **Add Ingress Rules**.
3. Remplis :
   - Source CIDR : `0.0.0.0/0`
   - IP Protocol : `TCP`
   - Destination Port Range : `80,443`
4. **Add Ingress Rules**.

## Étape 4 — Envoyer Awé sur le serveur (depuis ton PC)

1. **Arrête Awé sur ton PC** : dans le terminal de `pnpm dev`, fais **Ctrl+C**.
   (Deux Awé avec le même bot Telegram se gêneraient.)
2. Dans le terminal de VS Code, dans le dossier du projet, lance (remplace l'IP et le chemin de la clé) :

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\envoyer.ps1 -Ip 132.145.10.20 -Cle C:\Users\HP\Downloads\ssh-key-2026-11-15.key
   ```

3. À la question « Are you sure you want to continue connecting », tape `yes`.
4. Attends le message **« Awé est en ligne : https://… »** (5 à 10 minutes la première fois).

Ta base de données (conversation, liste, accès Gmail) est copiée sur le serveur.

## Étape 5 — Autoriser la nouvelle adresse chez Google (Gmail)

1. **https://console.cloud.google.com/auth/clients** → ton client OAuth.
2. **URI de redirection autorisés** → **Ajouter un URI** → colle l'adresse affichée à la fin
   du script : `https://<ton-ip>.sslip.io/api/gmail/callback`.
3. **Enregistrer**.

## Étape 6 — Tester

- Sur Telegram (iPhone) : « Ajoute du riz à ma liste ».
- Envoie `/web` : le lien s'ouvre maintenant **sur ton iPhone aussi**.
- Envoie `/connecter_gmail` si Gmail demande à être reconnecté.

---

## Ensuite

| Besoin | Commande |
|---|---|
| Mettre à jour après une modification du code | relance la même commande `deploy\envoyer.ps1` (ta base sur le serveur est conservée) |
| Se connecter au serveur | `ssh -i <clé> ubuntu@<ip>` |
| Voir les messages d'Awé | sur le serveur : `cd awe && sudo docker compose logs -f awe` |
| Redémarrer Awé | sur le serveur : `cd awe && sudo docker compose restart awe` |
| Sauvegarder la base sur ton PC | `scp -i <clé> ubuntu@<ip>:~/awe/data/djo.db .\sauvegarde-djo.db` |

**Important** : ne relance plus `pnpm dev` sur ton PC avec le même `TELEGRAM_BOT_TOKEN` pendant que
le serveur tourne (les deux se disputeraient les messages). Pour développer en local, utilise
`pnpm chat` ou mets `DEMO=true`.
