// =====================================================================
// Validations humaines (approvals).
//
// Une action "sensible" (envoyer un email...) n'est JAMAIS exécutée par
// l'agent. Il crée seulement une DEMANDE :
//   1. les paramètres exacts sont enregistrés, avec leur empreinte SHA-256
//   2. l'utilisateur voit tout (destinataire, sujet, texte) et clique :
//      Valider / Modifier / Annuler  (Telegram, pnpm chat, et le web en phase 5)
//   3. à la validation, on vérifie : bonne personne, pas expirée (10 min),
//      pas déjà traitée, empreinte intacte → alors seulement on exécute
//      EXACTEMENT ce qui a été montré.
// =====================================================================
import { createHash } from "node:crypto";
import { and, desc, eq, gt, lte, ne } from "drizzle-orm";
import { approvals, db } from "../db/index.js";
import { log } from "../logger.js";
import { emettre, type DemandeAffichee } from "./events.js";
import { envoyerEmail, ErreurGmail, type EmailAEnvoyer } from "./gmail.js";
import { journaliser } from "./journal.js";
import { enregistrerMessage, type Source } from "./messages.js";

export const VALIDITE_DEMANDE_MS = 10 * 60 * 1000;

/** Paramètres d'une demande d'envoi d'email (+ l'avertissement calculé à la création). */
export type ParamsEnvoi = EmailAEnvoyer & { nouveauDestinataire: boolean };

export const empreinte = (paramsJson: string) => createHash("sha256").update(paramsJson).digest("hex");

/** Ce qu'on affiche pour une demande. */
function affichage(ligne: typeof approvals.$inferSelect): DemandeAffichee {
  const p = JSON.parse(ligne.paramsJson) as ParamsEnvoi;
  return {
    id: ligne.id,
    outil: ligne.outil,
    apercu: `À : ${p.a}\nSujet : ${p.sujet}\n\n${p.corps}`,
    avertissement: p.nouveauDestinataire ? `Attention : tu n'as jamais écrit à ${p.a}. Vérifie bien l'adresse.` : null,
    expiresAt: ligne.expiresAt,
  };
}

/** Crée une demande de validation et prévient l'utilisateur. */
export async function creerDemande(userId: number, outil: string, params: ParamsEnvoi) {
  const paramsJson = JSON.stringify(params);
  const [ligne] = await db
    .insert(approvals)
    .values({
      userId,
      outil,
      paramsJson,
      paramsHash: empreinte(paramsJson),
      expiresAt: new Date(Date.now() + VALIDITE_DEMANDE_MS),
    })
    .returning();
  emettre(userId, { type: "etat", etat: "attend_validation" });
  emettre(userId, { type: "approbation", approbation: affichage(ligne) });
  return ligne;
}

export type Decision = "valider" | "modifier" | "annuler";

/**
 * Applique la décision de l'utilisateur. Renvoie le message à lui afficher.
 * Le message est aussi ajouté à la conversation : Awé sait ce qui s'est passé.
 */
export async function decider(userId: number, id: number, decision: Decision, source: Source): Promise<string> {
  const texte = await appliquer(userId, id, decision);
  await enregistrerMessage(userId, source, "assistant", texte);

  // La carte est mise à jour partout (Telegram, web) : plus de boutons, le résultat à la place.
  const [ligne] = await db.select().from(approvals).where(and(eq(approvals.id, id), eq(approvals.userId, userId))).limit(1);
  if (ligne) emettre(userId, { type: "approbation_maj", id, statut: ligne.statut, texte });
  emettre(userId, { type: "etat", etat: "dispo" });
  return texte;
}

async function appliquer(userId: number, id: number, decision: Decision): Promise<string> {
  const maintenant = new Date();
  // On "prend" la demande en une seule opération : seulement si elle est à cet utilisateur,
  // encore en attente et pas expirée. Deux clics simultanés : un seul réussit.
  const [prise] = await db
    .update(approvals)
    .set({ statut: decision === "valider" ? "validee" : "annulee" })
    .where(
      and(
        eq(approvals.id, id),
        eq(approvals.userId, userId),
        eq(approvals.statut, "en_attente"),
        gt(approvals.expiresAt, maintenant),
      ),
    )
    .returning();

  if (!prise) return pourquoiImpossible(userId, id);

  if (decision === "annuler") return "D'accord, rien n'a été envoyé.";
  if (decision === "modifier") return "D'accord, rien n'a été envoyé. Dis-moi ce que tu veux changer, et je te prépare une nouvelle version.";

  // Valider : on vérifie que les paramètres n'ont pas bougé depuis qu'ils t'ont été montrés.
  if (empreinte(prise.paramsJson) !== prise.paramsHash) {
    await db.update(approvals).set({ statut: "annulee", resultat: "empreinte invalide" }).where(eq(approvals.id, id));
    log.error({ id }, "Empreinte de demande invalide : envoi bloqué");
    return "Cette demande a été modifiée après sa création : par sécurité, rien n'a été envoyé.";
  }

  const debut = Date.now();
  const params = JSON.parse(prise.paramsJson) as ParamsEnvoi;
  try {
    const gmailId = await executer(userId, prise.outil, params);
    await db.update(approvals).set({ resultat: `envoyé (gmail ${gmailId})` }).where(eq(approvals.id, id));
    await journaliser({ userId, tacheId: `validation-${id}`, etape: 1, outil: prise.outil, params, resultatResume: `envoyé, gmail ${gmailId}`, dureeMs: Date.now() - debut });
    return `C'est envoyé à ${params.a} (sujet : « ${params.sujet} »). Preuve : message Gmail n°${gmailId}.`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(approvals).set({ resultat: `échec : ${message}` }).where(eq(approvals.id, id));
    await journaliser({ userId, tacheId: `validation-${id}`, etape: 1, outil: prise.outil, params, erreur: message, dureeMs: Date.now() - debut });
    log.error({ err, id }, "Échec de l'envoi validé");
    return err instanceof ErreurGmail ? `Rien n'a été envoyé : ${message}` : "L'envoi a échoué, rien n'est parti. Réessaie dans un instant.";
  }
}

/** Exécute l'action validée. Seules les actions listées ici peuvent être exécutées. */
async function executer(userId: number, outil: string, params: ParamsEnvoi) {
  switch (outil) {
    case "envoyer_email":
    case "envoyer_liste_par_email":
      return envoyerEmail(userId, { a: params.a, sujet: params.sujet, corps: params.corps });
    default:
      throw new Error(`action "${outil}" inconnue`);
  }
}

/** Explique pourquoi une demande ne peut plus être traitée. */
async function pourquoiImpossible(userId: number, id: number) {
  const [ligne] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, id), eq(approvals.userId, userId)))
    .limit(1);
  if (!ligne) return "Je ne trouve pas cette demande.";
  if (ligne.statut === "en_attente") {
    await db.update(approvals).set({ statut: "expiree" }).where(eq(approvals.id, id));
    return "Cette demande a expiré (10 minutes). Rien n'a été envoyé : redemande-moi si besoin.";
  }
  if (ligne.statut === "expiree") return "Cette demande a expiré. Rien n'a été envoyé.";
  if (ligne.statut === "validee") return "Cette demande a déjà été validée.";
  return "Cette demande a déjà été annulée. Rien n'a été envoyé.";
}

/** Passe en "expirée" les demandes en attente depuis plus de 10 minutes, et prévient. Appelé chaque minute. */
export async function expirerDemandes(maintenant = new Date()) {
  const expirees = await db
    .update(approvals)
    .set({ statut: "expiree" })
    .where(and(eq(approvals.statut, "en_attente"), lte(approvals.expiresAt, maintenant)))
    .returning();
  for (const d of expirees) {
    const texte = `La demande n°${d.id} a expiré sans validation : rien n'a été envoyé.`;
    emettre(d.userId, { type: "approbation_maj", id: d.id, statut: "expiree", texte });
    emettre(d.userId, { type: "notification", texte });
  }
  return expirees.length;
}

/** Les dernières demandes déjà traitées (pour la page Validations). */
export async function historiqueDemandes(userId: number, limite = 20) {
  const lignes = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.userId, userId), ne(approvals.statut, "en_attente")))
    .orderBy(desc(approvals.createdAt), desc(approvals.id))
    .limit(limite);
  return lignes.map((l) => ({ ...affichage(l), statut: l.statut, resultat: l.resultat, createdAt: l.createdAt }));
}

/** Les demandes encore en attente d'un utilisateur (pour pnpm chat et le web). */
export async function demandesEnAttente(userId: number) {
  const lignes = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.userId, userId), eq(approvals.statut, "en_attente"), gt(approvals.expiresAt, new Date())));
  return lignes.map(affichage);
}
