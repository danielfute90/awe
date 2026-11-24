// Tests du mode démo : tout marche sans aucune clé, rien n'est vraiment envoyé.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
process.env.DEMO = "true";
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "awe-demo-"));
// Même si des clés traînent, la démo ne doit jamais les utiliser.
process.env.ANTHROPIC_API_KEY = "sk-ant-ne-doit-pas-servir";
delete process.env.ENCRYPTION_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_TELEGRAM_ID;

const { migrerDb, fermerDb } = await import("../src/db/index.js");
const { assurerAdmin } = await import("../src/services/users.js");
const { preparerDemo, emailsEnvoyesDemo } = await import("../src/demo/index.js");
const { handleUserMessage } = await import("../src/agent/awe.js");
const { listerCourses } = await import("../src/services/courses.js");
const { demandesEnAttente, decider } = await import("../src/services/approbations.js");
const { creerApp } = await import("../src/api/app.js");

let id: number;
before(async () => {
  await migrerDb();
  id = (await assurerAdmin()).id;
  await preparerDemo(id);
});
after(async () => {
  await fermerDb();
});

test("données d'exemple chargées", async () => {
  const noms = (await listerCourses(id)).map((a) => a.nom);
  assert.ok(noms.includes("lait") && noms.includes("tomates"));
});

test("ajouter à la liste, avec quantité", async () => {
  const r = await handleUserMessage(id, "Ajoute 6 œufs et du beurre à ma liste", "web");
  assert.match(r, /ajouté/);
  const liste = await listerCourses(id);
  assert.ok(liste.some((a) => a.nom === "œufs" && a.quantite === "6"));
  assert.ok(liste.some((a) => a.nom === "beurre"));
});

test("résumé des mails : l'email piégé est signalé comme suspect", async () => {
  const r = await handleUserMessage(id, "Résume mes mails", "web");
  assert.match(r, /Marie/);
  assert.match(r, /SUSPECT/);
});

test("envoyer la liste : validation obligatoire, puis faux envoi", async () => {
  const r = await handleUserMessage(id, "Envoie ma liste à marie@exemple.com", "web");
  assert.match(r, /Rien n'est envoyé/);
  const [demande] = await demandesEnAttente(id);
  assert.equal(emailsEnvoyesDemo.length, 0);
  assert.match(await decider(id, demande.id, "valider", "web"), /C'est envoyé/);
  assert.equal(emailsEnvoyesDemo.length, 1);
});

test("supprimer un mail : refusé", async () => {
  assert.match(await handleUserMessage(id, "Supprime le mail de la banque", "web"), /interdite/);
});

test("rappel dans 2 minutes", async () => {
  assert.match(await handleUserMessage(id, "Rappelle-moi de sortir le chien dans 2 minutes", "web"), /je te rappelle « sortir le chien »/);
});

test("entrée dans la démo sans lien magique", async () => {
  const app = creerApp();
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/info" })).json(), { demo: true });
  const r = await app.inject({ method: "GET", url: "/auth/demo" });
  assert.equal(r.statusCode, 302);
  assert.ok(r.cookies.some((c) => c.name === "awe_session"));
  await app.close();
});
