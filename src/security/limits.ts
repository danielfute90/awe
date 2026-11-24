// =====================================================================
// Limites de l'agent : nombre de tours par tâche et budget de tokens par jour.
// L'admin n'a pas de limite de tokens (il paie lui-même son crédit) :
// il reçoit seulement une alerte quand il approche de DAILY_TOKEN_LIMIT.
// =====================================================================
import { and, eq, gte, sql } from "drizzle-orm";
import { config } from "../config.js";
import { agentLogs, db, type Role } from "../db/index.js";
import { debutDeJournee } from "../services/temps.js";

/** Nombre maximum de tours (appels au modèle) pour une seule demande. */
export const MAX_TOURS = 15;

/** Tokens consommés aujourd'hui (depuis minuit, heure locale de l'utilisateur). */
export async function tokensUtilisesAujourdhui(userId: number, fuseau: string) {
  const [{ total }] = await db
    .select({
      total: sql<number>`coalesce(sum(${agentLogs.tokensIn} + ${agentLogs.tokensOut}), 0)`.mapWith(Number),
    })
    .from(agentLogs)
    .where(and(eq(agentLogs.userId, userId), gte(agentLogs.createdAt, debutDeJournee(fuseau))));
  return total;
}

/** Le budget du jour est-il épuisé ? (jamais pour l'admin) */
export async function budgetDepasse(utilisateur: { id: number; fuseau: string; role: Role }) {
  const utilises = await tokensUtilisesAujourdhui(utilisateur.id, utilisateur.fuseau);
  const illimite = utilisateur.role === "admin";
  return {
    depasse: !illimite && utilises >= config.DAILY_TOKEN_LIMIT,
    utilises,
    limite: config.DAILY_TOKEN_LIMIT,
    illimite,
  };
}
