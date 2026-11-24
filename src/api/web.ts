// =====================================================================
// API REST de l'interface web. TOUTES les routes :
//   - exigent une session (exigerSession)
//   - utilisent req.utilisateur.id (jamais un id envoyé par le navigateur)
//   - vérifient les données reçues (zod)
// =====================================================================
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { handleUserMessage } from "../agent/awe.js";
import { budgetDepasse } from "../security/limits.js";
import { decider, demandesEnAttente, historiqueDemandes } from "../services/approbations.js";
import { ajouterCourses, cocherCourses, listerCourses, retirerCourses } from "../services/courses.js";
import { contenuDocument, documentDe, listerDocuments, nomTelechargement } from "../services/documents.js";
import { effacerDonnees } from "../services/effacement.js";
import { ecouter } from "../services/events.js";
import { compteGmail, gmailConfigure, messageDeconnexion } from "../services/gmail.js";
import { pageMessages } from "../services/messages.js";
import { fuseauValide } from "../services/temps.js";
import { modifierReglages } from "../services/users.js";
import { routesAdmin } from "./admin.js";
import { exigerSession } from "./auth.js";

/** Vérifie des données reçues ; en cas de problème, répond 400 et renvoie null. */
function verifier<T>(schema: z.ZodType<T>, donnees: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(donnees);
  if (r.success) return r.data;
  void reply.code(400).send({ erreur: r.error.issues[0]?.message ?? "données invalides" });
  return null;
}

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function routesWeb(app: FastifyInstance) {
  app.addHook("preHandler", exigerSession);
  routesAdmin(app); // /api/admin/... : en plus, réservé au rôle admin

  // --- Moi ---------------------------------------------------------------
  app.get("/api/me", async (req) => {
    const u = req.utilisateur;
    const gmail = await compteGmail(u.id);
    const budget = await budgetDepasse(u);
    return {
      id: u.id,
      prenom: u.prenom,
      role: u.role,
      voixActivee: u.voixActivee,
      fuseau: u.fuseau,
      csrf: req.csrf,
      telegram: Boolean(u.telegramId),
      gmail: { configure: gmailConfigure(), email: gmail?.email ?? null, connecteLe: gmail?.connectedAt ?? null },
      budget: { utilises: budget.utilises, limite: budget.limite, illimite: budget.illimite },
    };
  });

  // --- Conversation -------------------------------------------------------
  app.get<{ Querystring: { avant?: string } }>("/api/messages", async (req) => {
    const avant = Number(req.query.avant) || undefined;
    return pageMessages(req.utilisateur.id, 50, avant);
  });

  app.post(
    "/api/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, // 20 messages par minute
    async (req, reply) => {
      const corps = verifier(z.object({ texte: z.string().trim().min(1).max(4000) }), req.body, reply);
      if (!corps) return;
      return { reponse: await handleUserMessage(req.utilisateur.id, corps.texte, "web") };
    },
  );

  // --- Temps réel (SSE) : le navigateur reste connecté et reçoit les événements ---
  app.get("/api/events", (req, reply) => {
    reply.hijack(); // on gère la réponse nous-mêmes : elle reste ouverte
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const envoyer = (donnees: unknown) => reply.raw.write(`data: ${JSON.stringify(donnees)}\n\n`);
    envoyer({ type: "bonjour" });

    const arreter = ecouter(req.utilisateur.id, envoyer);
    const battement = setInterval(() => reply.raw.write(": ping\n\n"), 25_000); // garde la connexion ouverte
    req.raw.on("close", () => {
      arreter();
      clearInterval(battement);
    });
  });

  // --- Courses -------------------------------------------------------------
  app.get("/api/shopping", async (req) => listerCourses(req.utilisateur.id));

  app.post("/api/shopping", async (req, reply) => {
    const corps = verifier(
      z.object({ nom: z.string().trim().min(1).max(100), quantite: z.string().trim().max(50).nullish() }),
      req.body,
      reply,
    );
    if (!corps) return;
    const [article] = await ajouterCourses(req.utilisateur.id, [{ nom: corps.nom, quantite: corps.quantite ?? null }]);
    return article;
  });

  app.patch("/api/shopping/:id", async (req, reply) => {
    const p = verifier(idParam, req.params, reply);
    const corps = p && verifier(z.object({ fait: z.boolean() }), req.body, reply);
    if (!p || !corps) return;
    const [article] = await cocherCourses(req.utilisateur.id, [p.id], corps.fait);
    return article ?? reply.code(404).send({ erreur: "article introuvable" });
  });

  app.delete("/api/shopping/:id", async (req, reply) => {
    const p = verifier(idParam, req.params, reply);
    if (!p) return;
    const [article] = await retirerCourses(req.utilisateur.id, [p.id]);
    return article ? { ok: true } : reply.code(404).send({ erreur: "article introuvable" });
  });

  // --- Documents -------------------------------------------------------------
  app.get("/api/documents", async (req) => listerDocuments(req.utilisateur.id));

  app.get<{ Querystring: { telecharger?: string } }>("/api/documents/:id/file", async (req, reply) => {
    const p = verifier(idParam, req.params, reply);
    if (!p) return;
    const doc = await documentDe(req.utilisateur.id, p.id);
    const contenu = doc && (await contenuDocument(doc));
    if (!doc || !contenu) return reply.code(404).send({ erreur: "document introuvable" });
    const nom = nomTelechargement(doc.titre);
    const mode = req.query.telecharger ? "attachment" : "inline"; // inline = aperçu dans le navigateur
    return reply
      .type("application/pdf")
      .header("content-disposition", `${mode}; filename*=UTF-8''${encodeURIComponent(nom)}`)
      .send(contenu);
  });

  // --- Validations -------------------------------------------------------------
  app.get("/api/approvals", async (req) => ({
    enAttente: await demandesEnAttente(req.utilisateur.id),
    historique: await historiqueDemandes(req.utilisateur.id),
  }));

  app.post("/api/approvals/:id/approve", async (req, reply) => {
    const p = verifier(idParam, req.params, reply);
    if (!p) return;
    return { texte: await decider(req.utilisateur.id, p.id, "valider", "web") };
  });

  app.post("/api/approvals/:id/cancel", async (req, reply) => {
    const p = verifier(idParam, req.params, reply);
    if (!p) return;
    return { texte: await decider(req.utilisateur.id, p.id, "annuler", "web") };
  });

  // --- Gmail (la connexion passe par GET /api/gmail/connect, voir api/gmail.ts) ---
  app.post("/api/gmail/disconnect", async (req) => ({ texte: await messageDeconnexion(req.utilisateur.id) }));

  // --- Réglages et données -------------------------------------------------------
  app.patch("/api/settings", async (req, reply) => {
    const corps = verifier(
      z.object({
        prenom: z.string().trim().min(1).max(50).optional(),
        voixActivee: z.boolean().optional(),
        fuseau: z.string().refine(fuseauValide, "fuseau horaire inconnu").optional(),
      }),
      req.body,
      reply,
    );
    if (!corps) return;
    const u = await modifierReglages(req.utilisateur.id, corps);
    return { prenom: u.prenom, voixActivee: u.voixActivee, fuseau: u.fuseau };
  });

  app.delete("/api/me/data", async (req) => {
    await effacerDonnees(req.utilisateur.id);
    return { ok: true };
  });
}
