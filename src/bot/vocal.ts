// =====================================================================
// Notes vocales Telegram :
//   1. on télécharge la note (format .ogg) depuis Telegram
//   2. ElevenLabs la transcrit en texte
//   3. on montre la transcription, puis Awé traite le texte (handleUserMessage)
//   4. réponse écrite, + vocale si /voix est activé et la réponse courte
// =====================================================================
import { InputFile, type Bot } from "grammy";
import { handleUserMessage } from "../agent/awe.js";
import { config } from "../config.js";
import { log } from "../logger.js";
import { ErreurVoix, repondreEnVocal, synthetiser, transcrire, voixConfiguree } from "../services/voix.js";
import type { AweContext } from "./contexte.js";
import { afficherEcriture } from "./texte.js";

export function enregistrerVocal(bot: Bot<AweContext>) {
  bot.on("message:voice", async (ctx) => {
    const vocal = ctx.message.voice;

    if (!voixConfiguree()) {
      await ctx.reply("Je ne sais pas encore écouter : il manque ELEVENLABS_API_KEY dans le .env. Écris-moi plutôt.");
      return;
    }
    if (vocal.duration > config.VOCAL_MAX_SECONDES) {
      await ctx.reply(`Ta note fait plus de ${config.VOCAL_MAX_SECONDES} secondes. Pour économiser les crédits, envoie-en une plus courte.`);
      return;
    }

    let arreter = afficherEcriture(ctx);
    try {
      // 1 et 2 : téléchargement puis transcription.
      const fichier = await ctx.getFile();
      const telechargement = await fetch(`https://api.telegram.org/file/bot${ctx.api.token}/${fichier.file_path}`);
      if (!telechargement.ok) throw new Error(`téléchargement Telegram impossible (${telechargement.status})`);
      const texte = await transcrire(Buffer.from(await telechargement.arrayBuffer()), "vocal.ogg");

      if (!texte) {
        await ctx.reply("Je n'ai rien entendu dans ta note. Tu peux réessayer ?");
        return;
      }
      await ctx.reply(`Tu as dit : « ${texte} »`);

      // 3 : même cerveau que pour un message écrit.
      const reponse = await handleUserMessage(ctx.utilisateur.id, texte, "telegram");
      await ctx.reply(reponse);

      // 4 : réponse vocale (mode économique).
      if (repondreEnVocal(reponse, ctx.utilisateur.voixActivee)) {
        arreter();
        arreter = afficherEcriture(ctx, "record_voice");
        try {
          await ctx.replyWithVoice(new InputFile(await synthetiser(reponse), "awe.ogg"));
        } catch (err) {
          // La réponse écrite est déjà partie : on ne dérange pas l'utilisateur pour ça.
          log.warn({ err }, "Réponse vocale impossible");
        }
      }
    } catch (err) {
      if (err instanceof ErreurVoix) {
        await ctx.reply(`${err.message} Écris-moi en attendant.`);
        return;
      }
      throw err; // géré par bot.catch
    } finally {
      arreter();
    }
  });
}
