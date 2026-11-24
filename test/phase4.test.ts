// Tests de la phase 4 : validations (envoi d'email), PDF, règles de la voix.
// Gmail est remplacé par une imitation : aucun vrai email n'est envoyé.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
process.env.ENCRYPTION_KEY = "b".repeat(64);
process.env.ELEVENLABS_API_KEY = "cle-test";
// Dossier de fichiers temporaire : les tests ne touchent jamais au vrai dossier storage/.
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "awe-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_TELEGRAM_ID;

const { db, approvals, users, migrerDb, fermerDb } = await import("../src/db/index.js");
const { assurerAdmin } = await import("../src/services/users.js");
const { utiliserFauxGmail, construireEmail } = await import("../src/services/gmail.js");
const { decider, expirerDemandes } = await import("../src/services/approbations.js");
const { ajouterCourses, cocherCourses } = await import("../src/services/courses.js");
const { ecouter } = await import("../src/services/events.js");
const { outilsPour } = await import("../src/tools/index.js");
const { repondreEnVocal } = await import("../src/services/voix.js");
const { eq } = await import("drizzle-orm");

// --- Faux Gmail : note ce qui est envoyé ; "dejaconnu@exemple.com" a déjà reçu un email.
let envoyes: string[] = [];
utiliserFauxGmail({
  users: {
    messages: {
      list: async ({ q }: { q: string }) => ({ data: { messages: q.includes("dejaconnu@") ? [{ id: "x" }] : [] } }),
      send: async ({ requestBody }: { requestBody: { raw: string } }) => {
        envoyes.push(Buffer.from(requestBody.raw, "base64url").toString("utf8"));
        return { data: { id: `gmail-${envoyes.length}` } };
      },
    },
  },
});

let adminId: number;
before(async () => {
  await migrerDb();
  adminId = (await assurerAdmin()).id;
});
beforeEach(() => {
  envoyes = [];
});
after(async () => {
  utiliserFauxGmail(null);
  await fermerDb();
});

const outil = (nom: string) => outilsPour("admin").find((o) => o.nom === nom)!;
const ctx = async () => ({ utilisateur: await assurerAdmin(), tacheId: "test", source: "web" as const, etape: 0 });
const numero = (texte: string) => Number(texte.match(/n°(\d+)/)![1]);

test("envoyer_email ne fait que créer une demande : rien n'est envoyé", async () => {
  const vues: string[] = [];
  const arreter = ecouter(adminId, (e) => {
    if (e.type === "approbation") vues.push(e.approbation.avertissement ?? "");
  });
  const r = await outil("envoyer_email").executer({ a: "inconnu@exemple.com", sujet: "Bonjour", corps: "Salut !" }, await ctx());
  arreter();

  assert.equal(r.erreur, false);
  assert.match(r.texte, /EN ATTENTE DE VALIDATION/);
  assert.equal(envoyes.length, 0);
  const [d] = await db.select().from(approvals).where(eq(approvals.id, numero(r.texte)));
  assert.equal(d.statut, "en_attente");
  assert.equal(d.paramsHash.length, 64); // SHA-256
  assert.match(vues[0], /jamais écrit/); // destinataire jamais contacté : averti
});

test("pas d'avertissement pour un destinataire déjà contacté", async () => {
  const r = await outil("envoyer_email").executer({ a: "dejaconnu@exemple.com", sujet: "Re", corps: "Ok" }, await ctx());
  const [d] = await db.select().from(approvals).where(eq(approvals.id, numero(r.texte)));
  assert.equal(JSON.parse(d.paramsJson).nouveauDestinataire, false);
});

test("Valider envoie EXACTEMENT le brouillon, une seule fois", async () => {
  const r = await outil("envoyer_email").executer({ a: "marie@exemple.com", sujet: "Dîner ce soir", corps: "À 20h ?" }, await ctx());
  const id = numero(r.texte);

  assert.match(await decider(adminId, id, "valider", "web"), /C'est envoyé à marie@exemple.com/);
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0], /^To: marie@exemple\.com/);
  assert.match(envoyes[0], /Subject: =\?UTF-8\?B\?/); // sujet accentué bien encodé
  assert.ok(envoyes[0].includes(Buffer.from("À 20h ?").toString("base64")));

  // Deuxième clic (ou deuxième téléphone) : rien de plus.
  assert.match(await decider(adminId, id, "valider", "web"), /déjà été validée/);
  assert.equal(envoyes.length, 1);
});

test("Annuler et Modifier : rien n'est envoyé", async () => {
  const a = numero((await outil("envoyer_email").executer({ a: "x@exemple.com", sujet: "s", corps: "c" }, await ctx())).texte);
  assert.equal(await decider(adminId, a, "annuler", "web"), "D'accord, rien n'a été envoyé.");
  const m = numero((await outil("envoyer_email").executer({ a: "x@exemple.com", sujet: "s", corps: "c" }, await ctx())).texte);
  assert.match(await decider(adminId, m, "modifier", "web"), /rien n'a été envoyé.*changer/);
  assert.equal(envoyes.length, 0);
});

test("un autre utilisateur ne peut pas valider ma demande", async () => {
  const id = numero((await outil("envoyer_email").executer({ a: "x@exemple.com", sujet: "s", corps: "c" }, await ctx())).texte);
  const [autre] = await db.insert(users).values({ prenom: "Autre", role: "membre" }).returning();
  assert.equal(await decider(autre.id, id, "valider", "web"), "Je ne trouve pas cette demande.");
  assert.equal(envoyes.length, 0);
});

test("après 10 minutes, la demande expire et ne peut plus être validée", async () => {
  const id = numero((await outil("envoyer_email").executer({ a: "x@exemple.com", sujet: "s", corps: "c" }, await ctx())).texte);
  await db.update(approvals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(approvals.id, id));
  assert.match(await decider(adminId, id, "valider", "web"), /expiré/);
  assert.equal(envoyes.length, 0);
  assert.equal(await expirerDemandes(), 0); // déjà marquée expirée
});

test("un brouillon modifié en base après coup n'est pas envoyé (empreinte)", async () => {
  const id = numero((await outil("envoyer_email").executer({ a: "ami@exemple.com", sujet: "s", corps: "c" }, await ctx())).texte);
  const pirate = JSON.stringify({ a: "pirate@exemple.com", sujet: "s", corps: "c", nouveauDestinataire: false });
  await db.update(approvals).set({ paramsJson: pirate }).where(eq(approvals.id, id));
  assert.match(await decider(adminId, id, "valider", "web"), /par sécurité, rien n'a été envoyé/);
  assert.equal(envoyes.length, 0);
});

test("adresse invalide ou en-tête piégé : refusés", async () => {
  const r = await outil("envoyer_email").executer({ a: "pas-une-adresse", sujet: "s", corps: "c" }, await ctx());
  assert.equal(r.erreur, true);
  assert.throws(() => construireEmail({ a: "a@exemple.com\r\nBcc: pirate@exemple.com", sujet: "s", corps: "c" }));
});

test("envoyer_liste_par_email : seulement les articles non cochés", async () => {
  const [lait, pain] = await ajouterCourses(adminId, [
    { nom: "lait", quantite: "2 L" },
    { nom: "pain", quantite: null },
  ]);
  await cocherCourses(adminId, [pain.id], true);
  const r = await outil("envoyer_liste_par_email").executer({ a: "x@exemple.com", sujet: null }, await ctx());
  const [d] = await db.select().from(approvals).where(eq(approvals.id, numero(r.texte)));
  const p = JSON.parse(d.paramsJson);
  assert.equal(p.sujet, "Liste de courses");
  assert.match(p.corps, /- lait \(2 L\)/);
  assert.doesNotMatch(p.corps, /pain/);
  assert.ok(lait);
});

test("creer_pdf crée le fichier dans storage/<userId>/ et prévient", async () => {
  let chemin = "";
  const arreter = ecouter(adminId, (e) => {
    if (e.type === "document") chemin = e.document.chemin;
  });
  const r = await outil("creer_pdf").executer({ titre: "Test Awé", contenu: "# Courses\n- lait\n- œufs\nFin." }, await ctx());
  arreter();
  try {
    assert.equal(r.erreur, false);
    assert.match(chemin.replace(/\\/g, "/"), new RegExp(`/${adminId}/\\d+-test-awe\\.pdf$`));
    assert.ok(chemin.startsWith(process.env.STORAGE_DIR!));
    assert.ok(existsSync(chemin));
  } finally {
    if (chemin) rmSync(chemin, { force: true });
  }
});

test("voix économique : pas de vocal si réponse longue ou voix coupée", () => {
  assert.equal(repondreEnVocal("Court.", true), true);
  assert.equal(repondreEnVocal("x".repeat(601), true), false);
  assert.equal(repondreEnVocal("Court.", false), false);
});
