// =====================================================================
// Connexion à l'interface web, SANS mot de passe :
//   1. /web sur Telegram (ou pnpm lien-web) crée un LIEN MAGIQUE :
//      à usage unique, valable 10 minutes
//   2. ouvrir le lien crée une SESSION (cookie httpOnly, 30 jours)
//
// Les jetons sont stockés en base sous forme d'EMPREINTE (SHA-256) :
// quelqu'un qui lirait la base ne pourrait pas s'en servir.
// =====================================================================
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { config } from "../config.js";
import { db, loginLinks, webSessions } from "../db/index.js";
import { trouverParId } from "./users.js";

const VALIDITE_LIEN_MS = 10 * 60 * 1000;
export const VALIDITE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE_SESSION = "awe_session";

const jetonAleatoire = () => randomBytes(32).toString("base64url");
const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

/** Crée un lien de connexion à usage unique. */
export async function creerLienWeb(userId: number) {
  const jeton = jetonAleatoire();
  await db.insert(loginLinks).values({ token: empreinte(jeton), userId, expiresAt: new Date(Date.now() + VALIDITE_LIEN_MS) });
  return `${config.PUBLIC_URL}/auth/magic?token=${jeton}`;
}

/** Utilise un lien magique : renvoie une nouvelle session, ou null si le lien est invalide, expiré ou déjà utilisé. */
export async function utiliserLienWeb(jeton: string) {
  // "Prendre" le lien en une seule opération : deux clics simultanés → un seul réussit.
  const [lien] = await db
    .update(loginLinks)
    .set({ used: true })
    .where(and(eq(loginLinks.token, empreinte(jeton)), eq(loginLinks.used, false), gt(loginLinks.expiresAt, new Date())))
    .returning();
  if (!lien) return null;
  return creerSession(lien.userId);
}

/** Ouvre une session web pour cet utilisateur. Renvoie le jeton à mettre dans le cookie. */
export async function creerSession(userId: number) {
  const session = jetonAleatoire();
  const csrf = jetonAleatoire();
  await db.insert(webSessions).values({
    token: empreinte(session),
    userId,
    csrfToken: csrf,
    expiresAt: new Date(Date.now() + VALIDITE_SESSION_MS),
  });
  return session;
}

/** Retrouve l'utilisateur d'une session (cookie). Null si absente ou expirée. */
export async function lireSession(session: string | undefined) {
  if (!session) return null;
  const [ligne] = await db
    .select()
    .from(webSessions)
    .where(and(eq(webSessions.token, empreinte(session)), gt(webSessions.expiresAt, new Date())))
    .limit(1);
  if (!ligne) return null;
  const utilisateur = await trouverParId(ligne.userId);
  return utilisateur ? { utilisateur, csrf: ligne.csrfToken } : null;
}

export async function fermerSession(session: string) {
  await db.delete(webSessions).where(eq(webSessions.token, empreinte(session)));
}
