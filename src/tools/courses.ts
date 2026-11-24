// Outils de la liste de courses : voir_liste, ajouter_course, retirer_course, cocher_course.
import { z } from "zod";
import { ajouterCourses, cocherCourses, listerCourses, retirerCourses } from "../services/courses.js";
import { definirOutil } from "./definir.js";

const ids = z.array(z.number().int().positive()).min(1).describe("Les id des articles (donnés par voir_liste)");

export const voirListe = definirOutil({
  nom: "voir_liste",
  description: "Affiche la liste de courses avec l'id, le nom, la quantité et l'état (fait ou non) de chaque article.",
  parametres: z.object({}),
  executer: async (_args, ctx) => {
    const articles = await listerCourses(ctx.utilisateur.id);
    return articles.map(({ id, nom, quantite, fait }) => ({ id, nom, quantite, fait }));
  },
});

export const ajouterCourse = definirOutil({
  nom: "ajouter_course",
  description: "Ajoute un ou plusieurs articles à la liste de courses.",
  parametres: z.object({
    articles: z
      .array(
        z.object({
          nom: z.string().describe("Nom de l'article, ex. 'lait'"),
          quantite: z.string().nullable().describe("Quantité libre, ex. '2' ou '500 g', ou null"),
        }),
      )
      .min(1),
  }),
  executer: async ({ articles }, ctx) => {
    const ajoutes = await ajouterCourses(ctx.utilisateur.id, articles);
    return { ajoutes: ajoutes.map(({ id, nom, quantite }) => ({ id, nom, quantite })) };
  },
});

export const retirerCourse = definirOutil({
  nom: "retirer_course",
  description: "Retire définitivement des articles de la liste de courses.",
  parametres: z.object({ ids }),
  executer: async (args, ctx) => {
    const retires = await retirerCourses(ctx.utilisateur.id, args.ids);
    return { retires: retires.map(({ id, nom }) => ({ id, nom })), introuvables: args.ids.length - retires.length };
  },
});

export const cocherCourse = definirOutil({
  nom: "cocher_course",
  description: "Coche (fait = true) ou décoche (fait = false) des articles de la liste de courses.",
  parametres: z.object({ ids, fait: z.boolean() }),
  executer: async (args, ctx) => {
    const modifies = await cocherCourses(ctx.utilisateur.id, args.ids, args.fait);
    return { modifies: modifies.map(({ id, nom, fait }) => ({ id, nom, fait })) };
  },
});
