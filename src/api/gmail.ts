// =====================================================================
// Routes Gmail :
//   GET /api/gmail/connect?etat=...  → redirige vers la page de Google
//   GET /api/gmail/callback          → Google revient ici après ton accord
// Le lien vient de /connecter_gmail (Telegram ou pnpm chat). Il est signé et
// valable 10 minutes : personne ne peut relier son Gmail à ton compte.
// (La déconnexion depuis le web : POST /api/gmail/disconnect, dans api/web.ts.)
// =====================================================================
import type { FastifyInstance, FastifyReply } from "fastify";
import { config } from "../config.js";
import { log } from "../logger.js";
import { ErreurGmail, lienConnexion, terminerConnexion, urlGoogle } from "../services/gmail.js";
import { COOKIE_SESSION, lireSession } from "../services/sessions.js";

/** Une petite page HTML simple, aux couleurs d'Awé. */
function page(reply: FastifyReply, statut: number, titre: string, texte: string) {
  const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return reply
    .code(statut)
    .type("text/html; charset=utf-8")
    .send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Awé</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F1F1EC;font-family:system-ui,sans-serif;color:#141414">
<main style="background:#FBFBF7;border-radius:28px;padding:32px;max-width:420px;margin:16px">
<h1 style="margin:0 0 12px;font-size:24px">${echapper(titre)}</h1>
<p style="margin:0;color:#4A4A45;line-height:1.5">${echapper(texte)}</p>
</main></body></html>`);
}

export function routesGmail(app: FastifyInstance) {
  app.get<{ Querystring: { etat?: string } }>("/api/gmail/connect", async (req, reply) => {
    try {
      // Deux façons d'arriver ici : le lien signé de /connecter_gmail (?etat=...),
      // ou le bouton "Connecter" de la page web (la session dit qui tu es).
      let etat = req.query.etat;
      if (!etat) {
        const session = await lireSession(req.cookies[COOKIE_SESSION]);
        if (session) etat = new URL(lienConnexion(session.utilisateur.id)).searchParams.get("etat") ?? undefined;
      }
      const url = etat ? urlGoogle(etat) : null;
      if (!url) return page(reply, 400, "Lien expiré", "Ce lien n'est plus valable. Redemande-en un avec /connecter_gmail.");
      return reply.redirect(url);
    } catch (err) {
      if (err instanceof ErreurGmail) return page(reply, 500, "Gmail non configuré", err.message);
      throw err;
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/api/gmail/callback", async (req, reply) => {
    const { code, state, error } = req.query;
    if (error || !code || !state) {
      return page(reply, 400, "Connexion annulée", "Gmail n'a pas été connecté. Tu peux réessayer avec /connecter_gmail.");
    }
    try {
      const email = await terminerConnexion(code, state);
      return page(reply, 200, "Gmail connecté", `C'est bon, Awé peut lire les emails de ${email}. Tu peux fermer cette page ou revenir sur ${config.PUBLIC_URL}.`);
    } catch (err) {
      if (err instanceof ErreurGmail) return page(reply, 400, "Connexion impossible", err.message);
      log.error({ err }, "Échec de la connexion Gmail");
      return page(reply, 500, "Connexion impossible", "Google a refusé la connexion. Réessaie avec /connecter_gmail.");
    }
  });
}
