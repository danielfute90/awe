// =====================================================================
// Boutons Valider / Modifier / Annuler sous une demande de validation.
// Le bouton contient "appro:<décision>:<n° de demande>". La vérification
// (bonne personne, pas expirée, pas déjà traitée) est faite par decider().
// =====================================================================
import type { Bot } from "grammy";
import { decider, type Decision } from "../services/approbations.js";
import type { AweContext } from "./contexte.js";

export function enregistrerValidations(bot: Bot<AweContext>) {
  bot.callbackQuery(/^appro:(valider|modifier|annuler):(\d+)$/, async (ctx) => {
    const decision = ctx.match[1] as Decision;
    const id = Number(ctx.match[2]);

    await ctx.answerCallbackQuery(); // arrête le petit sablier sur le bouton
    await ctx.editMessageReplyMarkup().catch(() => {}); // retire les boutons : un seul clic possible
    if (decision === "valider") await ctx.replyWithChatAction("typing").catch(() => {});

    const reponse = await decider(ctx.utilisateur.id, id, decision, "telegram");
    await ctx.reply(reponse);
  });
}
