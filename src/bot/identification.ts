// =====================================================================
// Middleware d'identification : s'exécute avant chaque handler.
// Il retrouve l'utilisateur Awé correspondant au compte Telegram.
//   - inconnu + "/start <code>" valide → son compte est créé (invitation)
//   - inconnu sans code → refus poli, on s'arrête là
// =====================================================================
import type { NextFunction } from "grammy";
import { utiliserInvitation } from "../services/invitations.js";
import { identifierUtilisateur } from "../services/users.js";
import type { AweContext } from "./contexte.js";

const MESSAGE_REFUS =
  "Bonjour. Awé fonctionne uniquement sur invitation.\n" +
  "Demande un lien d'invitation à la personne qui t'a parlé d'Awé.";

export async function identification(ctx: AweContext, next: NextFunction) {
  // Awé ne parle qu'en conversation privée.
  if (!ctx.from || ctx.chat?.type !== "private") return;
  const telegramId = String(ctx.from.id);

  let utilisateur = await identifierUtilisateur(telegramId);

  // Inscription par code d'invitation : "/start CODE" (envoyé par le lien t.me/...?start=CODE).
  const code = ctx.message?.text?.match(/^\/start\s+(\S+)/)?.[1];
  if (!utilisateur && code) {
    utilisateur = await utiliserInvitation(code, telegramId, ctx.from.first_name ?? "");
    if (!utilisateur) {
      await ctx.reply("Ce code d'invitation n'est pas valable (faux, expiré ou déjà utilisé). Demandes-en un nouveau.");
      return;
    }
  }

  if (!utilisateur) {
    await ctx.reply(MESSAGE_REFUS);
    return;
  }

  ctx.utilisateur = utilisateur;
  await next();
}

// ---------------------------------------------------------------------
// Limite de débit : 20 messages par minute et par utilisateur.
// (Les clics sur les boutons Valider/Annuler ne comptent pas.)
// ---------------------------------------------------------------------
const MAX_PAR_MINUTE = 20;
const historique = new Map<number, number[]>();

export async function limiteDebit(ctx: AweContext, next: NextFunction) {
  if (!ctx.message) return next();
  const maintenant = Date.now();
  const recents = (historique.get(ctx.utilisateur.id) ?? []).filter((t) => maintenant - t < 60_000);
  recents.push(maintenant);
  historique.set(ctx.utilisateur.id, recents);

  if (recents.length > MAX_PAR_MINUTE) {
    // On ne prévient qu'une fois (au premier message de trop), pour ne pas spammer.
    if (recents.length === MAX_PAR_MINUTE + 1) await ctx.reply("Doucement : 20 messages par minute maximum. Attends un peu.");
    return;
  }
  await next();
}
