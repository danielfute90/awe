// =====================================================================
// État partagé de l'interface : l'utilisateur connecté, l'état d'Awé, et
// le flux d'événements en direct (SSE) auquel chaque page peut s'abonner.
// =====================================================================
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, definirCsrf, type EtatAwe, type Evenement, type Moi } from "./api";

type Ecouteur = (e: Evenement) => void;

type Contexte = {
  moi: Moi;
  rafraichirMoi: () => Promise<void>;
  etat: EtatAwe;
  enDirect: boolean; // la connexion temps réel est-elle ouverte ?
  /** S'abonne aux événements en direct. Renvoie la fonction de désabonnement. */
  abonner: (ecouteur: Ecouteur) => () => void;
  notifier: (texte: string) => void;
};

const ContexteAwe = createContext<Contexte | null>(null);

export function useAwe() {
  const c = useContext(ContexteAwe);
  if (!c) throw new Error("useAwe doit être utilisé dans <FournisseurAwe>");
  return c;
}

/** Recharge une donnée quand certains événements arrivent (ex. la liste quand "courses" arrive). */
export function useDonnees<T>(charger: () => Promise<T>, types: Evenement["type"][]) {
  const { abonner, notifier } = useAwe();
  const [donnees, setDonnees] = useState<T | null>(null);
  const chargerRef = useRef(charger);
  chargerRef.current = charger;

  const recharger = useCallback(async () => {
    try {
      setDonnees(await chargerRef.current());
    } catch (err) {
      notifier(err instanceof Error ? err.message : "Erreur de chargement");
    }
  }, [notifier]);

  useEffect(() => {
    void recharger();
    return abonner((e) => {
      if (types.includes(e.type)) void recharger();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abonner, recharger, types.join()]);

  return { donnees, recharger };
}

export function FournisseurAwe({ moiInitial, children }: { moiInitial: Moi; children: ReactNode }) {
  const [moi, setMoi] = useState(moiInitial);
  const [etat, setEtat] = useState<EtatAwe>("dispo");
  const [enDirect, setEnDirect] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; texte: string }[]>([]);
  const ecouteurs = useRef(new Set<Ecouteur>());

  const notifier = useCallback((texte: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, texte }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const rafraichirMoi = useCallback(async () => {
    const m = await api<Moi>("/api/me");
    definirCsrf(m.csrf);
    setMoi(m);
  }, []);

  const abonner = useCallback((ecouteur: Ecouteur) => {
    ecouteurs.current.add(ecouteur);
    return () => void ecouteurs.current.delete(ecouteur);
  }, []);

  // Connexion temps réel : le navigateur se reconnecte tout seul si elle coupe.
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onopen = () => setEnDirect(true);
    source.onerror = () => setEnDirect(false);
    source.onmessage = (m) => {
      const e = JSON.parse(m.data) as Evenement;
      if (e.type === "etat") setEtat(e.etat);
      if (e.type === "rappel") notifier(`Rappel : ${e.rappel.texte}`);
      if (e.type === "notification") notifier(e.texte);
      if (e.type === "approbation") setEtat("attend_validation");
      if (e.type === "notification" && /Gmail/.test(e.texte)) void rafraichirMoi();
      ecouteurs.current.forEach((f) => f(e));
    };
    return () => source.close();
  }, [notifier, rafraichirMoi]);

  return (
    <ContexteAwe.Provider value={{ moi, rafraichirMoi, etat, enDirect, abonner, notifier }}>
      {children}
      {/* Notifications en bas à droite (au-dessus de la barre d'onglets sur mobile) */}
      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-end gap-2 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="ombre-douce max-w-sm rounded-2xl bg-encre px-4 py-3 text-sm text-white">
            {t.texte}
          </div>
        ))}
      </div>
    </ContexteAwe.Provider>
  );
}
