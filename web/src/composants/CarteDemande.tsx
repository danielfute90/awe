// =====================================================================
// Carte d'une demande de validation : les valeurs EXACTES qui seront
// envoyées, l'avertissement éventuel, le compte à rebours, et les boutons.
// =====================================================================
import { useEffect, useState } from "react";
import { api, type Demande } from "../api";
import { useAwe } from "../contexte";
import { Bouton, Pastille } from "./ui";

function useCompteARebours(fin: string) {
  const [reste, setReste] = useState(() => new Date(fin).getTime() - Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setReste(new Date(fin).getTime() - Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [fin]);
  return Math.max(0, reste);
}

export function CarteDemande({ demande, apres }: { demande: Demande; apres?: () => void }) {
  const { notifier } = useAwe();
  const [enCours, setEnCours] = useState(false);
  const reste = useCompteARebours(demande.expiresAt);
  const minutes = Math.floor(reste / 60000);
  const secondes = Math.floor((reste % 60000) / 1000).toString().padStart(2, "0");

  const agir = async (action: "approve" | "cancel") => {
    setEnCours(true);
    try {
      const { texte } = await api<{ texte: string }>(`/api/approvals/${demande.id}/${action}`, { methode: "POST" });
      notifier(texte);
      apres?.();
    } catch (err) {
      notifier(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <article className="rounded-[26px] border-2 border-accent bg-carte p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-titre font-bold italic">Awé attend ta validation · n°{demande.id}</p>
        <Pastille ton={reste < 60000 ? "danger" : "clair"}>{reste > 0 ? `expire dans ${minutes}:${secondes}` : "expirée"}</Pastille>
      </div>
      {demande.avertissement && (
        <p className="mt-3 rounded-2xl bg-danger/10 p-3 text-sm font-medium text-danger">{demande.avertissement}</p>
      )}
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-fond p-4 font-texte text-sm">{demande.apercu}</pre>
      <div className="mt-4 flex flex-wrap gap-2">
        <Bouton onClick={() => agir("approve")} disabled={enCours || reste === 0}>
          Valider et envoyer
        </Bouton>
        <Bouton variante="discret" onClick={() => agir("cancel")} disabled={enCours || reste === 0}>
          Annuler
        </Bouton>
      </div>
      <p className="mt-3 text-xs text-gris">Pour modifier : annule, puis dis à Awé ce que tu veux changer.</p>
    </article>
  );
}
