// Connexions : l'état de Gmail (et de Telegram), avec Connecter / Déconnecter.
import { useState } from "react";
import { api } from "../api";
import { Bouton, Carte, Etiquette, formaterDate, Pastille, Titre } from "../composants/ui";
import { useAwe } from "../contexte";

export function PageConnexions() {
  const { moi, rafraichirMoi, notifier } = useAwe();
  const [enCours, setEnCours] = useState(false);
  const { gmail } = moi;

  const deconnecter = async () => {
    if (!confirm("Déconnecter Gmail ? Awé ne pourra plus lire ni envoyer d'emails.")) return;
    setEnCours(true);
    try {
      notifier((await api<{ texte: string }>("/api/gmail/disconnect", { methode: "POST" })).texte);
      await rafraichirMoi();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Titre sous="Les services qu'Awé peut utiliser pour toi.">Connexions</Titre>

      <div className="flex flex-col gap-4">
        <Carte>
          <div className="flex items-center justify-between gap-3">
            <Etiquette>Gmail</Etiquette>
            <Pastille ton={gmail.email ? "accent" : "gris"}>{gmail.email ? "Connecté" : "Non connecté"}</Pastille>
          </div>
          {gmail.email ? (
            <>
              <p className="text-lg font-medium">{gmail.email}</p>
              {gmail.connecteLe && <p className="mt-1 text-sm text-gris">Connecté le {formaterDate(gmail.connecteLe, moi.fuseau)}</p>}
              <p className="mt-3 text-sm text-gris">
                Awé peut lire tes emails et en envoyer après ta validation. Il ne peut pas en supprimer. Tant que l'appli Google
                est « en test », Google coupe l'accès au bout de 7 jours : il suffit de reconnecter.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="/api/gmail/connect" className="rounded-full bg-encre/6 px-5 py-2.5 font-semibold hover:bg-encre/12">
                  Reconnecter
                </a>
                <Bouton variante="danger" onClick={deconnecter} disabled={enCours}>
                  Déconnecter
                </Bouton>
              </div>
            </>
          ) : gmail.configure ? (
            <>
              <p className="text-gris">Connecte ta boîte pour qu'Awé puisse lire, résumer et envoyer tes emails.</p>
              <a href="/api/gmail/connect" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-fonce">
                Connecter Gmail
              </a>
            </>
          ) : (
            <p className="text-gris">Gmail n'est pas configuré sur le serveur (variables GOOGLE_… et ENCRYPTION_KEY du .env).</p>
          )}
        </Carte>

        <Carte>
          <div className="flex items-center justify-between gap-3">
            <Etiquette>Telegram</Etiquette>
            <Pastille ton={moi.telegram ? "accent" : "gris"}>{moi.telegram ? "Relié" : "Non relié"}</Pastille>
          </div>
          <p className="text-gris">
            {moi.telegram
              ? "Tu reçois les rappels, les validations et les PDF sur Telegram. La conversation est la même ici et là-bas."
              : "Ton compte n'est pas relié à Telegram (ADMIN_TELEGRAM_ID dans le .env)."}
          </p>
        </Carte>
      </div>
    </>
  );
}
