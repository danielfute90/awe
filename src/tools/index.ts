// Tous les outils de Awé. Pour en ajouter un : crée-le dans ce dossier,
// ajoute-le ici ET dans le registre security/permissions.ts.
import type { Role } from "../db/index.js";
import { outilVisible } from "../security/permissions.js";
import { ajouterCourse, cocherCourse, retirerCourse, voirListe } from "./courses.js";
import type { OutilAwe } from "./definir.js";
import { envoyerEmailOutil, envoyerListeParEmailOutil } from "./envoi.js";
import { creerPdfOutil } from "./pdf.js";
import { chercherEmailsOutil, lireEmailOutil, resumerEmailsOutil, supprimerEmailOutil } from "./gmail.js";
import { creerRappelOutil, voirRappels } from "./rappels.js";

const TOUS_LES_OUTILS: OutilAwe[] = [
  // Courses et rappels
  voirListe,
  ajouterCourse,
  retirerCourse,
  cocherCourse,
  creerRappelOutil,
  voirRappels,
  // Gmail
  chercherEmailsOutil,
  lireEmailOutil,
  resumerEmailsOutil,
  supprimerEmailOutil,
  // Envois (validation obligatoire)
  envoyerEmailOutil,
  envoyerListeParEmailOutil,
  // Documents
  creerPdfOutil,
];

/** Les outils proposés au modèle pour ce rôle. */
export function outilsPour(role: Role) {
  return TOUS_LES_OUTILS.filter((outil) => outilVisible(outil.nom, role));
}
