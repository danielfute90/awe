// =====================================================================
// Configuration : lit les variables d'environnement et les vérifie.
// Si une variable obligatoire manque, Awé s'arrête avec un message clair.
// =====================================================================
import { z } from "zod";

// Charge le fichier .env (fonction native de Node : pas besoin de "dotenv").
// En test, on ne le charge pas pour ne pas mélanger avec les vraies valeurs.
if (process.env.NODE_ENV !== "test") {
  try {
    process.loadEnvFile();
  } catch {
    // Pas de fichier .env : normal en production (Railway fournit les variables).
  }
}

const schema = z.object({
  // --- Général ---
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Mode démo (pour les visiteurs de GitHub) : faux Claude, faux Gmail, données d'exemple.
  // Aucune clé n'est utilisée, même si elles sont remplies.
  DEMO: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  PORT: z.coerce.number().int().default(3000),
  PUBLIC_URL: z.string().default("http://localhost:3000"),
  FUSEAU_DEFAUT: z.string().default("Europe/Paris"),

  // --- Telegram (facultatif : sans token, le bot est simplement désactivé) ---
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  // Un ou plusieurs ID séparés par des virgules (ex. "8123456789,5123456789") :
  // ils ouvrent tous LE MÊME compte admin (même liste, même mémoire).
  ADMIN_TELEGRAM_ID: z
    .string()
    .regex(/^\d+(\s*,\s*\d+)*$/, "ADMIN_TELEGRAM_ID : des chiffres, séparés par des virgules s'il y en a plusieurs")
    .optional(),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // --- Base de données et fichiers ---
  DATABASE_URL: z.string().default("file:./data/awe.db"),
  STORAGE_DIR: z.string().default("storage"), // dossier des PDF (un sous-dossier par utilisateur)

  // --- Claude / Anthropic (le cerveau, phase 2) ---
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"), // cerveau principal
  ANTHROPIC_MODEL_FAST: z.string().default("claude-haiku-5-5"), // tri et résumés (phase 3)
  // Profondeur de réflexion : low, medium, high (plus haut = plus précis mais plus cher et plus lent)
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().default(200_000),
  // Prix en dollars par million de tokens (pour estimer les coûts). Défaut : Claude Opus 5.5.
  PRIX_ENTREE_1M: z.coerce.number().nonnegative().default(4),
  PRIX_SORTIE_1M: z.coerce.number().nonnegative().default(20),

  // --- ElevenLabs (la voix, phase 4) ---
  ELEVENLABS_API_KEY: z.string().optional(),
  // Voix "George" (voix prête à l'emploi, gratuite, parle français). Change-la si tu veux.
  ELEVENLABS_VOICE_ID: z.string().default("JBFqnCBsd6RMkjVDRZzb"),
  // Modèle de voix le moins cher (0,5 crédit par caractère) et modèle de transcription.
  ELEVENLABS_TTS_MODEL: z.string().default("eleven_flash_v2_5"),
  ELEVENLABS_STT_MODEL: z.string().default("scribe_v2"),
  // Économie : au-delà de cette longueur, Awé répond seulement par écrit.
  VOIX_MAX_CARACTERES: z.coerce.number().int().positive().default(600),
  // Économie : notes vocales plus longues refusées (en secondes).
  VOCAL_MAX_SECONDES: z.coerce.number().int().positive().default(120),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),

  // --- Google (phase 3) ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // --- Sécurité (phase 3) ---
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY doit faire 64 caractères hexadécimaux (32 octets)")
    .optional(),
});

// Dans un .env, "CLE=" donne une chaîne vide : on la traite comme "non renseignée".
const brut: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([, valeur]) => valeur !== undefined && valeur.trim() !== ""),
);
// Sur Render, l'adresse publique est fournie automatiquement (RENDER_EXTERNAL_URL).
brut.PUBLIC_URL ??= brut.RENDER_EXTERNAL_URL;
// L'adresse de retour Google se déduit de l'adresse publique si elle n'est pas donnée.
if (brut.PUBLIC_URL) brut.GOOGLE_REDIRECT_URI ??= `${brut.PUBLIC_URL.replace(/\/$/, "")}/api/gmail/callback`;

const resultat = schema
  .superRefine((c, ctx) => {
    // Le webhook exige une adresse HTTPS publique et un secret.
    if (c.BOT_MODE === "webhook" && c.TELEGRAM_BOT_TOKEN && !c.DEMO) {
      if (!c.TELEGRAM_WEBHOOK_SECRET || c.TELEGRAM_WEBHOOK_SECRET.length < 16) {
        ctx.addIssue({ code: "custom", path: ["TELEGRAM_WEBHOOK_SECRET"], message: "obligatoire en mode webhook (16 caractères minimum)" });
      }
      if (!c.PUBLIC_URL.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["PUBLIC_URL"], message: "doit commencer par https:// en mode webhook" });
      }
    }
  })
  .safeParse(brut);
if (!resultat.success) {
  console.error("\nConfiguration invalide. Vérifie ton fichier .env :");
  for (const probleme of resultat.error.issues) {
    console.error(`  - ${probleme.path.join(".")} : ${probleme.message}`);
  }
  console.error("");
  process.exit(1);
}

export const config = resultat.data;
export const enProduction = config.NODE_ENV === "production";

/** La liste des ID Telegram de l'admin (vide si ADMIN_TELEGRAM_ID n'est pas rempli). */
export function idsAdminTelegram(): string[] {
  return (config.ADMIN_TELEGRAM_ID ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
