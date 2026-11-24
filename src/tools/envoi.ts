// =====================================================================
// Outils d'envoi : envoyer_email, envoyer_liste_par_email.
// Niveau "approval" : ces outils ne font que PRÉPARER une demande.
// L'envoi réel a lieu dans services/approbations.ts, après ton clic "Valider".
// =====================================================================
import { z } from "zod";
import { listerCourses } from "../services/courses.js";
import { dejaContacte } from "../services/gmail.js";
import { definirOutil } from "./definir.js";

const adresse = z.email().describe("Adresse email du destinataire, ex. marie@exemple.com");

// Jamais appelée : le registre des permissions impose la validation (voir definir.ts).
const jamais = async () => {
  throw new Error("cet outil passe obligatoirement par une validation");
};

export const envoyerEmailOutil = definirOutil({
  nom: "envoyer_email",
  description:
    "Prépare un email à envoyer depuis le Gmail de l'utilisateur. Rien n'est envoyé : l'utilisateur voit le brouillon et doit cliquer Valider.",
  parametres: z.object({
    a: adresse,
    sujet: z.string().min(1).max(200).describe("Sujet de l'email"),
    corps: z.string().min(1).max(3000).describe("Texte de l'email, signé avec le prénom de l'utilisateur"),
  }),
  executer: jamais,
  preparer: async ({ a, sujet, corps }, ctx) => ({
    a,
    sujet,
    corps,
    nouveauDestinataire: !(await dejaContacte(ctx.utilisateur.id, a)),
  }),
});

export const envoyerListeParEmailOutil = definirOutil({
  nom: "envoyer_liste_par_email",
  description:
    "Prépare l'envoi de la liste de courses (articles non cochés) par email. Rien n'est envoyé avant que l'utilisateur clique Valider.",
  parametres: z.object({
    a: adresse,
    sujet: z.string().max(200).nullable().describe("Sujet (par défaut : 'Liste de courses')"),
  }),
  executer: jamais,
  preparer: async ({ a, sujet }, ctx) => {
    const articles = (await listerCourses(ctx.utilisateur.id)).filter((x) => !x.fait);
    if (articles.length === 0) throw new Error("la liste de courses est vide : rien à envoyer");
    const lignes = articles.map((x) => `- ${x.nom}${x.quantite ? ` (${x.quantite})` : ""}`);
    return {
      a,
      sujet: sujet?.trim() || "Liste de courses",
      corps: `Bonjour,\n\nVoici la liste de courses :\n${lignes.join("\n")}\n\n${ctx.utilisateur.prenom}`,
      nouveauDestinataire: !(await dejaContacte(ctx.utilisateur.id, a)),
    };
  },
});
