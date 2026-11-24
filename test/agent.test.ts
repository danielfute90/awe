// Test de la boucle de l'agent contre un FAUX serveur Claude (local).
// On vérifie la mécanique sans dépenser de tokens : appel d'outil, renvoi du
// résultat, journal par tour, limite de 15 tours.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

type Requete = { model: string; system: string; tools: { name: string; strict: boolean }[]; messages: unknown[] };
type Reponse = { content: unknown[]; stop_reason: string };

// Le faux serveur répond avec la fonction "repondre" définie par chaque test.
const recues: Requete[] = [];
let repondre: (n: number) => Reponse = () => ({ content: [], stop_reason: "end_turn" });

const serveur: Server = createServer((req, res) => {
  let corps = "";
  req.on("data", (morceau) => (corps += morceau));
  req.on("end", () => {
    recues.push(JSON.parse(corps));
    const { content, stop_reason } = repondre(recues.length);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: `msg_${recues.length}`,
        type: "message",
        role: "assistant",
        model: "claude-test",
        content,
        stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
    );
  });
});
await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_TELEGRAM_ID;

const { db, agentLogs, migrerDb, fermerDb } = await import("../src/db/index.js");
const { assurerAdmin } = await import("../src/services/users.js");
const { listerCourses } = await import("../src/services/courses.js");
const { handleUserMessage } = await import("../src/agent/awe.js");

let adminId: number;
before(async () => {
  await migrerDb();
  adminId = (await assurerAdmin()).id;
});
after(async () => {
  await fermerDb();
  serveur.close();
});

test("Claude appelle un outil, Awé l'exécute et renvoie le résultat", async () => {
  recues.length = 0;
  repondre = (n) =>
    n === 1
      ? {
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "J'ajoute ça." },
            { type: "tool_use", id: "appel_1", name: "ajouter_course", input: { articles: [{ nom: "riz", quantite: "2 kg" }] } },
          ],
        }
      : { stop_reason: "end_turn", content: [{ type: "text", text: "C'est ajouté : riz (2 kg)." }] };

  const reponse = await handleUserMessage(adminId, "Ajoute 2 kg de riz", "web");

  assert.equal(reponse, "C'est ajouté : riz (2 kg).");
  assert.deepEqual(
    (await listerCourses(adminId)).map((a) => [a.nom, a.quantite]),
    [["riz", "2 kg"]],
  );

  // 1re requête : prompt de Awé, outils stricts, et le message de l'utilisateur.
  const [premiere, seconde] = recues;
  assert.match(premiere.system, /Tu es Awé/);
  assert.ok(premiere.tools.every((t) => t.strict));
  // 2e requête : la réponse de Claude puis le résultat de l'outil, lié au bon appel.
  const dernier = seconde.messages.at(-1) as { role: string; content: { type: string; tool_use_id: string; is_error: boolean }[] };
  assert.equal(dernier.role, "user");
  assert.equal(dernier.content[0].type, "tool_result");
  assert.equal(dernier.content[0].tool_use_id, "appel_1");
  assert.equal(dernier.content[0].is_error, false);

  // Journal : 2 tours du modèle + 1 appel d'outil, avec les tokens.
  const logs = await db.select().from(agentLogs);
  assert.equal(logs.filter((l) => l.outil === null).length, 2);
  assert.equal(logs.filter((l) => l.outil === "ajouter_course").length, 1);
  assert.equal(logs.reduce((s, l) => s + l.tokensIn, 0), 200);
});

test("au-delà de 15 tours, Awé s'arrête et l'explique", async () => {
  recues.length = 0;
  repondre = (n) => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: `appel_${n}`, name: "voir_liste", input: {} }],
  });

  const reponse = await handleUserMessage(adminId, "Boucle infinie", "web");
  assert.match(reponse, /plus de 15 étapes/);
  assert.equal(recues.length, 15);
});

test("un outil inconnu demandé par le modèle est refusé", async () => {
  recues.length = 0;
  repondre = (n) =>
    n === 1
      ? { stop_reason: "tool_use", content: [{ type: "tool_use", id: "x", name: "supprimer_email", input: {} }] }
      : { stop_reason: "end_turn", content: [{ type: "text", text: "Je ne peux pas." }] };

  await handleUserMessage(adminId, "Supprime mes mails", "web");
  const resultat = (recues[1].messages.at(-1) as { content: { content: string; is_error: boolean }[] }).content[0];
  assert.equal(resultat.is_error, true);
  assert.match(resultat.content, /REFUSÉ/);
});
