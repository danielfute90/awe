// =====================================================================
// Création du bot Telegram (grammY) et branchement des handlers.
// L'ordre compte : identification d'abord, puis commandes, puis messages.
// =====================================================================
import { Bot, InlineKeyboard, InputFile } from "grammy";
import { log } from "../logger.js";
import { ecouterTout, type DemandeAffichee } from "../services/events.js";
import { definirNomDuBot } from "../services/invitations.js";
import { destinatairesTelegram, trouverParId } from "../services/users.js";
import { enregistrerCommandes } from "./commandes.js";
import type { AweContext } from "./contexte.js";
import { commandesAdmin } from "./admin.js";
import { identification, limiteDebit } from "./identification.js";
import { enregistrerTexte } from "./texte.js";
import { enregistrerValidations } from "./validations.js";
import { enregistrerVocal } from "./vocal.js";

/** Le message Telegram d'une demande de validation, avec ses trois boutons. */
function messageDemande(d: DemandeAffichee) {
  const LIMITE = 3500; // un message Telegram fait 4096 caractères maximum
  const apercu = d.apercu.length > LIMITE ? `${d.apercu.slice(0, LIMITE)}\n[... texte coupé ici, l'email complet sera envoyé]` : d.apercu;
  const texte = [
    `Awé attend ta validation (n°${d.id}) : envoi d'un email`,
    d.avertissement ? `\n${d.avertissement}` : "",
    `\n${apercu}`,
    "\nRien ne part sans ton accord. Valable 10 minutes.",
  ].join("\n");
  const boutons = new InlineKeyboard()
    .text("Valider", `appro:valider:${d.id}`)
    .text("Modifier", `appro:modifier:${d.id}`)
    .text("Annuler", `appro:annuler:${d.id}`);
  return { texte, boutons };
}

/** Libellé du statut final d'une demande, ajouté sur la carte. */
const STATUTS: Record<string, string> = {
  validee: "VALIDÉE",
  annulee: "ANNULÉE : rien n'a été envoyé",
  expiree: "EXPIRÉE : rien n'a été envoyé",
};

export function creerBot(token: string) {
  const bot = new Bot<AweContext>(token);

  // Les cartes de validation envoyées (n° de demande → messages Telegram), pour les mettre à jour ensuite.
  const cartes = new Map<number, { chatId: string; messageId: number; texte: string }[]>();

  bot.use(identification);
  bot.use(limiteDebit);
  bot.use(commandesAdmin);
  enregistrerCommandes(bot);
  enregistrerValidations(bot);
  enregistrerVocal(bot);
  enregistrerTexte(bot);

  // Ce qui se passe hors conversation (rappels, notifications, PDF, validations)
  // est envoyé sur Telegram, à tous les comptes Telegram de l'utilisateur.
  ecouterTout(async (userId, evenement) => {
    // Demande traitée (ici ou sur le web) : on met à jour ses cartes, sans boutons.
    if (evenement.type === "approbation_maj") {
      for (const carte of cartes.get(evenement.id) ?? []) {
        const statut = STATUTS[evenement.statut] ?? evenement.statut;
        await bot.api
          .editMessageText(carte.chatId, carte.messageId, `${carte.texte}\n\nStatut : ${statut}\n${evenement.texte}`)
          .catch(() => {}); // message trop ancien ou déjà identique : sans importance
      }
      cartes.delete(evenement.id);
      return;
    }
    if (!["rappel", "notification", "document", "approbation"].includes(evenement.type)) return;
    const utilisateur = await trouverParId(userId);
    if (!utilisateur) return;

    for (const telegramId of destinatairesTelegram(utilisateur)) {
      try {
        if (evenement.type === "rappel") {
          await bot.api.sendMessage(telegramId, `Rappel : ${evenement.rappel.texte}`);
        } else if (evenement.type === "notification") {
          await bot.api.sendMessage(telegramId, evenement.texte);
        } else if (evenement.type === "document") {
          await bot.api.sendDocument(telegramId, new InputFile(evenement.document.chemin), {
            caption: evenement.document.titre,
          });
        } else if (evenement.type === "approbation") {
          const { texte, boutons } = messageDemande(evenement.approbation);
          const envoye = await bot.api.sendMessage(telegramId, texte, { reply_markup: boutons });
          const id = evenement.approbation.id;
          cartes.set(id, [...(cartes.get(id) ?? []), { chatId: telegramId, messageId: envoye.message_id, texte }]);
        }
      } catch (err) {
        log.error({ err, type: evenement.type }, "Envoi Telegram impossible");
      }
    }
  });

  // Toute erreur non prévue : on la journalise et on prévient l'utilisateur.
  bot.catch(async (err) => {
    log.error({ err: err.error, update: err.ctx.update.update_id }, "Erreur dans le bot");
    try {
      await err.ctx.reply("Oups, j'ai eu un problème. Réessaie dans un instant.");
    } catch {
      // Si même la réponse échoue, on n'insiste pas.
    }
  });

  return bot;
}

/** Au démarrage : retient le nom du bot (liens d'invitation) et affiche le menu des commandes dans Telegram. */
export async function preparerBot(bot: Bot<AweContext>) {
  await bot.init();
  definirNomDuBot(bot.botInfo.username);
  await bot.api
    .setMyCommands([
      { command: "aide", description: "Ce qu'Awé sait faire" },
      { command: "liste", description: "Voir la liste de courses" },
      { command: "web", description: "Lien de connexion à l'interface web" },
      { command: "voix", description: "Réponses vocales : on ou off" },
      { command: "connecter_gmail", description: "Relier ta boîte Gmail" },
      { command: "deconnecter_gmail", description: "Couper l'accès à Gmail" },
    ])
    .catch((err) => log.warn({ err }, "Menu des commandes non mis à jour"));
}
