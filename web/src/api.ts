// =====================================================================
// Appels au serveur d'Awé.
// Le cookie de session part automatiquement ; pour les requêtes qui
// modifient quelque chose, on ajoute le jeton CSRF (donné par /api/me).
// =====================================================================

let jetonCsrf = "";
export const definirCsrf = (jeton: string) => (jetonCsrf = jeton);

/** Levée quand la session n'existe pas ou a expiré : on affiche la page de connexion. */
export class NonConnecte extends Error {}

export async function api<T>(chemin: string, options: { methode?: string; corps?: unknown } = {}): Promise<T> {
  const methode = options.methode ?? "GET";
  const reponse = await fetch(chemin, {
    method: methode,
    credentials: "same-origin",
    headers: {
      ...(options.corps !== undefined ? { "content-type": "application/json" } : {}),
      ...(methode !== "GET" ? { "x-csrf-token": jetonCsrf } : {}),
    },
    body: options.corps !== undefined ? JSON.stringify(options.corps) : undefined,
  });
  if (reponse.status === 401) throw new NonConnecte();
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(donnees.erreur ?? `Erreur ${reponse.status}`);
  return donnees as T;
}

// ---------------------------------------------------------------------
// Les types renvoyés par le serveur
// ---------------------------------------------------------------------
export type EtatAwe = "dispo" | "reflechit" | "travaille" | "attend_validation";

export type Moi = {
  id: number;
  prenom: string;
  role: "admin" | "membre" | "invite";
  voixActivee: boolean;
  fuseau: string;
  csrf: string;
  telegram: boolean;
  gmail: { configure: boolean; email: string | null; connecteLe: string | null };
  budget: { utilises: number; limite: number; illimite: boolean };
};

// Page Admin
export type Utilisateur = { id: number; prenom: string; role: string; telegram: boolean; createdAt: string };
export type CoutJour = { jour: string; userId: number; prenom: string; tokens: number; cout: number };
export type Etape = {
  etape: number;
  outil: string | null;
  params: string | null;
  resultat: string | null;
  dureeMs: number | null;
  tokensIn: number;
  tokensOut: number;
  erreur: string | null;
};
export type Tache = { tacheId: string; debut: string; tokens: number; cout: number; erreur: boolean; etapes: Etape[] };

export type Message = { id: number; source: "telegram" | "web"; role: "user" | "assistant"; texte: string; createdAt: string };
export type Article = { id: number; nom: string; quantite: string | null; fait: boolean };
export type Document = { id: number; titre: string; createdAt: string };
export type Demande = { id: number; outil: string; apercu: string; avertissement: string | null; expiresAt: string };
export type DemandePassee = Demande & { statut: string; resultat: string | null; createdAt: string };

/** Ce que le serveur pousse en direct (SSE). */
export type Evenement =
  | { type: "bonjour" }
  | { type: "message"; message: Message }
  | { type: "etat"; etat: EtatAwe }
  | { type: "courses" }
  | { type: "rappel"; rappel: { texte: string } }
  | { type: "notification"; texte: string }
  | { type: "document" }
  | { type: "approbation" }
  | { type: "approbation_maj"; id: number; statut: string; texte: string };
