// =====================================================================
// Rappels : création, consultation, et une tâche planifiée qui envoie
// chaque minute les rappels arrivés à échéance.
// =====================================================================
import { and, asc, eq, gt, lte } from "drizzle-orm";
import { config } from "../config.js";
import { db, reminders, users } from "../db/index.js";
import { log } from "../logger.js";
import { expirerDemandes } from "./approbations.js";
import { emettre } from "./events.js";
import { enregistrerMessage } from "./messages.js";

export async function creerRappel(userId: number, texte: string, dueAt: Date) {
  const [rappel] = await db.insert(reminders).values({ userId, texte, dueAt }).returning();
  return rappel;
}

/** Les rappels à venir (pas encore envoyés), du plus proche au plus lointain. */
export async function rappelsAVenir(userId: number) {
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.envoye, false), gt(reminders.dueAt, new Date())))
    .orderBy(asc(reminders.dueAt));
}

/**
 * Envoie tous les rappels arrivés à échéance.
 * Chaque rappel est d'abord marqué "envoyé" : si deux serveurs tournent en même temps,
 * un seul réussira la mise à jour, donc pas de doublon.
 */
export async function envoyerRappelsEchus(maintenant = new Date()) {
  const echus = await db
    .select({ rappel: reminders, telegramId: users.telegramId })
    .from(reminders)
    .innerJoin(users, eq(users.id, reminders.userId))
    .where(and(eq(reminders.envoye, false), lte(reminders.dueAt, maintenant)));

  let envoyes = 0;
  for (const { rappel, telegramId } of echus) {
    const [pris] = await db
      .update(reminders)
      .set({ envoye: true })
      .where(and(eq(reminders.id, rappel.id), eq(reminders.envoye, false)))
      .returning();
    if (!pris) continue; // déjà pris en charge ailleurs

    // Le message apparaît dans la conversation ; le bot (s'il est actif) l'envoie sur Telegram.
    const source = telegramId && config.TELEGRAM_BOT_TOKEN ? "telegram" : "web";
    await enregistrerMessage(rappel.userId, source, "assistant", `Rappel : ${rappel.texte}`);
    emettre(rappel.userId, {
      type: "rappel",
      rappel: { id: rappel.id, texte: rappel.texte, dueAt: rappel.dueAt },
    });
    envoyes++;
  }
  return envoyes;
}

/**
 * Tâche de chaque minute : envoie les rappels échus, et fait expirer les
 * demandes de validation trop vieilles. Renvoie une fonction d'arrêt.
 */
export function demarrerRappels() {
  const verifier = async () => {
    await envoyerRappelsEchus().catch((err) => log.error({ err }, "Erreur pendant l'envoi des rappels"));
    await expirerDemandes().catch((err) => log.error({ err }, "Erreur pendant l'expiration des demandes"));
  };
  void verifier(); // une première fois tout de suite (rappels manqués pendant un arrêt)
  const minuteur = setInterval(verifier, 60_000);
  return () => clearInterval(minuteur);
}
