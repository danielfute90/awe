# Mettre Awé en ligne sur Oracle Cloud (alternative)

> La méthode recommandée est décrite dans [DEPLOIEMENT-RENDER.md](DEPLOIEMENT-RENDER.md) (gratuite, sans carte bancaire).
> Ce guide-ci convient si vous disposez d'un compte Oracle Cloud ou d'un serveur Linux à vous.

Résultat : Awé tourne en continu sur un serveur gratuit, avec une adresse HTTPS
(`https://<votre-ip>.sslip.io`). Telegram, les rappels et l'interface web fonctionnent
même lorsque votre ordinateur est éteint.

Durée : environ 30 minutes, dont 10 d'attente.

---

## Étape 1 — Créer le compte Oracle Cloud

1. Rendez-vous sur **https://signup.cloud.oracle.com** et créez un compte (offre « Free Tier »).
2. **Région d'origine** : choisissez la plus proche (par exemple *France Central (Paris)* ou
   *Germany Central (Frankfurt)*). Elle ne pourra plus être modifiée.
3. Une carte bancaire est demandée pour vérifier votre identité. Les ressources « Always Free »
   ne sont pas facturées.

## Étape 2 — Créer la machine

1. Menu en haut à gauche, **Compute**, **Instances**, **Create instance**.
2. **Name** : `awe`.
3. **Image and shape**, **Edit** :
   - Image : **Canonical Ubuntu** (22.04 ou 24.04).
   - Shape : **Ampere**, `VM.Standard.A1.Flex`, 1 OCPU, 6 Go de mémoire (mention *Always Free-eligible*).
     En cas de message « Out of capacity », choisissez `VM.Standard.E2.1.Micro` (AMD, également gratuit).
4. **Networking** : conservez « Create new virtual cloud network » et vérifiez que
   **Assign a public IPv4 address** est coché.
5. **Add SSH keys** : choisissez **Generate a key pair for me**, puis cliquez sur
   **Save private key**. Conservez ce fichier (par exemple dans votre dossier Téléchargements).
6. Cliquez sur **Create**. Après environ une minute, la machine passe à l'état **Running**.
7. Notez l'**adresse IP publique** affichée sur la page de la machine (par exemple `132.145.10.20`).

## Étape 3 — Ouvrir les ports web (80 et 443)

1. Sur la page de la machine, cliquez sur le lien du **Subnet** (section *Primary VNIC*).
2. **Security Lists**, **Default Security List**, **Add Ingress Rules**.
3. Renseignez :
   - Source CIDR : `0.0.0.0/0`
   - IP Protocol : `TCP`
   - Destination Port Range : `80,443`
4. Validez avec **Add Ingress Rules**.

## Étape 4 — Envoyer Awé sur le serveur

1. **Arrêtez Awé sur votre ordinateur** (Ctrl+C dans le terminal de `pnpm dev`) :
   deux instances utilisant le même bot Telegram se gêneraient.
2. Depuis le dossier du projet, lancez (en adaptant l'adresse IP et le chemin de la clé) :

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\envoyer.ps1 -Ip 132.145.10.20 -Cle C:\chemin\vers\ssh-key.key
   ```

3. À la question « Are you sure you want to continue connecting », répondez `yes`.
4. Attendez le message **« Awé est en ligne : https://… »** (5 à 10 minutes la première fois).

Votre base de données locale (conversation, liste, accès Gmail) est copiée sur le serveur lors du premier envoi.

## Étape 5 — Autoriser la nouvelle adresse chez Google

1. **https://console.cloud.google.com/auth/clients**, puis votre client OAuth.
2. **URI de redirection autorisés**, **Ajouter un URI** : collez l'adresse affichée à la fin
   du script, `https://<votre-ip>.sslip.io/api/gmail/callback`.
3. **Enregistrer**.

## Étape 6 — Tester

- Sur Telegram : « Ajoute du riz à ma liste ».
- Envoyez `/web` : le lien de connexion fonctionne désormais depuis n'importe quel appareil.
- Envoyez `/connecter_gmail` si Gmail doit être reconnecté.

---

## Exploitation

| Besoin | Commande |
|---|---|
| Mettre à jour après une modification du code | relancer `deploy\envoyer.ps1` (la base du serveur est conservée) |
| Se connecter au serveur | `ssh -i <clé> ubuntu@<ip>` |
| Consulter les journaux d'Awé | sur le serveur : `cd awe && sudo docker compose logs -f awe` |
| Redémarrer Awé | sur le serveur : `cd awe && sudo docker compose restart awe` |
| Sauvegarder la base en local | `scp -i <clé> ubuntu@<ip>:~/awe/data/awe.db .\sauvegarde-awe.db` |

**Important** : ne lancez pas `pnpm dev` en local avec le même `TELEGRAM_BOT_TOKEN` pendant que
le serveur tourne. Pour développer en local, utilisez `pnpm chat` ou `DEMO=true`.
