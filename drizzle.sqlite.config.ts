// Génère les migrations SQLite (développement) à partir de src/db/schema.sqlite.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.sqlite.ts",
  out: "./drizzle/sqlite",
});
