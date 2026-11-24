// Tests de la phase 1 : base de données, création de l'admin, isolation des messages.
// Lancer avec : pnpm test
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// On prépare un environnement de test AVANT d'importer le code de Awé.
// Base SQLite en mémoire : rien n'est écrit sur le disque. Pas de Telegram.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_TELEGRAM_ID;

const { config } = await import("../src/config.js");
const { migrerDb, fermerDb } = await import("../src/db/index.js");
const { assurerAdmin, identifierUtilisateur, destinatairesTelegram } = await import("../src/services/users.js");
const { enregistrerMessage, derniersMessages } = await import("../src/services/messages.js");
const { creerApp } = await import("../src/api/app.js");

before(async () => {
  await migrerDb();
});

after(async () => {
  await fermerDb();
});

test("sans Telegram, un admin est créé au démarrage", async () => {
  const admin = await assurerAdmin();
  assert.equal(admin.role, "admin");
  assert.equal(admin.telegramId, null);
});

test("redémarrer ne crée pas un deuxième admin", async () => {
  const a = await assurerAdmin();
  const b = await assurerAdmin();
  assert.equal(a.id, b.id);
});

test("ajouter ADMIN_TELEGRAM_ID relie l'admin existant à Telegram", async () => {
  const avant = await assurerAdmin();
  config.ADMIN_TELEGRAM_ID = "111"; // comme si on remplissait le .env puis redémarrait
  const apres = await assurerAdmin();
  assert.equal(apres.id, avant.id);
  assert.equal(apres.telegramId, "111");
  assert.equal((await identifierUtilisateur("111"))?.id, avant.id);
});

test("changer ADMIN_TELEGRAM_ID relie le MÊME admin (pas de doublon)", async () => {
  const avant = await assurerAdmin();
  config.ADMIN_TELEGRAM_ID = "222"; // nouvel ID Telegram dans le .env
  const apres = await assurerAdmin();
  assert.equal(apres.id, avant.id);
  assert.equal(apres.telegramId, "222");
  assert.equal(await identifierUtilisateur("111"), null); // l'ancien ID n'a plus accès
});

test("plusieurs ID dans ADMIN_TELEGRAM_ID ouvrent le même compte admin", async () => {
  const admin = await assurerAdmin();
  config.ADMIN_TELEGRAM_ID = "222, 333";
  assert.equal((await identifierUtilisateur("222"))?.id, admin.id);
  assert.equal((await identifierUtilisateur("333"))?.id, admin.id);
  assert.deepEqual(destinatairesTelegram(await assurerAdmin()), ["222", "333"]);
});

test("un inconnu sur Telegram est refusé", async () => {
  assert.equal(await identifierUtilisateur("999"), null);
});

test("les messages sont isolés par utilisateur et dans l'ordre", async () => {
  const admin = await assurerAdmin();
  await enregistrerMessage(admin.id, "web", "user", "premier");
  await enregistrerMessage(admin.id, "web", "assistant", "second");

  const historique = await derniersMessages(admin.id);
  assert.deepEqual(
    historique.map((m) => m.texte),
    ["premier", "second"],
  );
  assert.equal((await derniersMessages(admin.id + 1)).length, 0);
});

test("la route /health répond et compte les utilisateurs", async () => {
  const app = creerApp();
  const reponse = await app.inject({ method: "GET", url: "/health" });
  assert.equal(reponse.statusCode, 200);
  assert.deepEqual(reponse.json(), { ok: true, base: "sqlite", utilisateurs: 1 });
  await app.close();
});
