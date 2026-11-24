// =====================================================================
// definirOutil : crée un outil pour l'agent, avec les garde-fous intégrés.
// Pour CHAQUE appel, dans cet ordre :
//   1. vérification de la permission (registre security/permissions.ts)
//   2. vérification des paramètres envoyés par le modèle (schéma zod)
//   3. niveau "auto" : exécution ; niveau "approval" : demande de validation
//   4. enregistrement dans agent_logs (paramètres, durée, résultat ou erreur)
// =====================================================================
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ContexteAwe } from "../agent/contexte.js";
import { verifierPermission } from "../security/permissions.js";
import { creerDemande, type ParamsEnvoi } from "../services/approbations.js";
import { emettre } from "../services/events.js";
import { journaliser, resumer } from "../services/journal.js";

type DefinitionOutil<P extends z.ZodObject> = {
  nom: string;
  description: string;
  /** Schéma des paramètres. Les champs facultatifs utilisent .nullable(). */
  parametres: P;
  executer: (args: z.infer<P>, ctx: ContexteAwe) => Promise<unknown>;
  /**
   * Pour les actions à valider (niveau "approval") : prépare EXACTEMENT ce qui sera
   * exécuté après validation (ex. l'email complet). "executer" n'est alors jamais appelé.
   */
  preparer?: (args: z.infer<P>, ctx: ContexteAwe) => Promise<ParamsEnvoi>;
};

/** Ce que l'outil renvoie au modèle. */
export type ResultatOutil = { texte: string; erreur: boolean };

export type OutilAwe = {
  nom: string;
  /** La définition envoyée à Claude. */
  definition: Anthropic.Beta.BetaTool;
  /** Exécute l'outil avec tous les garde-fous. "args" vient du modèle : non fiable. */
  executer: (args: unknown, ctx: ContexteAwe) => Promise<ResultatOutil>;
};

// Contraintes que le mode "strict" de l'API ne gère pas : on les retire du schéma
// envoyé à Claude, mais zod continue de les vérifier de notre côté.
const CLES_NON_SUPPORTEES = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
]);

function nettoyerSchema(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(nettoyerSchema);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.entries(valeur)
        .filter(([cle]) => !CLES_NON_SUPPORTEES.has(cle))
        .map(([cle, v]) => [cle, nettoyerSchema(v)]),
    );
  }
  return valeur;
}

/** Transforme un schéma zod en schéma JSON accepté par l'API Claude en mode strict. */
export function schemaPourClaude(parametres: z.ZodObject) {
  return nettoyerSchema(z.toJSONSchema(parametres)) as Anthropic.Beta.BetaTool.InputSchema;
}

export function definirOutil<P extends z.ZodObject>(def: DefinitionOutil<P>): OutilAwe {
  return {
    nom: def.nom,
    definition: {
      name: def.nom,
      description: def.description,
      input_schema: schemaPourClaude(def.parametres),
      strict: true, // Claude respecte exactement le schéma
    },

    executer: async (args, ctx) => {
      const debut = Date.now();
      const ligne = { userId: ctx.utilisateur.id, tacheId: ctx.tacheId, outil: def.nom, params: args };
      const echec = async (message: string): Promise<ResultatOutil> => {
        await journaliser({ ...ligne, etape: ++ctx.etape, erreur: message, dureeMs: Date.now() - debut });
        return { texte: `${message}. Rien n'a été fait.`, erreur: true };
      };

      // 1. Permission vérifiée dans le code, avant toute exécution.
      const verdict = verifierPermission(def.nom, ctx.utilisateur.role);
      if (!verdict.autorise) return echec(`REFUSÉ : ${verdict.raison}`);

      // 2. Les paramètres viennent du modèle : on les vérifie.
      const valides = def.parametres.safeParse(args);
      if (!valides.success) return echec(`ERREUR : paramètres invalides (${valides.error.issues[0]?.message})`);

      emettre(ctx.utilisateur.id, { type: "etat", etat: "travaille" });
      try {
        // 3a. Action sensible : on n'exécute PAS. On prépare une demande de validation.
        if (verdict.niveau === "approval") {
          if (!def.preparer) throw new Error(`l'outil ${def.nom} n'a pas de préparation de demande`);
          const params = await def.preparer(valides.data as z.infer<P>, ctx);
          const demande = await creerDemande(ctx.utilisateur.id, def.nom, params);
          const texte =
            `EN ATTENTE DE VALIDATION (demande n°${demande.id}) : rien n'est envoyé. ` +
            "L'utilisateur voit le brouillon complet avec les boutons Valider / Modifier / Annuler (valable 10 minutes). " +
            (params.nouveauDestinataire ? "Il est averti qu'il n'a jamais écrit à cette adresse. " : "") +
            "Dis-lui simplement de vérifier et de valider. Ne prétends pas que c'est envoyé.";
          await journaliser({ ...ligne, etape: ++ctx.etape, resultatResume: `demande n°${demande.id} créée`, dureeMs: Date.now() - debut });
          return { texte, erreur: false };
        }

        // 3b. Action normale : exécution directe.
        const resultat = await def.executer(valides.data as z.infer<P>, ctx);
        const texte = typeof resultat === "string" ? resultat : JSON.stringify(resultat);
        await journaliser({ ...ligne, etape: ++ctx.etape, resultatResume: resumer(texte), dureeMs: Date.now() - debut });
        return { texte, erreur: false };
      } catch (err) {
        return echec(`ERREUR : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
