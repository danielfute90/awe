// =====================================================================
// Connexion web :
//   GET  /auth/magic?token=...  → ouvre une session puis redirige vers l'appli
//   GET  /auth/demo             → mode démo uniquement : entre sans lien
//   POST /auth/logout           → ferme la session
//   GET  /api/info              → infos publiques (mode démo ou non)
// Et "exigerSession" : le garde placé devant toutes les routes /api.
// =====================================================================
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config, enProduction } from "../config.js";
import type { Utilisateur } from "../db/index.js";
import { COOKIE_SESSION, creerSession, fermerSession, lireSession, utiliserLienWeb, VALIDITE_SESSION_MS } from "../services/sessions.js";
import { assurerAdmin } from "../services/users.js";

// Chaque requête authentifiée connaît son utilisateur (jamais choisi par le navigateur).
declare module "fastify" {
  interface FastifyRequest {
    utilisateur: Utilisateur;
    csrf: string;
  }
}

/**
 * À placer devant les routes protégées :
 *   - pas de session valide → 401
 *   - requête qui modifie quelque chose (POST/PATCH/DELETE) sans le bon jeton CSRF → 403
 * Le jeton CSRF empêche un autre site d'agir à ta place avec ton cookie.
 */
export async function exigerSession(req: FastifyRequest, reply: FastifyReply) {
  const session = await lireSession(req.cookies[COOKIE_SESSION]);
  if (!session) return reply.code(401).send({ erreur: "Non connecté. Envoie /web à Awé sur Telegram." });
  if (req.method !== "GET" && req.headers["x-csrf-token"] !== session.csrf) {
    return reply.code(403).send({ erreur: "Jeton de sécurité (CSRF) manquant ou invalide. Recharge la page." });
  }
  req.utilisateur = session.utilisateur;
  req.csrf = session.csrf;
}

function poserCookie(reply: FastifyReply, session: string) {
  reply.setCookie(COOKIE_SESSION, session, {
    path: "/",
    httpOnly: true, // illisible par le JavaScript de la page
    secure: enProduction, // HTTPS uniquement en production
    sameSite: "lax",
    maxAge: VALIDITE_SESSION_MS / 1000,
  });
}

export function routesAuth(app: FastifyInstance) {
  app.get("/api/info", async () => ({ demo: config.DEMO }));

  app.get<{ Querystring: { token?: string } }>("/auth/magic", async (req, reply) => {
    const session = req.query.token ? await utiliserLienWeb(req.query.token) : null;
    if (!session) return reply.redirect("/?lien=invalide");
    poserCookie(reply, session);
    return reply.redirect("/");
  });

  // Mode démo : un clic suffit pour entrer (il n'y a que des données d'exemple).
  app.get("/auth/demo", async (_req, reply) => {
    if (!config.DEMO) return reply.code(404).send({ erreur: "introuvable" });
    poserCookie(reply, await creerSession((await assurerAdmin()).id));
    return reply.redirect("/");
  });

  app.post("/auth/logout", { preHandler: exigerSession }, async (req, reply) => {
    await fermerSession(req.cookies[COOKIE_SESSION]!);
    reply.clearCookie(COOKIE_SESSION, { path: "/" });
    return { ok: true };
  });
}
