// =====================================================================
// Point d'entrée : démarre la base, le bot Telegram et le serveur Fastify.
// =====================================================================
import type { Bot } from "grammy";
import { creerApp } from "./api/app.js";
import type { AweContext } from "./bot/contexte.js";
import { creerBot, preparerBot } from "./bot/index.js";
import { config } from "./config.js";
import { estPostgres, fermerDb, migrerDb } from "./db/index.js";
import { log } from "./logger.js";
import { preparerDemo } from "./demo/index.js";
import { demarrerRappels } from "./services/rappels.js";
import { assurerAdmin } from "./services/users.js";

async function demarrer() {
  // 1. Base de données : on applique les migrations (crée les tables si besoin).
  await migrerDb();
  log.info(`Base de données prête (${estPostgres ? "Postgres" : "SQLite"})`);

  // 2. Le compte admin existe toujours (créé au premier démarrage).
  const admin = await assurerAdmin();
  log.info(`Compte admin : #${admin.id} ${admin.telegramId ? "(relié à Telegram)" : "(pas encore relié à Telegram)"}`);

  // 2 bis. Mode démo : données d'exemple, faux Claude, faux Gmail (aucune clé utilisée).
  if (config.DEMO) await preparerDemo(admin.id);

  // 3. Bot Telegram, seulement si un token est fourni (et jamais en mode démo).
  let bot: Bot<AweContext> | null = null;
  if (config.TELEGRAM_BOT_TOKEN && !config.DEMO) {
    bot = creerBot(config.TELEGRAM_BOT_TOKEN);
    await preparerBot(bot);
  } else {
    log.warn(config.DEMO ? "Mode démo : bot Telegram désactivé." : "Pas de TELEGRAM_BOT_TOKEN : le bot Telegram est désactivé.");
  }

  // 4. Serveur web (API + interface). En mode webhook, il reçoit aussi les messages Telegram.
  const app = creerApp({ bot });
  await app.listen({ port: config.PORT, host: "0.0.0.0" });

  // 5. Réception des messages Telegram :
  //    - polling : Awé demande à Telegram « du nouveau ? » en continu (simple, marche partout)
  //    - webhook : Telegram appelle Awé (nécessite une adresse HTTPS publique)
  if (bot) {
    if (config.BOT_MODE === "webhook") {
      // On GARDE les messages en attente : sur Render gratuit, c'est souvent
      // un message Telegram qui réveille Awé, il ne faut pas le jeter.
      await bot.api.setWebhook(`${config.PUBLIC_URL}/telegram/webhook`, {
        secret_token: config.TELEGRAM_WEBHOOK_SECRET,
        drop_pending_updates: false,
      });
      log.info(`Bot Telegram @${bot.botInfo.username} démarré (webhook)`);
    } else {
      bot
        .start({
          drop_pending_updates: true,
          onStart: (info) => log.info(`Bot Telegram @${info.username} démarré (long polling)`),
        })
        .catch((err) => {
          log.fatal({ err }, "Impossible de démarrer le bot. Vérifie TELEGRAM_BOT_TOKEN.");
          process.exit(1);
        });
    }
  }

  // 6. Tâche planifiée : rappels et expiration des validations, chaque minute.
  const arreterRappels = demarrerRappels();

  // 7. Arrêt propre (Ctrl+C ou redémarrage du serveur).
  const arreter = async () => {
    log.info("Arrêt d'Awé...");
    arreterRappels();
    if (config.BOT_MODE !== "webhook") await bot?.stop();
    await app.close();
    await fermerDb();
    process.exit(0);
  };
  process.once("SIGINT", arreter);
  process.once("SIGTERM", arreter);
}

demarrer().catch((err) => {
  log.fatal({ err }, "Échec du démarrage");
  process.exit(1);
});
