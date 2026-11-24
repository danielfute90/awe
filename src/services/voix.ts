// =====================================================================
// La voix d'Awé, avec ElevenLabs.
//   - transcrire : note vocale → texte  (modèle Scribe)
//   - synthetiser : texte → note vocale (modèle Flash, le moins cher)
//
// Mode économique (plan gratuit d'ElevenLabs) :
//   - Awé ne répond en vocal QUE si tu lui as parlé en vocal
//   - et seulement si sa réponse est courte (VOIX_MAX_CARACTERES)
//   - /voix off coupe complètement les réponses vocales
// =====================================================================
import { config } from "../config.js";

const API = "https://api.elevenlabs.io/v1";

/** Une erreur dont le message peut être montré tel quel à l'utilisateur. */
export class ErreurVoix extends Error {}

export const voixConfiguree = () => Boolean(config.ELEVENLABS_API_KEY);

/** Traduit les erreurs d'ElevenLabs en phrases claires. */
async function verifierReponse(reponse: Response) {
  if (reponse.ok) return;
  const detail = await reponse.text().catch(() => "");
  if (reponse.status === 401) throw new ErreurVoix("Ma clé ElevenLabs est refusée. Vérifie ELEVENLABS_API_KEY dans le .env.");
  if (/quota|credits|limit/i.test(detail) || reponse.status === 402 || reponse.status === 429) {
    throw new ErreurVoix("Les crédits ElevenLabs du mois sont épuisés (ou trop de demandes d'un coup).");
  }
  throw new Error(`ElevenLabs a répondu ${reponse.status} : ${detail.slice(0, 200)}`);
}

/** Transcrit un fichier audio (ex. note vocale Telegram en .ogg) en texte. */
export async function transcrire(audio: Buffer, nomFichier = "vocal.ogg"): Promise<string> {
  if (!voixConfiguree()) throw new ErreurVoix("La voix n'est pas configurée : ajoute ELEVENLABS_API_KEY dans le .env.");
  const formulaire = new FormData();
  formulaire.append("model_id", config.ELEVENLABS_STT_MODEL);
  formulaire.append("file", new Blob([new Uint8Array(audio)]), nomFichier);

  const reponse = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": config.ELEVENLABS_API_KEY! },
    body: formulaire,
  });
  await verifierReponse(reponse);
  const resultat = (await reponse.json()) as { text?: string };
  return (resultat.text ?? "").trim();
}

/** Lit un texte à voix haute. Renvoie un audio Opus (format des notes vocales Telegram). */
export async function synthetiser(texte: string): Promise<Buffer> {
  if (!voixConfiguree()) throw new ErreurVoix("La voix n'est pas configurée.");
  const reponse = await fetch(`${API}/text-to-speech/${config.ELEVENLABS_VOICE_ID}?output_format=opus_48000_32`, {
    method: "POST",
    headers: { "xi-api-key": config.ELEVENLABS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ text: texte, model_id: config.ELEVENLABS_TTS_MODEL, language_code: "fr" }),
  });
  await verifierReponse(reponse);
  return Buffer.from(await reponse.arrayBuffer());
}

/** Faut-il répondre en vocal ? (règles d'économie) */
export function repondreEnVocal(texte: string, voixActivee: boolean) {
  return voixConfiguree() && voixActivee && texte.length <= config.VOIX_MAX_CARACTERES;
}
