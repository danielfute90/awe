// Courses : cases à cocher, ajout, suppression. Synchronisé en direct avec Telegram.
import { useState, type FormEvent } from "react";
import { api, type Article } from "../api";
import { IconePoubelle } from "../composants/icones";
import { Bouton, Carte, Titre, Vide } from "../composants/ui";
import { useAwe, useDonnees } from "../contexte";

export function PageCourses() {
  const { notifier } = useAwe();
  const { donnees: articles, recharger } = useDonnees(() => api<Article[]>("/api/shopping"), ["courses"]);
  const [nom, setNom] = useState("");
  const [quantite, setQuantite] = useState("");

  // Chaque action : on prévient le serveur, puis on recharge (l'événement "courses" le fait aussi).
  const agir = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await recharger();
    } catch (err) {
      notifier(err instanceof Error ? err.message : "Erreur");
    }
  };

  const ajouter = (e: FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return;
    void agir(() => api("/api/shopping", { methode: "POST", corps: { nom, quantite: quantite || null } }));
    setNom("");
    setQuantite("");
  };

  const restants = articles?.filter((a) => !a.fait).length ?? 0;

  return (
    <>
      <Titre sous={articles ? `${restants} article${restants > 1 ? "s" : ""} à acheter` : undefined}>Courses</Titre>

      <Carte>
        <form onSubmit={ajouter} className="flex flex-wrap gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Article (ex. lait)"
            aria-label="Article"
            maxLength={100}
            className="min-w-0 flex-[2] rounded-full border border-encre/15 bg-white px-4 py-2.5 outline-none focus:border-encre"
          />
          <input
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            placeholder="Quantité"
            aria-label="Quantité"
            maxLength={50}
            className="min-w-0 flex-1 rounded-full border border-encre/15 bg-white px-4 py-2.5 outline-none focus:border-encre"
          />
          <Bouton type="submit" disabled={!nom.trim()}>
            Ajouter
          </Bouton>
        </form>

        {articles?.length === 0 && <Vide>La liste est vide. Ajoute un article ici, ou demande à Awé.</Vide>}
        <ul className="mt-4 divide-y divide-encre/8">
          {articles?.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                checked={a.fait}
                onChange={() => agir(() => api(`/api/shopping/${a.id}`, { methode: "PATCH", corps: { fait: !a.fait } }))}
                aria-label={`${a.nom} : acheté`}
                className="h-5 w-5 shrink-0 accent-encre"
              />
              <span className={`flex-1 ${a.fait ? "text-gris line-through" : ""}`}>
                {a.nom}
                {a.quantite && <span className="ml-2 rounded-full bg-accent-clair px-2 py-0.5 text-xs font-semibold text-accent-fonce">{a.quantite}</span>}
              </span>
              <button
                onClick={() => agir(() => api(`/api/shopping/${a.id}`, { methode: "DELETE" }))}
                aria-label={`Supprimer ${a.nom}`}
                className="rounded-full p-2 text-gris hover:bg-encre/6 hover:text-encre"
              >
                <IconePoubelle />
              </button>
            </li>
          ))}
        </ul>
      </Carte>
    </>
  );
}
