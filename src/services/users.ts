// =====================================================================
// Utilisateurs : création de l'admin, identification des comptes Telegram.
// =====================================================================
import { asc, eq } from "drizzle-orm";
import { config, idsAdminTelegram } from "../config.js";
import { db, users, type Utilisateur } from "../db/index.js";
import { log } from "../logger.js";

/** Cherche un utilisateur par son identifiant Awé. */
export async function trouverParId(id: number): Promise<Utilisateur | null> {
  const [utilisateur] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return utilisateur ?? null;
}

/** Cherche un utilisateur par son ID Telegram. Renvoie null s'il n'existe pas. */
export async function trouverParTelegramId(telegramId: string): Promise<Utilisateur | null> {
  const [utilisateur] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return utilisateur ?? null;
}

/**
 * Garantit qu'un compte admin existe. Appelé au démarrage du serveur.
 * L'admin n'a jamais besoin d'invitation.
 *
 * - Il n'y a qu'UN compte admin : le plus ancien. On ne le recrée jamais.
 * - Avec ADMIN_TELEGRAM_ID : on relie cet admin au PREMIER ID de la liste
 *   (même s'il était relié à un autre ID avant, ex. après un changement dans .env).
 *   Les autres ID de la liste sont reconnus par identifierUtilisateur.
 */
export async function assurerAdmin(): Promise<Utilisateur> {
  const telegramId = idsAdminTelegram()[0] ?? null;

  // 1. Le compte Telegram de l'admin est déjà connu : rien à faire.
  if (telegramId) {
    const existant = await trouverParTelegramId(telegramId);
    if (existant) return existant;
  }

  // 2. Un admin existe déjà (le plus ancien) : on le garde, et on le relie au bon Telegram.
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).limit(1);
  if (admin) {
    if (!telegramId || admin.telegramId === telegramId) return admin;
    const [relie] = await db.update(users).set({ telegramId }).where(eq(users.id, admin.id)).returning();
    log.info({ telegramId }, "Compte admin relié à Telegram");
    return relie;
  }

  // 3. Aucun admin : on le crée.
  const [cree] = await db
    .insert(users)
    .values({ telegramId, prenom: "Admin", role: "admin", fuseau: config.FUSEAU_DEFAUT })
    .returning();
  log.info({ telegramId }, "Compte admin créé");
  return cree;
}

/**
 * Identifie la personne qui écrit au bot.
 * Renvoie l'utilisateur s'il est inscrit, sinon null (inscription par invitation en phase 6).
 * Tous les ID de ADMIN_TELEGRAM_ID ouvrent le compte admin.
 */
export async function identifierUtilisateur(telegramId: string): Promise<Utilisateur | null> {
  if (idsAdminTelegram().includes(telegramId)) return assurerAdmin();
  return trouverParTelegramId(telegramId);
}

/** Modifie les réglages (page Réglages du web). Seuls les champs fournis changent. */
export async function modifierReglages(userId: number, reglages: { prenom?: string; voixActivee?: boolean; fuseau?: string }) {
  const [maj] = await db.update(users).set(reglages).where(eq(users.id, userId)).returning();
  return maj;
}

/** Active ou coupe les réponses vocales d'Awé. */
export async function changerVoix(userId: number, active: boolean) {
  await db.update(users).set({ voixActivee: active }).where(eq(users.id, userId));
}

/** À quels comptes Telegram envoyer les notifications de cet utilisateur (rappels, alertes...) ? */
export function destinatairesTelegram(utilisateur: Utilisateur): string[] {
  const ids = utilisateur.role === "admin" ? idsAdminTelegram() : [];
  if (utilisateur.telegramId && !ids.includes(utilisateur.telegramId)) ids.push(utilisateur.telegramId);
  return ids;
}
