// Commandes du bot (/start, /aide, /liste, /web, /voix, /connecter_gmail, /deconnecter_gmail).
import type { Bot } from "grammy";
import { listeEnTexte, listerCourses } from "../services/courses.js";
import { messageConnexion, messageDeconnexion } from "../services/gmail.js";
import { creerLienWeb } from "../services/sessions.js";
import { changerVoix } from "../services/users.js";
import type { AweContext } from "./contexte.js";

export const TEXTE_AIDE = [
  "Parle-moi normalement, par exemple :",
  "- « Ajoute du lait et 6 œufs à la liste »",
  "- « Rappelle-moi d'appeler maman demain à 18h »",
  "- « Résume mes mails non lus »",
  "- « Envoie ma liste de courses à marie@exemple.com »",
  "- « Fais-moi un PDF de ma liste »",
  "Tu peux aussi m'envoyer une note vocale.",
  "",
  "Commandes :",
  "/liste - voir la liste de courses",
  "/web - lien de connexion à l'interface web",
  "/voix - réponses vocales : /voix on ou /voix off",
  "/connecter_gmail - relier ta boîte Gmail",
  "/deconnecter_gmail - couper l'accès à Gmail",
  "/aide - afficher cette aide",
].join("\n");

export function enregistrerCommandes(bot: Bot<AweContext>) {
  bot.command("start", async (ctx) => {
    const { prenom, role } = ctx.utilisateur;
    const statut = role === "admin" ? " Tu es administrateur." : "";
    await ctx.reply(`Salut ${prenom}, je suis Awé.${statut}\n\n${TEXTE_AIDE}`);
  });

  bot.command("aide", (ctx) => ctx.reply(TEXTE_AIDE));

  bot.command("liste", async (ctx) => {
    await ctx.reply(listeEnTexte(await listerCourses(ctx.utilisateur.id)));
  });

  bot.command("web", async (ctx) => {
    const lien = await creerLienWeb(ctx.utilisateur.id);
    const local = /localhost|127\.0\.0\.1/.test(lien) ? "\nOuvre-le sur l'ordinateur où tourne Awé." : "";
    await ctx.reply(`Ton lien de connexion à l'interface web (un seul usage, valable 10 minutes) :\n${lien}${local}`, {
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("voix", async (ctx) => {
    const choix = ctx.match.trim().toLowerCase();
    if (choix === "on" || choix === "off") {
      await changerVoix(ctx.utilisateur.id, choix === "on");
      await ctx.reply(choix === "on"
        ? "Réponses vocales activées : quand tu m'envoies une note vocale, je réponds aussi en vocal (si c'est court)."
        : "Réponses vocales coupées : je réponds seulement par écrit. Je comprends toujours tes notes vocales.");
      return;
    }
    const etat = ctx.utilisateur.voixActivee ? "activées" : "coupées";
    await ctx.reply(`Réponses vocales : ${etat}. Tape /voix on ou /voix off.`);
  });

  // Gmail : interdit aux invités (même règle que pour les outils).
  bot.command("connecter_gmail", async (ctx) => {
    if (ctx.utilisateur.role === "invite") return ctx.reply("Les invités n'ont pas accès à Gmail.");
    await ctx.reply(await messageConnexion(ctx.utilisateur.id), { link_preview_options: { is_disabled: true } });
  });

  bot.command("deconnecter_gmail", async (ctx) => {
    await ctx.reply(await messageDeconnexion(ctx.utilisateur.id));
  });
}
