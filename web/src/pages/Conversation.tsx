// =====================================================================
// Conversation : tout le fil (Telegram + web), la zone de saisie, la
// mascotte en direct, et les validations en attente dans le fil.
// =====================================================================
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Demande, type Message } from "../api";
import { CarteDemande } from "../composants/CarteDemande";
import { IconeEnvoyer, IconeSource } from "../composants/icones";
import { LIBELLES_ETAT, Mascotte } from "../composants/Mascotte";
import { BandeFluo, Bouton, formaterDate } from "../composants/ui";
import { useAwe, useDonnees } from "../contexte";

/** Fusionne des messages sans doublon, triés par numéro. */
const fusionner = (a: Message[], b: Message[]) =>
  [...new Map([...a, ...b].map((m) => [m.id, m])).values()].sort((x, y) => x.id - y.id);

export function PageConversation() {
  const { moi, etat, abonner, notifier } = useAwe();
  const [messages, setMessages] = useState<Message[]>([]);
  const [plusAnciens, setPlusAnciens] = useState(true);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const bas = useRef<HTMLDivElement>(null);
  const { donnees: validations, recharger: rechargerValidations } = useDonnees(
    () => api<{ enAttente: Demande[] }>("/api/approvals"),
    ["approbation", "approbation_maj"],
  );

  // Chargement initial, puis les nouveaux messages arrivent en direct (même ceux de Telegram).
  useEffect(() => {
    api<Message[]>("/api/messages").then((m) => {
      setMessages(m);
      setPlusAnciens(m.length === 50);
    });
    return abonner((e) => {
      if (e.type === "message") setMessages((liste) => fusionner(liste, [e.message]));
    });
  }, [abonner]);

  // Défile en bas quand un message arrive.
  const dernierId = messages.at(-1)?.id;
  // (Accolades obligatoires : un effet ne doit rien renvoyer d'autre qu'une fonction de nettoyage.)
  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth" });
  }, [dernierId, validations?.enAttente.length]);

  const chargerPlusAnciens = async () => {
    const anciens = await api<Message[]>(`/api/messages?avant=${messages[0]?.id ?? ""}`);
    setMessages((liste) => fusionner(anciens, liste));
    setPlusAnciens(anciens.length === 50);
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu || envoi) return;
    setEnvoi(true);
    setTexte("");
    try {
      await api("/api/messages", { methode: "POST", corps: { texte: contenu } });
      // Au cas où la connexion temps réel aurait raté quelque chose :
      setMessages(fusionner(messages, await api<Message[]>("/api/messages")));
    } catch (err) {
      notifier(err instanceof Error ? err.message : "Envoi impossible");
      setTexte(contenu);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* En-tête : la mascotte et son état en direct */}
      <div className="mb-6 flex items-center gap-4">
        <Mascotte etat={etat} taille={64} />
        <div>
          <h1 className="inline-block -rotate-[1.5deg] rounded-2xl bg-encre px-4 py-1.5 font-titre text-2xl font-extrabold text-white">
            Salut {moi.prenom}
          </h1>
          <BandeFluo className="ml-2 mt-2 -rotate-[1.5deg]" />
          <p className="mt-2 text-sm text-gris">Awé : {LIBELLES_ETAT[etat]}</p>
        </div>
      </div>

      {plusAnciens && messages.length > 0 && (
        <button onClick={chargerPlusAnciens} className="mb-4 self-center text-sm font-medium text-gris underline">
          Messages plus anciens
        </button>
      )}
      {messages.length === 0 && <p className="py-10 text-center text-gris">Dis bonjour à Awé : il te répond ici et sur Telegram.</p>}

      {/* Le fil */}
      <ol className="flex flex-col gap-3">
        {messages.map((m) => {
          const moiQuiParle = m.role === "user";
          return (
            <li key={m.id} className={`flex flex-col ${moiQuiParle ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[22px] px-4 py-3 ${
                  moiQuiParle ? "rounded-br-md bg-encre text-white" : "ombre-douce rounded-bl-md bg-carte"
                }`}
              >
                {m.texte}
              </div>
              <span className="mt-1 flex items-center gap-1 px-2 text-[11px] text-gris" title={m.source === "telegram" ? "Envoyé depuis Telegram" : "Envoyé depuis le web"}>
                <IconeSource source={m.source} />
                {formaterDate(m.createdAt, moi.fuseau)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Validations en attente, dans le fil */}
      {validations?.enAttente.map((d) => (
        <div key={d.id} className="mt-4">
          <CarteDemande demande={d} apres={rechargerValidations} />
        </div>
      ))}

      {envoi && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gris">
          <Mascotte etat={etat === "dispo" ? "reflechit" : etat} taille={28} /> {LIBELLES_ETAT[etat === "dispo" ? "reflechit" : etat]}
        </div>
      )}
      <div ref={bas} />

      {/* Zone de saisie, collée en bas */}
      <form
        onSubmit={envoyer}
        // Sur mobile, le fond descend jusque sous la barre d'onglets : aucun message ne dépasse.
        className="sticky bottom-0 -mx-4 -mb-24 mt-6 flex items-end gap-2 bg-fond/95 px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mb-6 md:pb-4"
      >
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) void envoyer(e);
          }}
          rows={1}
          maxLength={4000}
          placeholder="Écris à Awé..."
          aria-label="Message pour Awé"
          className="ombre-douce max-h-40 min-h-[52px] flex-1 resize-none rounded-[26px] border border-encre/10 bg-carte px-5 py-3.5 outline-none focus:border-encre"
        />
        <Bouton type="submit" disabled={envoi || !texte.trim()} className="h-[52px] w-[52px] !p-0 grid place-items-center" aria-label="Envoyer">
          <IconeEnvoyer />
        </Bouton>
      </form>
    </div>
  );
}
