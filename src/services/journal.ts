// =====================================================================
// Journal de l'agent (table agent_logs) : une ligne par tour du modèle
// et une ligne par appel d'outil. Sert aux pages Admin (coûts, logs).
// =====================================================================
import { config } from "../config.js";
import { agentLogs, db } from "../db/index.js";
import { log } from "../logger.js";
import { signalerErreur } from "./alertes.js";

export type LigneJournal = {
  userId: number;
  tacheId: string;
  etape: number;
  outil?: string | null;
  params?: unknown;
  resultatResume?: string | null;
  dureeMs?: number | null;
  tokensIn?: number;
  tokensOut?: number;
  erreur?: string | null;
};

/** Coût estimé en dollars, d'après les prix du .env (par million de tokens). */
export function estimerCout(tokensIn: number, tokensOut: number) {
  return (tokensIn * config.PRIX_ENTREE_1M + tokensOut * config.PRIX_SORTIE_1M) / 1_000_000;
}

/** Coupe un texte trop long pour le journal. */
export function resumer(texte: string, max = 300) {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

export async function journaliser(ligne: LigneJournal) {
  const tokensIn = ligne.tokensIn ?? 0;
  const tokensOut = ligne.tokensOut ?? 0;
  try {
    await db.insert(agentLogs).values({
      userId: ligne.userId,
      tacheId: ligne.tacheId,
      etape: ligne.etape,
      outil: ligne.outil ?? null,
      paramsJson: ligne.params === undefined ? null : JSON.stringify(ligne.params),
      resultatResume: ligne.resultatResume ?? null,
      dureeMs: ligne.dureeMs ?? null,
      tokensIn,
      tokensOut,
      coutEstime: estimerCout(tokensIn, tokensOut),
      erreur: ligne.erreur ?? null,
    });
  } catch (err) {
    // Le journal ne doit jamais faire planter une conversation.
    log.error({ err }, "Impossible d'écrire dans agent_logs");
  }
  // Une vraie erreur (pas un refus voulu, comme supprimer_email) peut déclencher une alerte admin.
  if (ligne.erreur && !ligne.erreur.startsWith("REFUSÉ")) await signalerErreur(ligne.erreur).catch(() => {});
}
