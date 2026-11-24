// Tests de la phase 6 : invitations, droits admin, alertes, limite de débit, webhook.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
process.env.ENCRYPTION_KEY = "d".repeat(64);
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_TELEGRAM_ID;

const { config } = await import("../src/config.js");
const { db, users, invitations, migrerDb, fermerDb } = await import("../src/db/index.js");
const { assurerAdmin, identifierUtilisateur } = await import("../src/services/users.js");
const { creerInvitation, utiliserInvitation, retirerUtilisateur } = await import("../src/services/invitations.js");
const { signalerErreur, verifierBudget } = await import("../src/services/alertes.js");
const { ecouter } = await import("../src/services/events.js");
const { creerLienWeb } = await import("../src/services/sessions.js");
const { limiteDebit } = await import("../src/bot/identification.js");
const { creerApp } = await import("../src/api/app.js");
const { eq } = await import("drizzle-orm");

let adminId: number;
before(async () => {
  await migrerDb();
  adminId = (await assurerAdmin()).id;
});
after(async () => {
  await fermerDb();
});

/** Les notifications reçues par l'admin pendant "action". */
async function notificationsAdmin(action: () => Promise<unknown>) {
  const recues: string[] = [];
  const arreter = ecouter(adminId, (e) => {
    if (e.type === "notification") recues.push(e.texte);
  });
  await action();
  arreter();
  return recues;
}

test("invitation : crée un compte une seule fois, avec le bon rôle", async () => {
  const inv = await creerInvitation(adminId, "invite");
  assert.match(inv.code, /^[A-Z2-9]{10}$/);

  const nouveau = await utiliserInvitation(inv.code.toLowerCase(), "5550001", "Fatou");
  assert.equal(nouveau?.role, "invite");
  assert.equal(nouveau?.prenom, "Fatou");
  assert.equal((await identifierUtilisateur("5550001"))?.id, nouveau?.id);

  assert.equal(await utiliserInvitation(inv.code, "5550002", "Autre"), null); // déjà utilisé
});

test("invitation expirée ou inventée : refusée", async () => {
  const inv = await creerInvitation(adminId, "membre");
  await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.code, inv.code));
  assert.equal(await utiliserInvitation(inv.code, "5550003", "X"), null);
  assert.equal(await utiliserInvitation("INVENTE123", "5550004", "Y"), null);
});

test("on ne peut pas retirer l'admin ; retirer un membre supprime son compte", async () => {
  assert.match(await retirerUtilisateur(adminId), /Impossible/);
  const [m] = await db.insert(users).values({ prenom: "Temp", role: "membre" }).returning();
  assert.match(await retirerUtilisateur(m.id), /retiré/);
  assert.equal((await db.select().from(users).where(eq(users.id, m.id))).length, 0);
});

test("la même erreur 3 fois en 15 min → une alerte à l'admin", async () => {
  const t0 = Date.now();
  const recues = await notificationsAdmin(async () => {
    await signalerErreur("Gmail ne répond pas", t0);
    await signalerErreur("Gmail ne répond pas", t0 + 1000);
    await signalerErreur("autre erreur", t0 + 1500);
    await signalerErreur("Gmail ne répond pas", t0 + 2000);
  });
  assert.equal(recues.length, 1);
  assert.match(recues[0], /3 fois/);
});

test("budget au-delà de 80 % → une seule alerte par jour", async () => {
  config.DAILY_TOKEN_LIMIT = 1000;
  const membre = { id: 999, prenom: "Léa", role: "membre" };
  const recues = await notificationsAdmin(async () => {
    await verifierBudget(membre, 500, "2026-11-15"); // 50 % : rien
    await verifierBudget(membre, 850, "2026-11-15"); // 85 % : alerte
    await verifierBudget(membre, 950, "2026-11-15"); // déjà signalé aujourd'hui
    await verifierBudget(membre, 900, "2026-11-16"); // nouveau jour : alerte
  });
  assert.equal(recues.length, 2);
  assert.match(recues[0], /Léa a utilisé 85 %/);
});

test("Telegram : au-delà de 20 messages par minute, les suivants sont ignorés", async () => {
  const reponses: string[] = [];
  let traites = 0;
  const ctx = { message: { text: "salut" }, utilisateur: { id: 4242 }, reply: async (t: string) => reponses.push(t) };
  for (let i = 0; i < 25; i++) await limiteDebit(ctx as never, async () => void traites++);
  assert.equal(traites, 20);
  assert.equal(reponses.length, 1); // un seul avertissement
});

test("API admin : interdite à un membre", async () => {
  const [membre] = await db.insert(users).values({ prenom: "Membre", role: "membre" }).returning();
  const app = creerApp();
  const jeton = new URL(await creerLienWeb(membre.id)).searchParams.get("token")!;
  const connexion = await app.inject({ method: "GET", url: `/auth/magic?token=${jeton}` });
  const cookie = `awe_session=${connexion.cookies.find((c) => c.name === "awe_session")!.value}`;

  assert.equal((await app.inject({ method: "GET", url: "/api/admin/users", headers: { cookie } })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/admin/costs", headers: { cookie } })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode, 200);
  await app.close();
});

test("API admin : l'admin voit utilisateurs, coûts et journal", async () => {
  const app = creerApp();
  const jeton = new URL(await creerLienWeb(adminId)).searchParams.get("token")!;
  const connexion = await app.inject({ method: "GET", url: `/auth/magic?token=${jeton}` });
  const cookie = `awe_session=${connexion.cookies.find((c) => c.name === "awe_session")!.value}`;
  const csrf = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json().csrf;

  const liste = (await app.inject({ method: "GET", url: "/api/admin/users", headers: { cookie } })).json();
  assert.ok(liste.some((u: { role: string }) => u.role === "admin"));
  assert.equal((await app.inject({ method: "GET", url: "/api/admin/costs", headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: `/api/admin/logs/${adminId}`, headers: { cookie } })).statusCode, 200);
  const inv = await app.inject({ method: "POST", url: "/api/admin/invitations", headers: { cookie, "x-csrf-token": csrf }, payload: { role: "membre" } });
  assert.match(inv.json().code, /^[A-Z2-9]{10}$/);
  await app.close();
});

test("webhook Telegram : refusé sans le bon jeton secret", async () => {
  const { Bot } = await import("grammy");
  config.BOT_MODE = "webhook";
  config.TELEGRAM_WEBHOOK_SECRET = "un-secret-de-test-bien-long";
  const bot = new Bot("123:faux", {
    botInfo: { id: 123, is_bot: true, first_name: "Awé", username: "awe_test_bot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as never,
  });
  const app = creerApp({ bot: bot as never });
  const sans = await app.inject({ method: "POST", url: "/telegram/webhook", payload: { update_id: 1 } });
  assert.equal(sans.statusCode, 401);
  const faux = await app.inject({ method: "POST", url: "/telegram/webhook", headers: { "x-telegram-bot-api-secret-token": "faux" }, payload: { update_id: 1 } });
  assert.equal(faux.statusCode, 401);
  config.BOT_MODE = "polling";
  await app.close();
});
