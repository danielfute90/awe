// Le "contexte" transmis à chaque outil pendant une tâche.
// L'identité de l'utilisateur vient d'ICI, jamais du modèle :
// un outil ne peut donc pas agir sur les données de quelqu'un d'autre.
import type { Utilisateur } from "../db/index.js";
import type { Source } from "../services/messages.js";

export type ContexteAwe = {
  utilisateur: Utilisateur;
  /** Identifiant unique de la tâche (regroupe ses lignes dans agent_logs). */
  tacheId: string;
  source: Source;
  /** Compteur d'étapes pour le journal. */
  etape: number;
};
