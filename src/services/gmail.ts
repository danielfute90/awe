// =====================================================================
// Gmail : connexion (OAuth Google), recherche et lecture des emails.
//
// Droits demandés à Google, et rien de plus :
//   - gmail.readonly : lire (impossible de supprimer ou modifier)
//   - gmail.send     : envoyer (utilisé en phase 4, toujours après validation)
//
// Le jeton longue durée de Google ("refresh token") est stocké CHIFFRÉ
// (security/crypto.ts). Il ne sort jamais du serveur.
// =====================================================================
import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db, gmailAccounts } from "../db/index.js";
import { log } from "../logger.js";
import { chiffrer, dechiffrer, signer, verifierSignature } from "../security/crypto.js";
import { emettre } from "./events.js";

const DROITS = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
const VALIDITE_LIEN_MS = 10 * 60 * 1000; // le lien "connecter Gmail" vaut 10 minutes
export const TAILLE_EXTRAIT = 2000; // jamais plus de 2000 caractères d'un email envoyés au modèle

/** Une erreur dont le message peut être montré tel quel à l'utilisateur. */
export class ErreurGmail extends Error {}

/** Gmail est-il configuré dans le .env ? */
export function gmailConfigure() {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI && config.ENCRYPTION_KEY);
}

function clientOAuth() {
  if (!gmailConfigure()) {
    throw new ErreurGmail("Gmail n'est pas configuré : il manque GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI ou ENCRYPTION_KEY dans le .env.");
  }
  return new auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
}

// ---------------------------------------------------------------------
// Connexion / déconnexion
// ---------------------------------------------------------------------

/** Le lien à ouvrir pour connecter Gmail (signé, valable 10 minutes, propre à cet utilisateur). */
export function lienConnexion(userId: number) {
  clientOAuth(); // vérifie la configuration tout de suite
  return `${config.PUBLIC_URL}/api/gmail/connect?etat=${signer(userId, VALIDITE_LIEN_MS)}`;
}

/** L'adresse de la page Google de consentement. "etat" revient tel quel au retour (callback). */
export function urlGoogle(etat: string) {
  if (verifierSignature(etat) === null) return null;
  return clientOAuth().generateAuthUrl({
    access_type: "offline", // pour obtenir le refresh token
    prompt: "consent", // force Google à redonner un refresh token à chaque connexion
    scope: DROITS,
    state: etat,
  });
}

/** Retour de Google : échange le code contre les jetons, et enregistre le compte. Renvoie l'adresse Gmail. */
export async function terminerConnexion(code: string, etat: string) {
  const userId = verifierSignature(etat);
  if (userId === null) throw new ErreurGmail("Ce lien a expiré. Redemande un lien avec /connecter_gmail.");

  const client = clientOAuth();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new ErreurGmail("Google n'a pas donné d'accès durable. Réessaie avec /connecter_gmail.");
  }
  const accordes = tokens.scope?.split(" ") ?? [];
  if (!accordes.includes(DROITS[0])) {
    throw new ErreurGmail("Il faut cocher l'autorisation de lire tes emails sur la page Google. Réessaie avec /connecter_gmail.");
  }

  client.setCredentials(tokens);
  const profil = await gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
  const email = profil.data.emailAddress ?? "adresse inconnue";

  const ligne = { userId, email, refreshTokenChiffre: chiffrer(tokens.refresh_token), connectedAt: new Date() };
  await db.insert(gmailAccounts).values(ligne).onConflictDoUpdate({ target: gmailAccounts.userId, set: ligne });

  log.info({ userId }, "Gmail connecté");
  emettre(userId, { type: "notification", texte: `Gmail est connecté (${email}). Tu peux me demander de résumer tes emails.` });
  return email;
}

/** Réponse à /connecter_gmail (Telegram et pnpm chat). */
export async function messageConnexion(userId: number) {
  if (!gmailConfigure()) {
    return "Gmail n'est pas encore configuré : il manque GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI ou ENCRYPTION_KEY dans le .env.";
  }
  const deja = await compteGmail(userId);
  const local = /localhost|127\.0\.0\.1/.test(config.PUBLIC_URL)
    ? "\n\nOuvre-le sur l'ordinateur où tourne Awé (pnpm dev doit être lancé)."
    : "";
  return (
    (deja ? `Gmail est déjà connecté (${deja.email}). Pour changer de compte, ouvre ce lien :\n` : "Pour connecter Gmail, ouvre ce lien (valable 10 minutes) :\n") +
    lienConnexion(userId) +
    local
  );
}

/** Réponse à /deconnecter_gmail. */
export async function messageDeconnexion(userId: number) {
  return (await deconnecterGmail(userId))
    ? "Gmail est déconnecté. J'ai effacé mon accès, et prévenu Google."
    : "Gmail n'était pas connecté.";
}

export async function compteGmail(userId: number) {
  const [compte] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId)).limit(1);
  return compte ?? null;
}

/** Déconnecte Gmail : prévient Google (révocation) puis efface le jeton. Renvoie false si rien n'était connecté. */
export async function deconnecterGmail(userId: number) {
  const compte = await compteGmail(userId);
  if (!compte) return false;
  try {
    await clientOAuth().revokeToken(dechiffrer(compte.refreshTokenChiffre));
  } catch (err) {
    // Jeton déjà expiré ou révoqué : pas grave, on efface quand même.
    log.warn({ err }, "Révocation Google impossible");
  }
  await db.delete(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  return true;
}

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

// Pour les tests automatiques uniquement : remplace Gmail par une imitation (aucun vrai email touché).
let fauxGmail: gmail_v1.Gmail | null = null;
export function utiliserFauxGmail(faux: unknown) {
  fauxGmail = faux as gmail_v1.Gmail | null;
}

/** Un client Gmail authentifié pour cet utilisateur. */
async function clientGmail(userId: number) {
  const compte = await compteGmail(userId);
  if (!compte) throw new ErreurGmail("Gmail n'est pas connecté. Envoie /connecter_gmail pour le connecter.");
  const client = clientOAuth();
  client.setCredentials({ refresh_token: dechiffrer(compte.refreshTokenChiffre) });
  return gmail({ version: "v1", auth: client });
}

/**
 * Exécute un appel Gmail. Si Google a coupé l'accès (jeton expiré : toutes les
 * semaines tant que l'appli Google est "En test"), on efface le jeton mort et on prévient.
 */
async function avecGmail<T>(userId: number, appel: (g: gmail_v1.Gmail) => Promise<T>): Promise<T> {
  const g = fauxGmail ?? (await clientGmail(userId));
  try {
    return await appel(g);
  } catch (err) {
    if (/invalid_grant/i.test(String((err as Error)?.message ?? err))) {
      await db.delete(gmailAccounts).where(eq(gmailAccounts.userId, userId));
      const texte = "Ton accès Gmail a expiré (Google le coupe chaque semaine tant que l'appli est en test). Envoie /connecter_gmail pour le rétablir.";
      emettre(userId, { type: "notification", texte });
      throw new ErreurGmail(texte);
    }
    throw err;
  }
}

export type ApercuEmail = { id: string; de: string; sujet: string; date: string; apercu: string };

/** Recherche avec la syntaxe de Gmail (ex. "is:unread newer_than:2d", "from:banque"). 10 résultats maximum. */
export async function chercherEmails(userId: number, requete: string, max = 10): Promise<ApercuEmail[]> {
  return avecGmail(userId, async (g) => {
    const liste = await g.users.messages.list({ userId: "me", q: requete, maxResults: Math.min(Math.max(max, 1), 10) });
    const ids = (liste.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return Promise.all(
      ids.map(async (id) => {
        const m = await g.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        return { id, ...entetes(m.data), apercu: decoderEntites(m.data.snippet ?? "") };
      }),
    );
  });
}

export type EmailComplet = { id: string; de: string; sujet: string; date: string; corps: string };

/** Lit un email : expéditeur, sujet, date et le texte (coupé à 2000 caractères). */
export async function lireEmail(userId: number, id: string): Promise<EmailComplet> {
  return avecGmail(userId, async (g) => {
    const m = await g.users.messages.get({ userId: "me", id, format: "full" });
    return { id, ...entetes(m.data), corps: couper(texteDuCorps(m.data.payload) || decoderEntites(m.data.snippet ?? "")) };
  });
}

// ---------------------------------------------------------------------
// Envoi (appelé UNIQUEMENT après une validation humaine, voir approbations.ts)
// ---------------------------------------------------------------------

export type EmailAEnvoyer = { a: string; sujet: string; corps: string };

/** As-tu déjà écrit à cette adresse ? (cherche dans tes messages envoyés) */
export async function dejaContacte(userId: number, adresse: string) {
  return avecGmail(userId, async (g) => {
    const r = await g.users.messages.list({ userId: "me", q: `in:sent to:${adresse}`, maxResults: 1 });
    return (r.data.messages?.length ?? 0) > 0;
  });
}

/** Encode un en-tête qui contient des accents (norme des emails : =?UTF-8?B?...?=). */
const enteteUtf8 = (texte: string) => `=?UTF-8?B?${Buffer.from(texte, "utf8").toString("base64")}?=`;

/** Construit l'email au format standard (RFC 2822). L'adresse d'expédition est ajoutée par Gmail. */
export function construireEmail({ a, sujet, corps }: EmailAEnvoyer) {
  // Un retour à la ligne dans un en-tête permettrait d'ajouter des destinataires cachés : interdit.
  if (/[\r\n]/.test(a) || /[\r\n]/.test(sujet)) throw new Error("destinataire ou sujet invalide");
  return [
    `To: ${a}`,
    `Subject: ${enteteUtf8(sujet)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(corps, "utf8").toString("base64"),
  ].join("\r\n");
}

/** Envoie un email depuis la boîte Gmail de l'utilisateur. Renvoie l'id Gmail du message envoyé. */
export async function envoyerEmail(userId: number, email: EmailAEnvoyer) {
  return avecGmail(userId, async (g) => {
    const raw = Buffer.from(construireEmail(email), "utf8").toString("base64url");
    const r = await g.users.messages.send({ userId: "me", requestBody: { raw } });
    return r.data.id ?? "inconnu";
  });
}

// ---------------------------------------------------------------------
// Petits outils de mise en forme
// ---------------------------------------------------------------------

function entetes(message: gmail_v1.Schema$Message) {
  const trouver = (nom: string) =>
    message.payload?.headers?.find((h) => h.name?.toLowerCase() === nom.toLowerCase())?.value ?? "";
  return { de: trouver("From"), sujet: trouver("Subject") || "(sans sujet)", date: trouver("Date") };
}

/** Cherche le texte d'un email dans ses différentes parties : texte brut d'abord, sinon HTML nettoyé. */
export function texteDuCorps(partie: gmail_v1.Schema$MessagePart | undefined): string {
  const parties: gmail_v1.Schema$MessagePart[] = [];
  const parcourir = (p?: gmail_v1.Schema$MessagePart) => {
    if (!p) return;
    parties.push(p);
    p.parts?.forEach(parcourir);
  };
  parcourir(partie);

  const decoder = (p?: gmail_v1.Schema$MessagePart) =>
    p?.body?.data ? Buffer.from(p.body.data, "base64url").toString("utf8") : "";
  const brut = parties.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (brut) return nettoyer(decoder(brut));
  const html = parties.find((p) => p.mimeType === "text/html" && p.body?.data);
  return html ? nettoyer(htmlEnTexte(decoder(html))) : "";
}

function htmlEnTexte(html: string) {
  return decoderEntites(
    html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function decoderEntites(texte: string) {
  const nommees: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return texte
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (tout, nom) => nommees[nom.toLowerCase()] ?? tout);
}

function nettoyer(texte: string) {
  return texte
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function couper(texte: string, max = TAILLE_EXTRAIT) {
  return texte.length <= max ? texte : `${texte.slice(0, max)} [...]`;
}
