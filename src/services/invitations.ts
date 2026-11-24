// =====================================================================
// Invitations et gestion des utilisateurs (réservé à l'admin).
//   - /inviter (ou page Admin) crée un code valable 7 jours, à usage unique
//   - la personne ouvre le lien t.me/<bot>?start=<code> → Telegram envoie
//     "/start <code>" → son compte est créé avec le rôle prévu
// =====================================================================
import { randomInt } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, invitations, users, type Role } from "../db/index.js";

const VALIDITE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I : pas de confusion

let nomDuBot: string | null = null;
/** Appelé au démarrage du bot : sert à fabriquer les liens t.me. */
export const definirNomDuBot = (nom: string) => (nomDuBot = nom);

export async function creerInvitation(createdBy: number, role: Exclude<Role, "admin">) {
  const code = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const [invitation] = await db
    .insert(invitations)
    .values({ code, role, createdBy, expiresAt: new Date(Date.now() + VALIDITE_INVITATION_MS) })
    .returning();
  return { ...invitation, lien: nomDuBot ? `https://t.me/${nomDuBot}?start=${code}` : null };
}

/**
 * Utilise un code : crée le compte de la personne. Renvoie l'utilisateur créé,
 * ou null si le code est faux, expiré ou déjà utilisé.
 */
export async function utiliserInvitation(code: string, telegramId: string, prenom: string) {
  // On "prend" le code en une seule opération : deux personnes avec le même code → une seule réussit.
  const [prise] = await db
    .update(invitations)
    .set({ usedAt: new Date() })
    .where(and(eq(invitations.code, code.trim().toUpperCase()), isNull(invitations.usedAt), gt(invitations.expiresAt, new Date())))
    .returning();
  if (!prise) return null;

  const [utilisateur] = await db
    .insert(users)
    .values({ telegramId, prenom: prenom.slice(0, 50) || "Ami", role: prise.role })
    .returning();
  await db.update(invitations).set({ usedBy: utilisateur.id }).where(eq(invitations.code, prise.code));
  return utilisateur;
}

export async function listerUtilisateurs() {
  return db.select().from(users).orderBy(asc(users.id));
}

/** Retire un utilisateur et TOUTES ses données. Impossible de retirer un admin. */
export async function retirerUtilisateur(id: number) {
  const [cible] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!cible) return "Utilisateur introuvable.";
  if (cible.role === "admin") return "Impossible de retirer un administrateur.";
  await db.delete(users).where(eq(users.id, id)); // les données suivent (suppression en cascade)
  return `${cible.prenom} (n°${id}) a été retiré, avec toutes ses données.`;
}
