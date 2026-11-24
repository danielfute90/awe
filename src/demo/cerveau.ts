// =====================================================================
// Le "cerveau" du mode démo : il remplace Claude par quelques règles simples.
// Important : il appelle les MÊMES outils que le vrai Awé (avec permissions,
// validations et journal). La démo montre donc le vrai fonctionnement du
// projet, sans aucune IA payante.
// =====================================================================
import type { ContexteAwe } from "../agent/contexte.js";
import { listerCourses } from "../services/courses.js";
import { rappelsAVenir } from "../services/rappels.js";
import { formaterDate } from "../services/temps.js";
import { outilsPour } from "../tools/index.js";

/** "Les Œufs" → "les oeufs" sans accents, pour reconnaître les mots-clés. */
const simplifier = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");
const ADRESSE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Heure locale au format attendu par creer_rappel : AAAA-MM-JJTHH:MM. */
function heureLocale(date: Date, fuseau: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(date)
    .replace(" ", "T");
}

/** "6 œufs et du beurre" → [{nom: "œufs", quantite: "6"}, {nom: "beurre", quantite: null}] */
function lireArticles(texte: string) {
  return texte
    .split(/,|\bet\b/)
    .map((morceau) => morceau.trim().replace(/^(du|de la|de l'|des|un|une|le|la|les|l')\s*/i, ""))
    .filter(Boolean)
    .map((morceau) => {
      const q = morceau.match(/^(\d+(?:[.,]\d+)?\s*(?:kg|g|l|litres?|paquets?|bouteilles?|boites?)?)\s+(?:de |d')?(.+)$/i);
      return q ? { nom: q[2].trim(), quantite: q[1].trim() } : { nom: morceau, quantite: null };
    });
}

export async function cerveauDemo(texte: string, ctx: ContexteAwe): Promise<string> {
  const outils = outilsPour(ctx.utilisateur.role);
  const appeler = (nom: string, args: unknown) => outils.find((o) => o.nom === nom)!.executer(args, ctx);
  const t = simplifier(texte);
  const { id: userId, fuseau, prenom } = ctx.utilisateur;

  // Suppression d'email : l'outil est INTERDIT par le registre des permissions.
  if (/supprim|efface/.test(t) && /mail/.test(t)) {
    const r = await appeler("supprimer_email", { id: "demo-2" });
    return `Je ne peux pas supprimer d'email : cette action m'est interdite. Le code l'a refusée et l'a notée dans le journal (${r.texte.split(".")[0]}).`;
  }

  // Envoi de la liste par email → demande de validation.
  if (/envoi|envoy/.test(t) && /liste|courses/.test(t)) {
    const a = texte.match(ADRESSE)?.[0];
    if (!a) return "À quelle adresse dois-je envoyer la liste ? (par exemple marie@exemple.com)";
    const r = await appeler("envoyer_liste_par_email", { a, sujet: null });
    return r.erreur ? r.texte : `J'ai préparé l'email avec ta liste pour ${a}. Rien n'est envoyé : vérifie le brouillon et clique sur Valider.`;
  }

  // Envoi d'un email → demande de validation.
  if (/envoi|envoy|ecri/.test(t) && /mail/.test(t)) {
    const a = texte.match(ADRESSE)?.[0];
    if (!a) return "À quelle adresse ? (par exemple marie@exemple.com)";
    const r = await appeler("envoyer_email", {
      a,
      sujet: "Petit message",
      corps: `Bonjour,\n\nCeci est un message préparé par la démo d'Awé.\n\nÀ bientôt,\n${prenom}`,
    });
    return r.erreur ? r.texte : `Le brouillon pour ${a} est prêt. Rien n'est envoyé tant que tu n'as pas cliqué sur Valider.`;
  }

  // Emails : résumé.
  if (/mail|boite|courrier/.test(t)) {
    const r = await appeler("resumer_emails", { requete: "", max: 10 });
    return r.erreur ? r.texte : r.texte;
  }

  // PDF de la liste.
  if (/pdf/.test(t)) {
    const articles = (await listerCourses(userId)).filter((a) => !a.fait);
    const contenu = ["# À acheter", ...articles.map((a) => `- ${a.nom}${a.quantite ? ` (${a.quantite})` : ""}`)].join("\n");
    const r = await appeler("creer_pdf", { titre: "Liste de courses", contenu });
    return r.erreur ? r.texte : "Voilà ton PDF « Liste de courses ». Tu le trouves dans la page Documents.";
  }

  // Rappels.
  if (/rappel/.test(t) && /dans|demain|a \d/.test(t)) {
    const n = Number(t.match(/dans (\d+)/)?.[1] ?? 60);
    const minutes = /dans \d+\s*h/.test(t) ? n * 60 : n;
    const quoi = texte.match(/(?:de |d')(.+?)(?:\s+dans\s+\d+.*)?$/i)?.[1] ?? "ton rappel";
    const quand = new Date(Date.now() + Math.max(1, minutes) * 60_000 + 30_000);
    const r = await appeler("creer_rappel", { texte: quoi, quand: heureLocale(quand, fuseau) });
    return r.erreur ? r.texte : `C'est noté : je te rappelle « ${quoi} » ${formaterDate(quand, fuseau)}.`;
  }
  if (/rappel/.test(t)) {
    await appeler("voir_rappels", {});
    const rappels = await rappelsAVenir(userId);
    return rappels.length
      ? `Tes rappels :\n${rappels.map((r) => `- ${r.texte} (${formaterDate(r.dueAt, fuseau)})`).join("\n")}`
      : "Tu n'as aucun rappel à venir.";
  }

  // Liste de courses : ajouter, retirer, voir.
  const ajout = texte.match(/^(?:ajoute|rajoute|mets|met)\s+(.+?)(?:\s+(?:à|a|sur|dans)\s+(?:ma|la)\s+liste.*)?$/i);
  if (ajout) {
    const articles = lireArticles(ajout[1]);
    const r = await appeler("ajouter_course", { articles });
    return r.erreur ? r.texte : `C'est ajouté : ${articles.map((a) => a.nom + (a.quantite ? ` (${a.quantite})` : "")).join(", ")}.`;
  }
  if (/retire|enleve|supprime/.test(t)) {
    const liste = await listerCourses(userId);
    const cibles = liste.filter((a) => t.includes(simplifier(a.nom)));
    if (cibles.length === 0) return "Je ne trouve pas cet article dans ta liste.";
    const r = await appeler("retirer_course", { ids: cibles.map((a) => a.id) });
    return r.erreur ? r.texte : `J'ai retiré : ${cibles.map((a) => a.nom).join(", ")}.`;
  }
  if (/liste|course/.test(t)) {
    await appeler("voir_liste", {});
    const liste = await listerCourses(userId);
    return liste.length
      ? `Ta liste :\n${liste.map((a) => `${a.fait ? "[x]" : "[ ]"} ${a.nom}${a.quantite ? ` (${a.quantite})` : ""}`).join("\n")}`
      : "Ta liste de courses est vide.";
  }

  if (/^(bonjour|salut|hello|coucou|hey)/.test(t)) return `Salut ${prenom} ! Que puis-je faire pour toi ?`;

  return (
    "Je suis la version démo d'Awé : je ne comprends que quelques phrases (la vraie version utilise Claude et comprend tout). Essaie :\n" +
    "- « Ajoute du riz à ma liste »\n- « Résume mes mails »\n- « Envoie ma liste à marie@exemple.com »\n" +
    "- « Rappelle-moi de boire de l'eau dans 2 minutes »\n- « Fais-moi un PDF de ma liste »"
  );
}
