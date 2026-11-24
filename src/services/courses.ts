// =====================================================================
// Liste de courses. Utilisé par les outils de l'agent, le bot (/liste)
// et plus tard l'API web. Chaque requête est filtrée par userId.
// =====================================================================
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, shoppingItems } from "../db/index.js";
import { emettre } from "./events.js";

export type Article = { nom: string; quantite: string | null };

export async function listerCourses(userId: number) {
  return db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.userId, userId))
    .orderBy(asc(shoppingItems.fait), asc(shoppingItems.createdAt), asc(shoppingItems.id));
}

export async function ajouterCourses(userId: number, articles: Article[]) {
  const valeurs = articles
    .map((a) => ({ userId, nom: a.nom.trim(), quantite: a.quantite?.trim() || null }))
    .filter((a) => a.nom.length > 0);
  if (valeurs.length === 0) return [];
  const ajoutes = await db.insert(shoppingItems).values(valeurs).returning();
  emettre(userId, { type: "courses" });
  return ajoutes;
}

export async function retirerCourses(userId: number, ids: number[]) {
  if (ids.length === 0) return [];
  const retires = await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, ids)))
    .returning();
  if (retires.length) emettre(userId, { type: "courses" });
  return retires;
}

export async function cocherCourses(userId: number, ids: number[], fait: boolean) {
  if (ids.length === 0) return [];
  const modifies = await db
    .update(shoppingItems)
    .set({ fait })
    .where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, ids)))
    .returning();
  if (modifies.length) emettre(userId, { type: "courses" });
  return modifies;
}

/** La liste en texte lisible (pour Telegram et le terminal). */
export function listeEnTexte(articles: Awaited<ReturnType<typeof listerCourses>>) {
  if (articles.length === 0) return "Ta liste de courses est vide.";
  const lignes = articles.map(
    (a) => `${a.fait ? "[x]" : "[ ]"} ${a.nom}${a.quantite ? ` (${a.quantite})` : ""}`,
  );
  return `Ta liste de courses :\n${lignes.join("\n")}`;
}
