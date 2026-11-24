// =====================================================================
// Schéma de la base — version SQLite (développement).
//
// IMPORTANT : ce fichier a un jumeau, schema.pg.ts (Postgres, production).
// Les deux doivent TOUJOURS avoir les mêmes tables et les mêmes colonnes.
// Après une modification : pnpm db:generate (crée les migrations des deux côtés).
// =====================================================================
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Petits raccourcis pour garder le schéma lisible.
const maintenant = () => new Date();
const dateHeure = (nom: string) => integer(nom, { mode: "timestamp_ms" });
const booleen = (nom: string) => integer(nom, { mode: "boolean" });

export const ROLES = ["admin", "membre", "invite"] as const;

// Les utilisateurs de Awé.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Texte car les ID Telegram sont très grands. Vide tant que le compte n'est pas relié à Telegram.
  telegramId: text("telegram_id").unique(),
  prenom: text("prenom").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("membre"),
  voixActivee: booleen("voix_activee").notNull().default(true),
  fuseau: text("fuseau").notNull().default("Europe/Paris"),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

// Codes d'invitation (inscription via /start <code>).
export const invitations = sqliteTable("invitations", {
  code: text("code").primaryKey(),
  role: text("role", { enum: ROLES }).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: dateHeure("expires_at").notNull(),
  usedBy: integer("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: dateHeure("used_at"),
});

// Historique de conversation (Telegram et web mélangés).
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["telegram", "web"] }).notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    texte: text("texte").notNull(),
    // Vrai pour les échanges ratés à cause d'une panne (crédit, clé...) : affichés, mais oubliés par Awé.
    horsMemoire: booleen("hors_memoire").notNull().default(false),
    createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
  },
  (t) => [index("messages_user_date_idx").on(t.userId, t.createdAt)],
);

// Liste de courses.
export const shoppingItems = sqliteTable("shopping_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  quantite: text("quantite"), // texte libre : "2", "500 g", "1 paquet"...
  fait: booleen("fait").notNull().default(false),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

// Rappels.
export const reminders = sqliteTable(
  "reminders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    texte: text("texte").notNull(),
    dueAt: dateHeure("due_at").notNull(),
    envoye: booleen("envoye").notNull().default(false),
    createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
  },
  (t) => [index("reminders_echeance_idx").on(t.envoye, t.dueAt)],
);

// Documents PDF créés par Awé (fichiers dans storage/<userId>/).
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  chemin: text("chemin").notNull(),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

// Comptes Gmail connectés (le jeton est chiffré, jamais en clair).
export const gmailAccounts = sqliteTable("gmail_accounts", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  refreshTokenChiffre: text("refresh_token_chiffre").notNull(),
  connectedAt: dateHeure("connected_at").notNull().$defaultFn(maintenant),
});

// Demandes de validation humaine (envoi d'email, etc.).
export const approvals = sqliteTable("approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  outil: text("outil").notNull(),
  paramsJson: text("params_json").notNull(),
  paramsHash: text("params_hash").notNull(),
  statut: text("statut", { enum: ["en_attente", "validee", "annulee", "expiree"] })
    .notNull()
    .default("en_attente"),
  expiresAt: dateHeure("expires_at").notNull(),
  resultat: text("resultat"),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

// Journal de chaque étape de l'agent (outil, durée, tokens, coût, erreur).
export const agentLogs = sqliteTable(
  "agent_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tacheId: text("tache_id").notNull(),
    etape: integer("etape").notNull(),
    outil: text("outil"),
    paramsJson: text("params_json"),
    resultatResume: text("resultat_resume"),
    dureeMs: integer("duree_ms"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    coutEstime: real("cout_estime").notNull().default(0),
    erreur: text("erreur"),
    createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
  },
  (t) => [index("agent_logs_user_date_idx").on(t.userId, t.createdAt)],
);

// Sessions de l'interface web (cookie). Le jeton CSRF protège les POST/PATCH/DELETE.
export const webSessions = sqliteTable("web_sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: dateHeure("expires_at").notNull(),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

// Liens de connexion à usage unique envoyés par /web.
export const loginLinks = sqliteTable("login_links", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: dateHeure("expires_at").notNull(),
  used: booleen("used").notNull().default(false),
});
