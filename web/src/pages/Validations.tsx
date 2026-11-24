// Validations : les demandes en attente (avec compte à rebours) et l'historique.
import { api, type Demande, type DemandePassee } from "../api";
import { CarteDemande } from "../composants/CarteDemande";
import { Carte, Etiquette, formaterDate, Pastille, Titre, Vide } from "../composants/ui";
import { useAwe, useDonnees } from "../contexte";

const STATUTS: Record<string, { texte: string; ton: "accent" | "gris" | "danger" }> = {
  validee: { texte: "Validée", ton: "accent" },
  annulee: { texte: "Annulée", ton: "gris" },
  expiree: { texte: "Expirée", ton: "gris" },
};

export function PageValidations() {
  const { moi } = useAwe();
  const { donnees, recharger } = useDonnees(
    () => api<{ enAttente: Demande[]; historique: DemandePassee[] }>("/api/approvals"),
    ["approbation", "approbation_maj"],
  );

  return (
    <>
      <Titre sous="Rien n'est envoyé sans ton accord. Une demande expire au bout de 10 minutes.">Validations</Titre>

      <div className="flex flex-col gap-4">
        {donnees?.enAttente.length === 0 && (
          <Carte>
            <Vide>Aucune demande en attente.</Vide>
          </Carte>
        )}
        {donnees?.enAttente.map((d) => <CarteDemande key={d.id} demande={d} apres={recharger} />)}
      </div>

      <Carte className="mt-8">
        <Etiquette>Historique</Etiquette>
        {donnees?.historique.length === 0 && <Vide>Pas encore d'historique.</Vide>}
        <ul className="divide-y divide-encre/8">
          {donnees?.historique.map((d) => {
            const s = STATUTS[d.statut] ?? { texte: d.statut, ton: "gris" as const };
            return (
              <li key={d.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{d.apercu.split("\n").slice(0, 2).join(" · ")}</p>
                  <Pastille ton={s.ton}>{s.texte}</Pastille>
                </div>
                <p className="mt-1 text-xs text-gris">
                  n°{d.id} · {formaterDate(d.createdAt, moi.fuseau)}
                  {d.resultat && ` · ${d.resultat}`}
                </p>
              </li>
            );
          })}
        </ul>
      </Carte>
    </>
  );
}
