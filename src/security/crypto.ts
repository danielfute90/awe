// =====================================================================
// Chiffrement des secrets stockés en base (jeton d'accès Gmail).
//
// AES-256-GCM : chiffre ET détecte toute modification du texte chiffré.
// La clé (ENCRYPTION_KEY, 32 octets) reste dans le .env, jamais en base :
// quelqu'un qui volerait la base seule ne pourrait rien lire.
//
// Format stocké : "iv.tag.donnees" (en base64url).
//   - iv  : 12 octets aléatoires, différents à chaque chiffrement
//   - tag : l'empreinte d'authenticité calculée par GCM
// =====================================================================
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

function cle(): Buffer {
  if (!config.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY manque dans le .env (64 caractères hexadécimaux)");
  }
  return Buffer.from(config.ENCRYPTION_KEY, "hex");
}

export function chiffrer(texte: string): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle(), iv);
  const donnees = Buffer.concat([chiffreur.update(texte, "utf8"), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return [iv, tag, donnees].map((b) => b.toString("base64url")).join(".");
}

/** Déchiffre. Lève une erreur si la donnée a été modifiée ou si la clé a changé. */
export function dechiffrer(stocke: string): string {
  const [iv, tag, donnees] = stocke.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !donnees) throw new Error("donnée chiffrée illisible");
  const dechiffreur = createDecipheriv("aes-256-gcm", cle(), iv);
  dechiffreur.setAuthTag(tag);
  return Buffer.concat([dechiffreur.update(donnees), dechiffreur.final()]).toString("utf8");
}

// ---------------------------------------------------------------------
// Jetons signés : un petit message + une signature (HMAC) que seul le
// serveur sait produire. Sert au lien "connecter Gmail" : personne ne peut
// fabriquer un lien qui relierait SON Gmail au compte de quelqu'un d'autre.
// Format : "userId.expiration.signature".
// ---------------------------------------------------------------------
function signature(message: string) {
  // Clé dérivée, différente de celle du chiffrement.
  return createHmac("sha256", cle()).update(`awe-signature:${message}`).digest("base64url");
}

export function signer(userId: number, dureeMs: number, maintenant = Date.now()): string {
  const message = `${userId}.${maintenant + dureeMs}`;
  return `${message}.${signature(message)}`;
}

/** Renvoie l'userId si le jeton est authentique et pas expiré, sinon null. */
export function verifierSignature(jeton: string, maintenant = Date.now()): number | null {
  const [userId, expiration, sig] = jeton.split(".");
  if (!userId || !expiration || !sig) return null;
  const attendue = Buffer.from(signature(`${userId}.${expiration}`));
  const recue = Buffer.from(sig);
  // Comparaison à temps constant : ne révèle pas combien de caractères sont justes.
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  if (Number(expiration) < maintenant) return null;
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}
