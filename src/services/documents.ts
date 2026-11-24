// Documents PDF : liste et accès, toujours filtrés par userId.
import { and, desc, eq } from "drizzle-orm";
import { db, documents } from "../db/index.js";

export async function listerDocuments(userId: number) {
  return db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.createdAt), desc(documents.id));
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
