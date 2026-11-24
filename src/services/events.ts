// =====================================================================
// Bus d'événements : quand quelque chose se passe (nouveau message,
// courses modifiées, rappel...), on "émet" un événement. Les autres parties
// de Awé (interface web en SSE, bot Telegram, terminal) peuvent l'écouter.
// =====================================================================
import { EventEmitter } from "node:events";

export type EtatAwe = "dispo" | "reflechit" | "travaille" | "attend_validation";

export type EvenementAwe =
  | {
      type: "message";
      message: { id: number; source: string; role: string; texte: string; createdAt: Date };
    }
  | { type: "etat"; etat: EtatAwe }
  | { type: "courses" }
  | { type: "rappel"; rappel: { id: number; texte: string; dueAt: Date } }
  // Une info à pousser à l'utilisateur (Gmail connecté, accès expiré, alerte...).
  | { type: "notification"; texte: string }
  // Un PDF vient d'être créé.
  | { type: "document"; document: { id: number; titre: string; fichier: string } }
  // Une action attend la validation de l'utilisateur (ex. envoi d'email).
  | { type: "approbation"; approbation: DemandeAffichee }
  // Une demande vient d'être validée, annulée ou a expiré.
  | { type: "approbation_maj"; id: number; statut: string; texte: string };

/** Ce qu'on montre à l'utilisateur pour qu'il valide en connaissance de cause. */
export type DemandeAffichee = { id: number; outil: string; apercu: string; avertissement: string | null; expiresAt: Date };

type Ecouteur = (userId: number, evenement: EvenementAwe) => void;

const bus = new EventEmitter();
bus.setMaxListeners(0); // autant d'onglets web ouverts que nécessaire

/** Émet un événement pour UN utilisateur. */
export function emettre(userId: number, evenement: EvenementAwe) {
  bus.emit("evenement", userId, evenement);
}

/** Écoute les événements d'un seul utilisateur. Renvoie une fonction pour arrêter d'écouter. */
export function ecouter(userId: number, rappel: (evenement: EvenementAwe) => void) {
  const ecouteur: Ecouteur = (id, evenement) => {
    if (id === userId) rappel(evenement);
  };
  bus.on("evenement", ecouteur);
  return () => bus.off("evenement", ecouteur);
}

/** Écoute les événements de TOUS les utilisateurs (ex. : le bot qui envoie les rappels). */
export function ecouterTout(ecouteur: Ecouteur) {
  bus.on("evenement", ecouteur);
  return () => bus.off("evenement", ecouteur);
}
