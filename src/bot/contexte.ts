// Le "contexte" grammY enrichi : chaque message connaît l'utilisateur Awé qui l'envoie.
import type { Context } from "grammy";
import type { Utilisateur } from "../db/index.js";

export type AweContext = Context & {
  /** Rempli par le middleware d'identification (toujours présent dans les handlers). */
  utilisateur: Utilisateur;
};
