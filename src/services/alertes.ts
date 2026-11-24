// =====================================================================
// Alertes envoyées à l'admin (sur Telegram, et dans l'interface web) :
//   - une même erreur se répète 3 fois en 15 minutes
//   - un utilisateur dépasse 80 % de son budget de tokens du jour
//     (une seule alerte par jour et par utilisateur)
// =====================================================================
import { asc, eq } from "drizzle-orm";
import { config } from "../config.js";
import { db, users } from "../db/index.js";
import { log } from "../logger.js";
import { emettre } from "./events.js";

const FENETRE_ERREURS_MS = 15 * 60 * 1000;
const erreursRecentes = new Map<string, number[]>(); // texte de l'erreur → dates
const budgetsSignales = new Set<string>(); // "userId:date" déjà alertés

/** Prévient l'admin. */
export async function alerterAdmin(texte: string) {
  log.warn({ alerte: texte }, "Alerte admin");
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).limit(1);
  if (admin) emettre(admin.id, { type: "notification", texte: `Alerte Awé : ${texte}` });
}

/** À appeler à chaque erreur. Au 3e cas identique en 15 minutes, l'admin est prévenu. */
export async function signalerErreur(erreur: string, maintenant = Date.now()) {
  const cle = erreur.slice(0, 120);
  const dates = (erreursRecentes.get(cle) ?? []).filter((d) => maintenant - d < FENETRE_ERREURS_MS);
  dates.push(maintenant);
  if (dates.length >= 3) {
    erreursRecentes.delete(cle);
    await alerterAdmin(`la même erreur s'est produite 3 fois en 15 minutes : « ${cle} ». Regarde les logs (page Admin).`);
  } else {
    erreursRecentes.set(cle, dates);
  }
}

/** À appeler après chaque appel au modèle : alerte au-delà de 80 % du budget du jour. */
export async function verifierBudget(utilisateur: { id: number; prenom: string; role: string }, utilises: number, aujourdhui: string) {
  const limite = config.DAILY_TOKEN_LIMIT;
  if (utilises < limite * 0.8) return;
  const cle = `${utilisateur.id}:${aujourdhui}`;
  if (budgetsSignales.has(cle)) return;
  budgetsSignales.add(cle);
  const pourcent = Math.round((utilises / limite) * 100);
  await alerterAdmin(
    utilisateur.role === "admin"
      ? `tu as utilisé ${pourcent} % de ton budget habituel du jour (${utilises} tokens sur ${limite}). Pas de blocage pour toi : c'est juste pour info.`
      : `${utilisateur.prenom} a utilisé ${pourcent} % de son budget du jour (${utilises} tokens sur ${limite}).`,
  );
}
