// =====================================================================
// Historique des messages (Telegram et web), toujours filtré par userId.
// =====================================================================
import { and, desc, eq, lt } from "drizzle-orm";
import { db, messages } from "../db/index.js";
import { emettre } from "./events.js";

export type Source = "telegram" | "web";

/** Enregistre un message de l'utilisateur ou de Awé, et prévient l'interface web. */
export async function enregistrerMessage(
  userId: number,
  source: Source,
  role: "user" | "assistant",
  texte: string,
  horsMemoire = false,
) {
  const [message] = await db.insert(messages).values({ userId, source, role, texte, horsMemoire }).returning();
  emettre(userId, { type: "message", message });
  return message;
}

/**
 * Retire un message de la mémoire d'Awé (il reste visible dans l'historique).
 * Sert quand une panne a empêché de répondre : sinon Awé traiterait la demande
 * plus tard, hors contexte, en s'excusant d'une erreur qui n'était pas la sienne.
 */
export async function oublierMessage(userId: number, messageId: number) {
  await db
    .update(messages)
    .set({ horsMemoire: true })
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId)));
}

/** Les N derniers messages d'un utilisateur, du plus ancien au plus récent. */
export async function derniersMessages(userId: number, limite = 20) {
  const lignes = await db
    .select()
    .from(messages)
    .where(eq(messages.userId, userId)) // isolation : jamais les messages d'un autre
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limite);
  return lignes.reverse();
}

/** Une page de l'historique (pour le web) : les "limite" messages avant le message n°"avant". */
export async function pageMessages(userId: number, limite = 50, avant?: number) {
  const lignes = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), avant ? lt(messages.id, avant) : undefined))
    .orderBy(desc(messages.id))
    .limit(limite);
  return lignes.reverse();
}

/** La mémoire d'Awé : comme derniersMessages, sans les échanges ratés. */
export async function memoireConversation(userId: number, limite = 20) {
  const lignes = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.horsMemoire, false)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limite);
  return lignes.reverse();
}
