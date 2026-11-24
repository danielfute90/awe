// =====================================================================
// Connexion à la base de données.
//
// - DATABASE_URL commence par "postgres" → Postgres (production)
// - sinon → fichier SQLite (développement), ex. "file:./data/awe.db"
//
// Le reste du code importe "db" et les tables depuis CE fichier uniquement,
// sans savoir quelle base est utilisée. Règle à respecter : n'utiliser que
// l'API commune aux deux (await db.select()/insert()/update()/delete(),
// .returning(), .onConflictDoNothing()). Pas de .get(), .all() ou .run().
// =====================================================================
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/libsql";
import { migrate as migrerSqlite } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migrerPg } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "../config.js";
import * as schemaPg from "./schema.pg.js";
import * as schemaSqlite from "./schema.sqlite.js";

export const estPostgres = /^postgres(ql)?:\/\//.test(config.DATABASE_URL);

// --- Création de la connexion ---------------------------------------
let fermer: () => Promise<void>;
let dbInterne: unknown;

if (estPostgres) {
  const client = postgres(config.DATABASE_URL, { max: 10 });
  dbInterne = drizzlePg({ client, schema: schemaPg });
  fermer = () => client.end();
} else {
  // On crée le dossier du fichier SQLite s'il n'existe pas (ex. ./data).
  const chemin = config.DATABASE_URL.replace(/^file:/, "");
  if (chemin !== ":memory:") mkdirSync(path.dirname(path.resolve(chemin)), { recursive: true });
  const client = createClient({ url: config.DATABASE_URL });
  dbInterne = drizzleSqlite({ client, schema: schemaSqlite });
  fermer = async () => client.close();
}

// On "type" la base comme la version SQLite : l'API commune est identique.
export const db = dbInterne as ReturnType<typeof drizzleSqlite<typeof schemaSqlite>>;

// Les tables correspondant à la base choisie.
const schema = (estPostgres ? schemaPg : schemaSqlite) as unknown as typeof schemaSqlite;
export const {
  users,
  invitations,
  messages,
  shoppingItems,
  reminders,
  documents,
  gmailAccounts,
  approvals,
  agentLogs,
  webSessions,
  loginLinks,
} = schema;
export { ROLES } from "./schema.sqlite.js";

// Types pratiques pour le reste du code.
export type Utilisateur = typeof schemaSqlite.users.$inferSelect;
export type Role = (typeof schemaSqlite.ROLES)[number];

// --- Migrations --------------------------------------------------------
// Applique les migrations du dossier drizzle/sqlite ou drizzle/pg au démarrage.
export async function migrerDb() {
  if (estPostgres) {
    await migrerPg(dbInterne as ReturnType<typeof drizzlePg>, {
      migrationsFolder: path.resolve("drizzle/pg"),
    });
  } else {
    await migrerSqlite(db, { migrationsFolder: path.resolve("drizzle/sqlite") });
  }
}

export async function fermerDb() {
  await fermer();
}
