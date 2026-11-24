// =====================================================================
// Coûts et journal, pour l'admin (page Admin, /couts, /logs).
// Les calculs se font en JavaScript sur les lignes récentes : simple, et
// identique en SQLite et en Postgres.
// =====================================================================
import { desc, eq, gte } from "drizzle-orm";
import { agentLogs, db, users } from "../db/index.js";

/** Tokens et coût estimé, par jour et par utilisateur, sur les N derniers jours. */
export async function coutsParJour(fuseau: string, jours = 7) {
  const depuis = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
  const lignes = await db
    .select({ userId: agentLogs.userId, prenom: users.prenom, createdAt: agentLogs.createdAt, tokensIn: agentLogs.tokensIn, tokensOut: agentLogs.tokensOut, cout: agentLogs.coutEstime })
    .from(agentLogs)
    .innerJoin(users, eq(users.id, agentLogs.userId))
    .where(gte(agentLogs.createdAt, depuis));

  const jourDe = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau }).format(d); // AAAA-MM-JJ
  const totaux = new Map<string, { jour: string; userId: number; prenom: string; tokens: number; cout: number }>();
  for (const l of lignes) {
    const jour = jourDe(l.createdAt);
    const cle = `${jour}:${l.userId}`;
    const t = totaux.get(cle) ?? { jour, userId: l.userId, prenom: l.prenom, tokens: 0, cout: 0 };
    t.tokens += l.tokensIn + l.tokensOut;
    t.cout += l.cout;
    totaux.set(cle, t);
  }
  return [...totaux.values()].sort((a, b) => b.jour.localeCompare(a.jour) || a.userId - b.userId);
}

/** Les dernières tâches d'un utilisateur, étape par étape (outil, paramètres, durée, tokens, erreur). */
export async function tachesRecentes(userId: number, nbTaches = 15) {
  const lignes = await db
    .select()
    .from(agentLogs)
    .where(eq(agentLogs.userId, userId))
    .orderBy(desc(agentLogs.createdAt), desc(agentLogs.id))
    .limit(400);

  const taches = new Map<string, typeof lignes>();
  for (const l of lignes) {
    if (!taches.has(l.tacheId)) {
      if (taches.size >= nbTaches) continue;
      taches.set(l.tacheId, []);
    }
    taches.get(l.tacheId)!.push(l);
  }
  return [...taches.entries()].map(([tacheId, etapes]) => {
    const ordre = [...etapes].sort((a, b) => a.etape - b.etape || a.id - b.id);
    return {
      tacheId,
      debut: ordre[0].createdAt,
      tokens: ordre.reduce((s, e) => s + e.tokensIn + e.tokensOut, 0),
      cout: ordre.reduce((s, e) => s + e.coutEstime, 0),
      erreur: ordre.some((e) => e.erreur && !e.erreur.startsWith("REFUSÉ")),
      etapes: ordre.map((e) => ({
        etape: e.etape,
        outil: e.outil,
        params: e.paramsJson,
        resultat: e.resultatResume,
        dureeMs: e.dureeMs,
        tokensIn: e.tokensIn,
        tokensOut: e.tokensOut,
        erreur: e.erreur,
        createdAt: e.createdAt,
      })),
    };
  });
}
