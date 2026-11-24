// =====================================================================
// L'agent Awé et sa boucle (avec Claude, d'Anthropic).
//
// handleUserMessage est le SEUL point d'entrée : Telegram, le web et le
// terminal (pnpm chat) l'appellent tous. Awé se comporte donc pareil partout.
//
// Déroulé d'un message :
//   1. on enregistre le message de l'utilisateur
//   2. on vérifie le budget de tokens du jour
//   3. on envoie à Claude le prompt système + les 20 derniers messages + les outils
//   4. LA BOUCLE : si Claude demande des outils, on les exécute (avec les
//      garde-fous) et on lui renvoie les résultats ; il recommence...
//      jusqu'à sa réponse finale. 15 tours maximum.
//   5. chaque tour est journalisé ; la réponse est enregistrée et renvoyée
// =====================================================================
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { budgetDepasse, MAX_TOURS, tokensUtilisesAujourdhui } from "../security/limits.js";
import { verifierBudget } from "../services/alertes.js";
import { emettre } from "../services/events.js";
import { journaliser } from "../services/journal.js";
import { enregistrerMessage, memoireConversation, oublierMessage, type Source } from "../services/messages.js";
import { trouverParId } from "../services/users.js";
import { outilsPour } from "../tools/index.js";
import type { ContexteAwe } from "./contexte.js";
import { construirePrompt } from "./prompt.js";
import { cerveauDemo } from "../demo/cerveau.js";

type Message = Anthropic.Beta.BetaMessageParam;

const TAILLE_MEMOIRE = 20;

/**
 * Si Claude refuse une demande pour raison de sécurité, l'API peut la relancer
 * automatiquement sur un autre modèle. Possible seulement pour certains modèles.
 */
const avecRepli = (modele: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(modele);

export async function handleUserMessage(userId: number, texte: string, source: Source): Promise<string> {
  const utilisateur = await trouverParId(userId);
  if (!utilisateur) throw new Error(`Utilisateur ${userId} introuvable`);

  const question = await enregistrerMessage(userId, source, "user", texte);
  emettre(userId, { type: "etat", etat: "reflechit" });

  let resultat: Resultat;
  try {
    resultat = await executerAgent({ utilisateur, tacheId: randomUUID(), source, etape: 0 }, texte);
  } finally {
    emettre(userId, { type: "etat", etat: "dispo" });
  }

  // Panne (crédit, clé, budget...) : l'échange reste visible mais sort de la mémoire d'Awé.
  // Sinon, plus tard, Awé traiterait cette vieille demande hors contexte.
  if (resultat.panne) await oublierMessage(userId, question.id);
  await enregistrerMessage(userId, source, "assistant", resultat.texte, resultat.panne);
  return resultat.texte;
}

/** La réponse d'Awé, et "panne" = la demande n'a pas pu être traitée pour une raison technique. */
type Resultat = { texte: string; panne: boolean };
const reponse = (texte: string): Resultat => ({ texte, panne: false });
const panne = (texte: string): Resultat => ({ texte, panne: true });

async function executerAgent(ctx: ContexteAwe, texte: string): Promise<Resultat> {
  const { utilisateur } = ctx;

  // Mode démo : un petit cerveau à règles remplace Claude (aucune clé, aucun coût).
  if (config.DEMO) return reponse(await cerveauDemo(texte, ctx));

  if (!config.ANTHROPIC_API_KEY) {
    return panne("Je ne suis pas encore branché à Claude. Ajoute ANTHROPIC_API_KEY dans le fichier .env, puis redémarre-moi.");
  }

  const budget = await budgetDepasse(utilisateur);
  if (budget.depasse) {
    return panne(`J'ai atteint mon budget du jour (${budget.limite} tokens). Je m'arrête là pour aujourd'hui, on reprend demain.`);
  }

  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const outils = outilsPour(utilisateur.role);
  const messages = await memoire(utilisateur.id);

  try {
    for (let tour = 1; tour <= MAX_TOURS; tour++) {
      const retour = await client.beta.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 16000,
        system: construirePrompt(utilisateur.prenom, utilisateur.fuseau),
        tools: outils.map((o) => o.definition),
        messages,
        output_config: { effort: config.ANTHROPIC_EFFORT },
        cache_control: { type: "ephemeral" }, // réutilise le début de la conversation d'un tour à l'autre (moins cher)
        ...(avecRepli(config.ANTHROPIC_MODEL)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });

      // Journal : une ligne par tour, avec les tokens consommés.
      const u = retour.usage;
      await journaliser({
        userId: utilisateur.id,
        tacheId: ctx.tacheId,
        etape: ++ctx.etape,
        resultatResume: `tour ${tour} du modèle (${retour.stop_reason})`,
        tokensIn: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        tokensOut: u.output_tokens,
      });
      // Alerte admin au-delà de 80 % du budget du jour.
      const aujourdhui = new Intl.DateTimeFormat("fr-CA", { timeZone: utilisateur.fuseau }).format(new Date());
      await verifierBudget(utilisateur, await tokensUtilisesAujourdhui(utilisateur.id, utilisateur.fuseau), aujourdhui);

      if (retour.stop_reason === "refusal") {
        return reponse("Je ne peux pas t'aider sur ce point.");
      }

      // On garde la réponse complète de Claude dans la conversation (obligatoire pour la suite).
      messages.push({ role: "assistant", content: retour.content });
      if (retour.stop_reason === "pause_turn") continue;

      const appels = retour.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

      // Pas d'outil demandé : c'est la réponse finale.
      if (appels.length === 0) {
        const final = retour.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return reponse(final || "C'est fait.");
      }

      if (retour.stop_reason === "max_tokens") {
        throw new Error("réponse coupée (max_tokens) pendant un appel d'outil");
      }

      // On exécute les outils demandés, un par un, puis on renvoie TOUS les résultats d'un coup.
      const resultats: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const appel of appels) {
        const outil = outils.find((o) => o.nom === appel.name);
        const resultat = outil
          ? await outil.executer(appel.input, ctx)
          : { texte: `REFUSÉ : outil inconnu "${appel.name}". Rien n'a été fait.`, erreur: true };
        resultats.push({ type: "tool_result", tool_use_id: appel.id, content: resultat.texte, is_error: resultat.erreur });
      }
      messages.push({ role: "user", content: resultats });
    }

    // Les 15 tours sont épuisés.
    await journaliser({ userId: utilisateur.id, tacheId: ctx.tacheId, etape: ++ctx.etape, erreur: `limite de ${MAX_TOURS} tours atteinte` });
    return reponse(`Je me suis arrêté : cette demande demandait plus de ${MAX_TOURS} étapes. Tu peux la découper en plusieurs demandes plus simples ?`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await journaliser({ userId: utilisateur.id, tacheId: ctx.tacheId, etape: ++ctx.etape, erreur: message });
    log.error({ err, tacheId: ctx.tacheId }, "Erreur de l'agent");
    return panne(messageErreur(err));
  }
}

/** Les 20 derniers messages, au format attendu par Claude (le premier doit venir de l'utilisateur). */
async function memoire(userId: number): Promise<Message[]> {
  const historique = await memoireConversation(userId, TAILLE_MEMOIRE);
  const premierUtilisateur = historique.findIndex((m) => m.role === "user");
  return historique.slice(Math.max(premierUtilisateur, 0)).map((m) => ({ role: m.role, content: m.texte }));
}

/** Un message clair selon le type d'erreur de l'API. */
function messageErreur(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Ma clé Claude est refusée. Vérifie ANTHROPIC_API_KEY dans le fichier .env.";
  }
  if (err instanceof Anthropic.NotFoundError) {
    return `Le modèle "${config.ANTHROPIC_MODEL}" est introuvable. Vérifie ANTHROPIC_MODEL dans le fichier .env.`;
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Je reçois trop de demandes en ce moment. Réessaie dans une minute.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    // Ex. : crédit épuisé, paramètre refusé... Le message de l'API (en anglais) dit pourquoi.
    const raison = err.apiMessage ?? err.message;
    if (/credit balance/i.test(raison)) {
      return "Le compte Claude n'a plus de crédit. Ajoute du crédit sur console.anthropic.com (Plans & Billing), puis réessaie.";
    }
    return `Claude a refusé la requête : ${raison}`;
  }
  return "Désolé, je n'ai pas réussi à traiter ta demande. Réessaie dans un instant.";
}
