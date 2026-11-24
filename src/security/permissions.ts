// =====================================================================
// Registre des permissions : chaque outil a un niveau.
//   - "auto"      : exécuté directement
//   - "approval"  : jamais exécuté directement, une validation humaine est demandée
//   - "forbidden" : toujours refusé (et enregistré dans les logs)
// Ce registre est vérifié DANS LE CODE avant chaque exécution d'outil :
// même si le modèle "insiste", il ne peut pas contourner cette règle.
// Un outil absent du registre est refusé par défaut.
// =====================================================================
import type { Role } from "../db/index.js";

export type Niveau = "auto" | "approval" | "forbidden";

export const PERMISSIONS: Record<string, Niveau> = {
  // Courses et rappels
  voir_liste: "auto",
  ajouter_course: "auto",
  retirer_course: "auto",
  cocher_course: "auto",
  creer_rappel: "auto",
  voir_rappels: "auto",
  // Gmail (lecture)
  chercher_emails: "auto",
  lire_email: "auto",
  resumer_emails: "auto",
  // Documents
  creer_pdf: "auto",
  // Envois : validation humaine obligatoire
  envoyer_email: "approval",
  envoyer_liste_par_email: "approval",
  // Interdit
  supprimer_email: "forbidden",
};

/** Outils qui touchent à Gmail : interdits aux invités. */
export const OUTILS_GMAIL = new Set([
  "chercher_emails",
  "lire_email",
  "resumer_emails",
  "envoyer_email",
  "envoyer_liste_par_email",
  "supprimer_email",
]);

export type Verdict = { autorise: true; niveau: "auto" | "approval" } | { autorise: false; raison: string };

/** Peut-on exécuter cet outil pour cet utilisateur ? */
export function verifierPermission(outil: string, role: Role): Verdict {
  const niveau = PERMISSIONS[outil];
  if (!niveau) return { autorise: false, raison: `outil inconnu "${outil}"` };
  if (niveau === "forbidden") return { autorise: false, raison: `l'action "${outil}" est interdite` };
  if (role === "invite" && OUTILS_GMAIL.has(outil)) {
    return { autorise: false, raison: "les invités n'ont pas accès à Gmail" };
  }
  return { autorise: true, niveau };
}

/** Un outil doit-il être proposé au modèle pour ce rôle ? (les interdits restent visibles pour être refusés et tracés) */
export function outilVisible(outil: string, role: Role) {
  return !(role === "invite" && OUTILS_GMAIL.has(outil));
}
