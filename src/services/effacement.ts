// =====================================================================
// « Effacer mes données » : supprime tout ce qu'Awé sait de l'utilisateur
// (conversation, courses, rappels, PDF, validations, journal, accès Gmail).
// Le compte lui-même et la session web en cours sont gardés.
// =====================================================================
import { rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { agentLogs, approvals, db, documents, loginLinks, messages, reminders, shoppingItems } from "../db/index.js";
import { emettre } from "./events.js";
import { deconnecterGmail } from "./gmail.js";

export async function effacerDonnees(userId: number) {
  await deconnecterGmail(userId).catch(() => {}); // prévient Google si possible
  for (const table of [messages, shoppingItems, reminders, documents, approvals, agentLogs, loginLinks]) {
    await db.delete(table).where(eq(table.userId, userId));
  }
  // Les fichiers PDF (userId est un nombre : impossible de sortir de storage/).
  await rm(path.join(config.STORAGE_DIR, String(userId)), { recursive: true, force: true });
  emettre(userId, { type: "courses" });
}
