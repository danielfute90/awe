// =====================================================================
// Commandes réservées à l'admin :
//   /inviter [membre|invite]  → crée un lien d'invitation
//   /utilisateurs             → liste les comptes
//   /retirer <n°>             → supprime un compte et ses données
//   /couts                    → tokens et coût estimé des 7 derniers jours
//   /logs <n°>                → les dernières tâches d'un utilisateur
// =====================================================================
import { Composer } from "grammy";
import { coutsParJour, tachesRecentes } from "../services/couts.js";
import { creerInvitation, listerUtilisateurs, retirerUtilisateur } from "../services/invitations.js";
import type { AweContext } from "./contexte.js";

export const commandesAdmin = new Composer<AweContext>();

// Garde : ces commandes ne répondent qu'à l'admin. Les autres reçoivent un refus.
const admin = commandesAdmin.filter((ctx) => ctx.utilisateur.role === "admin");
commandesAdmin
  .filter((ctx) => ctx.utilisateur.role !== "admin")
  .command(["inviter", "utilisateurs", "retirer", "couts", "logs"], (ctx) => ctx.reply("Commande réservée à l'administrateur."));

admin.command("inviter", async (ctx) => {
  const role = ctx.match.trim() === "invite" ? "invite" : "membre";
  const inv = await creerInvitation(ctx.utilisateur.id, role);
  await ctx.reply(
    `Invitation (${role}, valable 7 jours, un seul usage) :\n${inv.lien ?? `code : ${inv.code} (la personne envoie /start ${inv.code} au bot)`}`,
    { link_preview_options: { is_disabled: true } },
  );
});

admin.command("utilisateurs", async (ctx) => {
  const liste = await listerUtilisateurs();
  await ctx.reply(liste.map((u) => `n°${u.id} ${u.prenom} : ${u.role}${u.telegramId ? "" : " (sans Telegram)"}`).join("\n"));
});

admin.command("retirer", async (ctx) => {
  const id = Number(ctx.match.trim());
  if (!Number.isInteger(id) || id <= 0) return ctx.reply("Utilisation : /retirer <n°> (le n° est donné par /utilisateurs).");
  await ctx.reply(await retirerUtilisateur(id));
});

admin.command("couts", async (ctx) => {
  const lignes = await coutsParJour(ctx.utilisateur.fuseau, 7);
  if (lignes.length === 0) return ctx.reply("Aucune consommation ces 7 derniers jours.");
  const total = lignes.reduce((s, l) => s + l.cout, 0);
  await ctx.reply(
    [
      "Consommation des 7 derniers jours (coût estimé) :",
      ...lignes.map((l) => `${l.jour} · ${l.prenom} : ${l.tokens.toLocaleString("fr-FR")} tokens · ${l.cout.toFixed(3)} $`),
      `Total : ${total.toFixed(3)} $`,
    ].join("\n"),
  );
});

admin.command("logs", async (ctx) => {
  const id = Number(ctx.match.trim()) || ctx.utilisateur.id;
  const taches = await tachesRecentes(id, 3);
  if (taches.length === 0) return ctx.reply("Aucune tâche enregistrée.");
  const texte = taches
    .map((t) =>
      [
        `Tâche du ${t.debut.toLocaleString("fr-FR", { timeZone: ctx.utilisateur.fuseau })} · ${t.tokens} tokens${t.erreur ? " · ERREUR" : ""}`,
        ...t.etapes.map(
          (e) => `  ${e.etape}. ${e.outil ?? "modèle"}${e.dureeMs ? ` (${e.dureeMs} ms)` : ""}${e.erreur ? ` → ${e.erreur}` : e.resultat ? ` → ${e.resultat}` : ""}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
  await ctx.reply(texte.slice(0, 4000) + "\n\nDétail complet : page Admin de l'interface web.");
});
