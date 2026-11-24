// Documents PDF : liste et accès, toujours filtrés par userId.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import { db, documents } from "../db/index.js";

/** La liste, SANS le contenu des PDF (inutile de charger tous les fichiers pour afficher des titres). */
export async function listerDocuments(userId: number) {
  return db
    .select({ id: documents.id, titre: documents.titre, createdAt: documents.createdAt })
    .from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.createdAt), desc(documents.id));
}

/** Un document de CET utilisateur (null s'il n'existe pas ou appartient à quelqu'un d'autre). */
export async function documentDe(userId: number, id: number) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .limit(1);
  return doc ?? null;
}

/**
 * Les octets du PDF. Les nouveaux PDF sont dans la base ; les anciens (créés avant
 * cette version) étaient sur le disque : on les lit encore s'ils y sont.
 */
export async function contenuDocument(doc: { chemin: string; contenu: Buffer | null }): Promise<Buffer | null> {
  if (doc.contenu) return Buffer.from(doc.contenu);
  return existsSync(doc.chemin) ? readFile(doc.chemin) : null;
}

/** Nom de fichier lisible pour le téléchargement : "Liste de courses.pdf". */
export function nomTelechargement(titre: string) {
  return `${titre.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "document"}.pdf`;
}
