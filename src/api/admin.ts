// =====================================================================
// API de la page Admin (rôle admin uniquement, en plus de la session).
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { coutsParJour, tachesRecentes } from "../services/couts.js";
import { creerInvitation, listerUtilisateurs, retirerUtilisateur } from "../services/invitations.js";

export function routesAdmin(app: FastifyInstance) {
  // Garde : 403 pour tout le monde sauf l'admin.
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/api/admin/") && req.utilisateur?.role !== "admin") {
      return reply.code(403).send({ erreur: "Réservé à l'administrateur." });
    }
  });

  app.post("/api/admin/invitations", async (req, reply) => {
    const r = z.object({ role: z.enum(["membre", "invite"]) }).safeParse(req.body);
    if (!r.success) return reply.code(400).send({ erreur: "rôle invalide (membre ou invite)" });
    const inv = await creerInvitation(req.utilisateur.id, r.data.role);
    return { code: inv.code, role: inv.role, lien: inv.lien, expiresAt: inv.expiresAt };
  });

  app.get("/api/admin/users", async () =>
    (await listerUtilisateurs()).map((u) => ({ id: u.id, prenom: u.prenom, role: u.role, telegram: Boolean(u.telegramId), createdAt: u.createdAt })),
  );

  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ erreur: "n° invalide" });
    return { texte: await retirerUtilisateur(id) };
  });

  app.get("/api/admin/costs", async (req) => ({
    jours: await coutsParJour(req.utilisateur.fuseau, 14),
    limiteParJour: config.DAILY_TOKEN_LIMIT,
  }));

  app.get<{ Params: { userId: string } }>("/api/admin/logs/:userId", async (req, reply) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) return reply.code(400).send({ erreur: "n° invalide" });
    return tachesRecentes(userId, 20);
  });
}
