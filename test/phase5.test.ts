// Tests de la phase 5 : connexion par lien magique, sessions, CSRF, API web, isolation.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
process.env.ENCRYPTION_KEY = "c".repeat(64);
// Dossier de fichiers temporaire : les tests ne touchent jamais au vrai dossier storage/.
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "awe-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_TELEGRAM_ID;

const { db, users, documents, migrerDb, fermerDb } = await import("../src/db/index.js");
const { assurerAdmin } = await import("../src/services/users.js");
const { creerLienWeb } = await import("../src/services/sessions.js");
const { ajouterCourses } = await import("../src/services/courses.js");
const { creerApp } = await import("../src/api/app.js");

const app = creerApp();
let adminId: number;

before(async () => {
  await migrerDb();
  adminId = (await assurerAdmin()).id;
  await app.ready();
});
after(async () => {
  await app.close();
  await fermerDb();
});

/** Ouvre une session comme le ferait un clic sur le lien magique. Renvoie le cookie et le jeton CSRF. */
async function seConnecter(userId: number) {
  const jeton = new URL(await creerLienWeb(userId)).searchParams.get("token")!;
  const r = await app.inject({ method: "GET", url: `/auth/magic?token=${jeton}` });
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, "/");
  const cookie = r.cookies.find((c) => c.name === "awe_session")!;
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.sameSite, "Lax");
  const entete = `awe_session=${cookie.value}`;
  const moi = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie: entete } })).json();
  return { cookie: entete, csrf: moi.csrf as string, jeton, moi };
}

test("sans session : 401 sur l'API", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/api/me" })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/api/messages" })).statusCode, 401);
});

test("lien magique : une seule utilisation", async () => {
  const { jeton, moi } = await seConnecter(adminId);
  assert.equal(moi.id, adminId);
  const encore = await app.inject({ method: "GET", url: `/auth/magic?token=${jeton}` });
  assert.equal(encore.headers.location, "/?lien=invalide");
  assert.equal(encore.cookies.length, 0);
});

test("lien magique inventé : refusé", async () => {
  const r = await app.inject({ method: "GET", url: "/auth/magic?token=invente" });
  assert.equal(r.headers.location, "/?lien=invalide");
});

test("CSRF : une modification sans le bon jeton est refusée", async () => {
  const { cookie, csrf } = await seConnecter(adminId);
  const sans = await app.inject({ method: "POST", url: "/api/shopping", headers: { cookie }, payload: { nom: "pain" } });
  assert.equal(sans.statusCode, 403);
  const faux = await app.inject({ method: "POST", url: "/api/shopping", headers: { cookie, "x-csrf-token": "faux" }, payload: { nom: "pain" } });
  assert.equal(faux.statusCode, 403);
  const bon = await app.inject({ method: "POST", url: "/api/shopping", headers: { cookie, "x-csrf-token": csrf }, payload: { nom: "pain" } });
  assert.equal(bon.statusCode, 200);
  assert.equal(bon.json().nom, "pain");
});

test("courses : cocher et supprimer via l'API", async () => {
  const { cookie, csrf } = await seConnecter(adminId);
  const h = { cookie, "x-csrf-token": csrf };
  const article = (await app.inject({ method: "POST", url: "/api/shopping", headers: h, payload: { nom: "riz", quantite: "1 kg" } })).json();
  const coche = await app.inject({ method: "PATCH", url: `/api/shopping/${article.id}`, headers: h, payload: { fait: true } });
  assert.equal(coche.json().fait, true);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/shopping/${article.id}`, headers: h })).statusCode, 200);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/shopping/${article.id}`, headers: h })).statusCode, 404);
});

test("isolation : impossible de voir ou toucher les données d'un autre", async () => {
  const [autre] = await db.insert(users).values({ prenom: "Autre", role: "membre" }).returning();
  const [sonArticle] = await ajouterCourses(autre.id, [{ nom: "secret", quantite: null }]);
  const [sonDoc] = await db.insert(documents).values({ userId: autre.id, titre: "privé", chemin: "storage/x.pdf" }).returning();

  const { cookie, csrf } = await seConnecter(adminId);
  const h = { cookie, "x-csrf-token": csrf };
  const liste = (await app.inject({ method: "GET", url: "/api/shopping", headers: { cookie } })).json() as { nom: string }[];
  assert.ok(!liste.some((a) => a.nom === "secret"));
  assert.equal((await app.inject({ method: "DELETE", url: `/api/shopping/${sonArticle.id}`, headers: h })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: `/api/documents/${sonDoc.id}/file`, headers: { cookie } })).statusCode, 404);
});

test("réglages : valeurs vérifiées", async () => {
  const { cookie, csrf } = await seConnecter(adminId);
  const h = { cookie, "x-csrf-token": csrf };
  const ok = await app.inject({ method: "PATCH", url: "/api/settings", headers: h, payload: { prenom: "Daniel", fuseau: "Africa/Abidjan", voixActivee: false } });
  assert.deepEqual(ok.json(), { prenom: "Daniel", voixActivee: false, fuseau: "Africa/Abidjan" });
  const mauvais = await app.inject({ method: "PATCH", url: "/api/settings", headers: h, payload: { fuseau: "Lune/Base" } });
  assert.equal(mauvais.statusCode, 400);
});

test("envoyer un message depuis le web passe par le même cerveau", async () => {
  const { cookie, csrf } = await seConnecter(adminId);
  const r = await app.inject({ method: "POST", url: "/api/messages", headers: { cookie, "x-csrf-token": csrf }, payload: { texte: "Salut" } });
  assert.match(r.json().reponse, /ANTHROPIC_API_KEY/); // pas de clé en test : Awé l'explique
  const fil = (await app.inject({ method: "GET", url: "/api/messages", headers: { cookie } })).json() as { source: string }[];
  assert.equal(fil.at(-1)?.source, "web");
});

test("effacer mes données : tout part, le compte reste", async () => {
  const { cookie, csrf } = await seConnecter(adminId);
  await ajouterCourses(adminId, [{ nom: "à effacer", quantite: null }]);
  const r = await app.inject({ method: "DELETE", url: "/api/me/data", headers: { cookie, "x-csrf-token": csrf } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/shopping", headers: { cookie } })).json(), []);
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/messages", headers: { cookie } })).json(), []);
  assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode, 200);
});

test("déconnexion : la session ne marche plus", async () => {
  const { cookie, csrf } = await seConnecter(adminId);
  assert.equal((await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie, "x-csrf-token": csrf } })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode, 401);
});
