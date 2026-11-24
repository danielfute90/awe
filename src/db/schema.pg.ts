// =====================================================================
// Schéma de la base — version Postgres (production).
//
// IMPORTANT : jumeau de schema.sqlite.ts. Mêmes tables, mêmes colonnes.
// Après une modification : pnpm db:generate (crée les migrations des deux côtés).
// =====================================================================
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const maintenant = () => new Date();
const dateHeure = (nom: string) => timestamp(nom, { withTimezone: true, mode: "date" });
// Octets bruts (le type "bytea" de Postgres) : pour ranger un fichier PDF dans la base.
const octets = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const ROLES = ["admin", "membre", "invite"] as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").unique(), // vide tant que non relié à Telegram
  prenom: text("prenom").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("membre"),
  voixActivee: boolean("voix_activee").notNull().default(true),
  fuseau: text("fuseau").notNull().default("Europe/Paris"),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

export const invitations = pgTable("invitations", {
  code: text("code").primaryKey(),
  role: text("role", { enum: ROLES }).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: dateHeure("expires_at").notNull(),
  usedBy: integer("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: dateHeure("used_at"),
});

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["telegram", "web"] }).notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    texte: text("texte").notNull(),
    horsMemoire: boolean("hors_memoire").notNull().default(false), // échange raté (panne) : oublié par Awé
    createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
  },
  (t) => [index("messages_user_date_idx").on(t.userId, t.createdAt)],
);

export const shoppingItems = pgTable("shopping_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  quantite: text("quantite"),
  fait: boolean("fait").notNull().default(false),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    texte: text("texte").notNull(),
    dueAt: dateHeure("due_at").notNull(),
    envoye: boolean("envoye").notNull().default(false),
    createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
  },
  (t) => [index("reminders_echeance_idx").on(t.envoye, t.dueAt)],
);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  chemin: text("chemin").notNull(), // nom du fichier (anciens PDF : chemin sur le disque)
  // Le PDF lui-même, rangé DANS la base : il survit aux redéploiements (le disque de Render est effacé).
  contenu: octets("contenu"),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

export const gmailAccounts = pgTable("gmail_accounts", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  refreshTokenChiffre: text("refresh_token_chiffre").notNull(),
  connectedAt: dateHeure("connected_at").notNull().$defaultFn(maintenant),
});

export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
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

export const agentLogs = pgTable(
  "agent_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tacheId: text("tache_id").notNull(),
    etape: integer("etape").notNull(),
    outil: text("outil"),
    paramsJson: text("params_json"),
    resultatResume: text("resultat_resume"),
    dureeMs: integer("duree_ms"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    coutEstime: doublePrecision("cout_estime").notNull().default(0),
    erreur: text("erreur"),
    createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
  },
  (t) => [index("agent_logs_user_date_idx").on(t.userId, t.createdAt)],
);

export const webSessions = pgTable("web_sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: dateHeure("expires_at").notNull(),
  createdAt: dateHeure("created_at").notNull().$defaultFn(maintenant),
});

export const loginLinks = pgTable("login_links", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: dateHeure("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});
