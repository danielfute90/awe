// Tests de la phase 2 : outils, permissions, journal, rappels, limites.
// Aucun appel réel à OpenAI : on teste tout ce qui entoure le modèle.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { z } from "zod";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
for (const cle of ["TELEGRAM_BOT_TOKEN", "ADMIN_TELEGRAM_ID", "ANTHROPIC_API_KEY"]) {
  delete process.env[cle];
}

const { config } = await import("../src/config.js");
const { db, users, agentLogs, reminders, migrerDb, fermerDb } = await import("../src/db/index.js");
const { eq } = await import("drizzle-orm");
const { assurerAdmin } = await import("../src/services/users.js");
const { heureLocaleVersUtc, debutDeJournee } = await import("../src/services/temps.js");
const courses = await import("../src/services/courses.js");
const { envoyerRappelsEchus } = await import("../src/services/rappels.js");
const { derniersMessages } = await import("../src/services/messages.js");
const { ecouter } = await import("../src/services/events.js");
const { verifierPermission } = await import("../src/security/permissions.js");
const { tokensUtilisesAujourdhui, budgetDepasse } = await import("../src/security/limits.js");
const { definirOutil } = await import("../src/tools/definir.js");
const { ajouterCourse, retirerCourse } = await import("../src/tools/courses.js");
const { outilsPour } = await import("../src/tools/index.js");
const { creerRappelOutil } = await import("../src/tools/rappels.js");
const { handleUserMessage } = await import("../src/agent/awe.js");

type Utilisateur = Awaited<ReturnType<typeof assurerAdmin>>;
let admin: Utilisateur;
let autre: Utilisateur;

/** Le contexte qu'aurait un outil pendant une vraie tâche. */
const contexte = (utilisateur: Utilisateur, tacheId = "tache-test") => ({
  utilisateur,
  tacheId,
  source: "web" as const,
  etape: 0,
});

const logsDeLaTache = (tacheId: string) => db.select().from(agentLogs).where(eq(agentLogs.tacheId, tacheId));

before(async () => {
  await migrerDb();
  admin = await assurerAdmin();
  [autre] = await db.insert(users).values({ telegramId: "222", prenom: "Awa", role: "membre" }).returning();
});

after(async () => {
  await fermerDb();
});

// --- Dates -------------------------------------------------------------
test("heure locale → UTC, heure d'été et d'hiver", () => {
  assert.equal(heureLocaleVersUtc("2026-07-01T09:00", "Europe/Paris")?.toISOString(), "2026-07-01T07:00:00.000Z");
  assert.equal(heureLocaleVersUtc("2026-12-01T09:00", "Europe/Paris")?.toISOString(), "2026-12-01T08:00:00.000Z");
  assert.equal(heureLocaleVersUtc("2026-12-01T09:00", "Africa/Abidjan")?.toISOString(), "2026-12-01T09:00:00.000Z");
  assert.equal(heureLocaleVersUtc("demain 9h", "Europe/Paris"), null);
});

test("début de journée dans le fuseau de l'utilisateur", () => {
  const debut = debutDeJournee("Europe/Paris", new Date("2026-11-15T10:00:00Z"));
  assert.equal(debut.toISOString(), "2026-11-14T23:00:00.000Z");
});

// --- Courses -----------------------------------------------------------
test("les courses sont isolées entre utilisateurs", async () => {
  const [pain] = await courses.ajouterCourses(admin.id, [{ nom: "pain", quantite: null }]);
  // Awa ne peut ni voir, ni cocher, ni supprimer le pain de l'admin.
  assert.equal((await courses.listerCourses(autre.id)).length, 0);
  assert.equal((await courses.cocherCourses(autre.id, [pain.id], true)).length, 0);
  assert.equal((await courses.retirerCourses(autre.id, [pain.id])).length, 0);
  // L'admin, oui.
  assert.equal((await courses.cocherCourses(admin.id, [pain.id], true))[0].fait, true);
  assert.equal((await courses.retirerCourses(admin.id, [pain.id])).length, 1);
});

test("l'outil ajouter_course écrit pour le bon utilisateur et se journalise", async () => {
  const resultat = await ajouterCourse.executer(
    { articles: [{ nom: "lait", quantite: "2" }, { nom: "œufs", quantite: "6" }] },
    contexte(autre, "tache-courses"),
  );
  assert.equal(resultat.erreur, false);
  assert.match(resultat.texte, /lait/);
  assert.deepEqual(
    (await courses.listerCourses(autre.id)).map((a) => a.nom),
    ["lait", "œufs"],
  );

  const [ligne] = await logsDeLaTache("tache-courses");
  assert.equal(ligne.outil, "ajouter_course");
  assert.equal(ligne.userId, autre.id);
  assert.equal(ligne.erreur, null);
  assert.ok(ligne.dureeMs !== null);
});

// --- Permissions -------------------------------------------------------
test("registre des permissions", () => {
  assert.deepEqual(verifierPermission("voir_liste", "membre"), { autorise: true, niveau: "auto" });
  assert.deepEqual(verifierPermission("envoyer_email", "membre"), { autorise: true, niveau: "approval" });
  assert.equal(verifierPermission("supprimer_email", "admin").autorise, false);
  assert.equal(verifierPermission("chercher_emails", "invite").autorise, false);
  assert.equal(verifierPermission("outil_invente", "admin").autorise, false);
});

test("un outil interdit n'est jamais exécuté, et le refus est journalisé", async () => {
  let execute = false;
  const supprimer = definirOutil({
    nom: "supprimer_email",
    description: "test",
    parametres: z.object({ id: z.string() }),
    executer: async () => {
      execute = true;
      return "supprimé";
    },
  });
  const resultat = await supprimer.executer({ id: "abc" }, contexte(admin, "tache-interdite"));
  assert.match(resultat.texte, /^REFUSÉ/);
  assert.equal(resultat.erreur, true);
  assert.equal(execute, false);
  const [ligne] = await logsDeLaTache("tache-interdite");
  assert.match(String(ligne.erreur), /interdite/);
});

test("des paramètres invalides venant du modèle sont rejetés avant exécution", async () => {
  const resultat = await retirerCourse.executer({ ids: [] }, contexte(admin));
  assert.equal(resultat.erreur, true);
  assert.match(resultat.texte, /paramètres invalides/);
});

test("les schémas envoyés à Claude respectent le mode strict", () => {
  const schemas = JSON.stringify(outilsPour("admin").map((o) => o.definition));
  // Contraintes non supportées par l'API retirées (zod les vérifie quand même côté serveur)
  assert.doesNotMatch(schemas, /minItems|minimum|maximum|\$schema/);
  for (const { definition } of outilsPour("admin")) {
    assert.equal(definition.strict, true);
    assert.equal(definition.input_schema.additionalProperties, false);
  }
});

// --- Rappels -----------------------------------------------------------
test("creer_rappel refuse une date passée et accepte une date future", async () => {
  const passe = await creerRappelOutil.executer({ texte: "x", quand: "2020-01-01T09:00" }, contexte(admin));
  assert.match(passe.texte, /^ERREUR/);

  const futur = await creerRappelOutil.executer({ texte: "Appeler maman", quand: "2099-01-01T18:00" }, contexte(admin));
  assert.match(futur.texte, /Appeler maman/);
});

test("un rappel échu est envoyé une seule fois", async () => {
  // On fait comme si l'heure du rappel était arrivée.
  await db.update(reminders).set({ dueAt: new Date(Date.now() - 1000) }).where(eq(reminders.userId, admin.id));

  const recus: string[] = [];
  const arreter = ecouter(admin.id, (e) => {
    if (e.type === "rappel") recus.push(e.rappel.texte);
  });
  assert.equal(await envoyerRappelsEchus(), 1);
  assert.equal(await envoyerRappelsEchus(), 0); // pas de doublon
  arreter();

  assert.deepEqual(recus, ["Appeler maman"]);
  const messages = await derniersMessages(admin.id);
  assert.equal(messages.at(-1)?.texte, "Rappel : Appeler maman");
});

// --- Agent et limites --------------------------------------------------
test("sans clé Claude, Awé l'explique au lieu de planter", async () => {
  const reponse = await handleUserMessage(admin.id, "Bonjour", "web");
  assert.match(reponse, /ANTHROPIC_API_KEY/);
  const [question, reponseEnregistree] = (await derniersMessages(admin.id)).slice(-2);
  assert.equal(question.texte, "Bonjour");
  assert.equal(reponseEnregistree.role, "assistant");
});

test("budget du jour dépassé : un membre est arrêté, l'admin jamais", async () => {
  config.ANTHROPIC_API_KEY = "sk-ant-test"; // le budget est vérifié AVANT tout appel à l'API
  config.DAILY_TOKEN_LIMIT = 1000;
  const [membre] = await db.insert(users).values({ prenom: "Membre", role: "membre" }).returning();
  for (const u of [membre, admin]) {
    await db.insert(agentLogs).values({ userId: u.id, tacheId: "ancienne", etape: 1, tokensIn: 700, tokensOut: 400 });
  }

  assert.equal(await tokensUtilisesAujourdhui(membre.id, membre.fuseau), 1100);
  const reponse = await handleUserMessage(membre.id, "Ajoute du pain", "web");
  assert.match(reponse, /budget du jour/);

  const budgetAdmin = await budgetDepasse(admin);
  assert.equal(budgetAdmin.depasse, false);
  assert.equal(budgetAdmin.illimite, true);
});
