// Outils des rappels : creer_rappel, voir_rappels.
import { z } from "zod";
import { creerRappel, rappelsAVenir } from "../services/rappels.js";
import { formaterDate, heureLocaleVersUtc } from "../services/temps.js";
import { definirOutil } from "./definir.js";

export const creerRappelOutil = definirOutil({
  nom: "creer_rappel",
  description: "Crée un rappel qui sera envoyé à l'utilisateur à la date et l'heure indiquées.",
  parametres: z.object({
    texte: z.string().describe("Ce qu'il faut rappeler, ex. 'Appeler maman'"),
    quand: z.string().describe("Heure LOCALE de l'utilisateur au format AAAA-MM-JJTHH:MM"),
  }),
  executer: async ({ texte, quand }, ctx) => {
    const { id: userId, fuseau } = ctx.utilisateur;
    const dueAt = heureLocaleVersUtc(quand, fuseau);
    if (!dueAt) throw new Error(`format de date invalide "${quand}" (attendu AAAA-MM-JJTHH:MM)`);
    if (dueAt.getTime() <= Date.now()) throw new Error("cette date est déjà passée");

    const rappel = await creerRappel(userId, texte.trim(), dueAt);
    return { id: rappel.id, texte: rappel.texte, quand: formaterDate(rappel.dueAt, fuseau) };
  },
});

export const voirRappels = definirOutil({
  nom: "voir_rappels",
  description: "Liste les rappels à venir.",
  parametres: z.object({}),
  executer: async (_args, ctx) => {
    const rappels = await rappelsAVenir(ctx.utilisateur.id);
    return rappels.map((r) => ({ id: r.id, texte: r.texte, quand: formaterDate(r.dueAt, ctx.utilisateur.fuseau) }));
  },
});
