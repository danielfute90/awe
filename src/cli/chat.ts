// =====================================================================
// pnpm chat : parler à Awé depuis le terminal (sans Telegram).
// Utilise exactement le même cerveau (handleUserMessage) que Telegram et le web.
// Les messages apparaîtront aussi dans l'interface web (source "web").
// =====================================================================
import { createInterface } from "node:readline/promises";

// Pas de logs techniques au milieu de la conversation : Awé explique lui-même les erreurs,
// et le détail reste dans la table agent_logs. Pour les voir quand même :
//   $env:LOG_LEVEL="error"; pnpm chat
process.env.LOG_LEVEL ??= "silent";

// Imports "dynamiques" : ils doivent se faire APRÈS le réglage du niveau de log.
const { migrerDb, fermerDb } = await import("../db/index.js");
const { assurerAdmin } = await import("../services/users.js");
const { handleUserMessage } = await import("../agent/awe.js");
const { demarrerRappels } = await import("../services/rappels.js");
const { ecouter } = await import("../services/events.js");
const { messageConnexion, messageDeconnexion } = await import("../services/gmail.js");
const { decider } = await import("../services/approbations.js");
type Decision = import("../services/approbations.js").Decision;

await migrerDb();
const moi = await assurerAdmin();

// Les rappels s'affichent dans le terminal quand ils arrivent.
const arreterRappels = demarrerRappels();
ecouter(moi.id, (evenement) => {
  if (evenement.type === "rappel") console.log(`\n[RAPPEL] ${evenement.rappel.texte}\nToi > `);
  if (evenement.type === "notification") console.log(`\n[INFO] ${evenement.texte}\nToi > `);
  if (evenement.type === "document") console.log(`\n[PDF] ${evenement.document.titre} (n°${evenement.document.id}, rangé dans la base)\n`);
  if (evenement.type === "approbation") {
    const d = evenement.approbation;
    console.log(`\n----- VALIDATION DEMANDÉE (n°${d.id}) -----`);
    if (d.avertissement) console.log(d.avertissement);
    console.log(`${d.apercu}\n-----------------------------------------`);
    console.log(`Tape /valider ${d.id}, /modifier ${d.id} ou /annuler ${d.id} (valable 10 minutes).\n`);
  }
});

console.log(`Conversation avec Awé (compte : ${moi.prenom}). Tape /quitter pour sortir.`);
console.log("Commandes : /connecter_gmail, /deconnecter_gmail, /valider N, /modifier N, /annuler N, /quitter\n");
const terminal = createInterface({ input: process.stdin, output: process.stdout });

while (true) {
  let texte: string;
  try {
    texte = (await terminal.question("Toi > ")).trim();
  } catch {
    break; // Ctrl+C / fin de saisie
  }
  if (texte === "/quitter") break;
  if (!texte) continue;

  // Commandes Gmail (comme sur Telegram).
  if (texte === "/connecter_gmail") {
    console.log(`${await messageConnexion(moi.id)}\n`);
    continue;
  }
  if (texte === "/deconnecter_gmail") {
    console.log(`${await messageDeconnexion(moi.id)}\n`);
    continue;
  }
  // Validation d'une demande : /valider 3, /modifier 3, /annuler 3
  const validation = texte.match(/^\/(valider|modifier|annuler)\s+(\d+)$/);
  if (validation) {
    console.log(`Awé > ${await decider(moi.id, Number(validation[2]), validation[1] as Decision, "web")}\n`);
    continue;
  }
  // "pnpm ..." est une commande pour le terminal, pas une phrase pour Awé.
  if (/^pnpm\s/.test(texte)) {
    console.log("C'est une commande pour le terminal : tape d'abord /quitter, puis lance-la.\n");
    continue;
  }

  console.log("Awé réfléchit...");
  const reponse = await handleUserMessage(moi.id, texte, "web");
  console.log(`Awé > ${reponse}\n`);
}

terminal.close();
arreterRappels();
await fermerDb();
