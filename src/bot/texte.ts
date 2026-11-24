// =====================================================================
// Messages texte Telegram → l'agent Awé (handleUserMessage).
// =====================================================================
import type { Bot } from "grammy";
import { handleUserMessage } from "../agent/awe.js";
import type { AweContext } from "./contexte.js";

/** Affiche "Awé écrit..." dans Telegram tant que le traitement dure. Renvoie une fonction d'arrêt. */
export function afficherEcriture(ctx: AweContext, action: "typing" | "record_voice" = "typing") {
  const envoyer = () => ctx.replyWithChatAction(action).catch(() => {});
  void envoyer();
  const minuteur = setInterval(envoyer, 4_000); // l'indicateur Telegram s'éteint après ~5 s
  return () => clearInterval(minuteur);
}

export function enregistrerTexte(bot: Bot<AweContext>) {
  bot.on("message:text", async (ctx) => {
    const texte = ctx.message.text;

    // Une commande inconnue (ex. /truc) n'est pas envoyée à l'agent.
    if (texte.startsWith("/")) {
      await ctx.reply("Je ne connais pas cette commande. Tape /aide.");
      return;
    }

    const arreterEcriture = afficherEcriture(ctx);
    try {
      const reponse = await handleUserMessage(ctx.utilisateur.id, texte, "telegram");
      await ctx.reply(reponse);
    } finally {
      arreterEcriture();
    }
  });
}
