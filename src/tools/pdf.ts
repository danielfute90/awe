// Outil creer_pdf : crée un PDF et l'envoie à l'utilisateur (Telegram, et le web en phase 5).
import { z } from "zod";
import { creerPdf } from "../services/pdf.js";
import { definirOutil } from "./definir.js";

export const creerPdfOutil = definirOutil({
  nom: "creer_pdf",
  description:
    "Crée un document PDF et l'envoie à l'utilisateur. Contenu en texte simple : '# ' pour un intertitre, '- ' pour une puce. " +
    "Pour la liste de courses, appelle d'abord voir_liste.",
  parametres: z.object({
    titre: z.string().min(1).max(120).describe("Titre du document"),
    contenu: z.string().min(1).max(20000).describe("Le texte du document"),
  }),
  executer: async ({ titre, contenu }, ctx) => {
    const doc = await creerPdf(ctx.utilisateur.id, titre.trim(), contenu, ctx.utilisateur.fuseau);
    return { id: doc.id, titre: doc.titre, fichier: doc.fichier, envoye: "le PDF est envoyé à l'utilisateur" };
  },
});
