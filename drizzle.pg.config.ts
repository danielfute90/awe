// Génère les migrations Postgres (production) à partir de src/db/schema.pg.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.pg.ts",
  out: "./drizzle/pg",
});
