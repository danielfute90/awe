// =====================================================================
// Construction du serveur Fastify (sans le démarrer).
// Séparé de server.ts pour pouvoir le tester sans ouvrir de port.
//
//   /health        → santé du serveur
//   /auth/...      → connexion par lien magique
//   /api/gmail/... → connexion Gmail (OAuth)
//   /api/...       → API de l'interface web (session obligatoire)
//   le reste       → l'interface web compilée (web/dist)
// =====================================================================
import { existsSync } from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { webhookCallback, type Bot } from "grammy";
import type { AweContext } from "../bot/contexte.js";
import { config } from "../config.js";
import { count } from "drizzle-orm";
import { db, estPostgres, users } from "../db/index.js";
import { log } from "../logger.js";
import { routesAuth } from "./auth.js";
import { routesGmail } from "./gmail.js";
import { routesWeb } from "./web.js";

const DOSSIER_WEB = path.resolve("web/dist");

export function creerApp({ bot }: { bot?: Bot<AweContext> | null } = {}) {
  const app = Fastify({ loggerInstance: log as FastifyBaseLogger, trustProxy: true });

  // Mode webhook : Telegram envoie les messages ici. Le jeton secret prouve que c'est bien Telegram.
  if (bot && config.BOT_MODE === "webhook") {
    app.post(
      "/telegram/webhook",
      webhookCallback(bot, "fastify", {
        secretToken: config.TELEGRAM_WEBHOOK_SECRET,
        // Si Claude réfléchit plus de 10 s, on répond « bien reçu » à Telegram et Awé
        // continue son travail. Sinon Telegram croirait à un échec et renverrait le message.
        onTimeout: "return",
      }),
    );
  }

  app.register(cookie);
  // Limite de débit : 120 requêtes par minute (par session, sinon par adresse IP).
  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.cookies?.awe_session ?? req.ip,
    errorResponseBuilder: () => ({ statusCode: 429, erreur: "Trop de requêtes. Attends une minute." }),
  });

  // Route de santé : vérifie que le serveur ET la base répondent.
  app.get("/health", { config: { rateLimit: false } }, async () => {
    const [{ total }] = await db.select({ total: count() }).from(users);
    return { ok: true, base: estPostgres ? "postgres" : "sqlite", utilisateurs: total };
  });

  app.register(async (publiques) => {
    routesAuth(publiques);
    routesGmail(publiques);
  });
  // Toutes les routes de ce bloc exigent une session (voir routesWeb).
  app.register(routesWeb);

  // L'interface web compilée (pnpm web:build). Toute autre adresse affiche l'appli (elle gère ses pages).
  // Les fichiers sont lus à chaque demande : une recompilation est prise en compte sans redémarrer.
  app.register(fastifyStatic, { root: DOSSIER_WEB });

  app.setNotFoundHandler((req, reply) => {
    if (req.method !== "GET" || req.url.startsWith("/api/") || req.url.startsWith("/auth/") || req.url.startsWith("/assets/")) {
      return reply.code(404).send({ erreur: "introuvable" });
    }
    if (!existsSync(path.join(DOSSIER_WEB, "index.html"))) {
      return reply
        .type("text/html; charset=utf-8")
        .send("<p style='font-family:sans-serif'>L'interface web n'est pas encore compilée. Lance <b>pnpm web:build</b>, puis redémarre Awé.</p>");
    }
    return reply.sendFile("index.html");
  });

  return app;
}
