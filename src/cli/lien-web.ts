// =====================================================================
// pnpm lien-web : affiche un lien de connexion à l'interface web pour l'admin.
// Même chose que /web sur Telegram, mais sans Telegram.
// =====================================================================
process.env.LOG_LEVEL ??= "silent";

const { migrerDb, fermerDb } = await import("../db/index.js");
const { assurerAdmin } = await import("../services/users.js");
const { creerLienWeb } = await import("../services/sessions.js");

await migrerDb();
const moi = await assurerAdmin();
console.log(`\nLien de connexion pour ${moi.prenom} (un seul usage, valable 10 minutes) :\n${await creerLienWeb(moi.id)}\n`);
console.log("pnpm dev doit être lancé pour que le lien fonctionne.\n");
await fermerDb();
