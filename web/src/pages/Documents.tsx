// Documents : les PDF créés par Awé, avec aperçu et téléchargement.
import { useState } from "react";
import { api, type Document } from "../api";
import { Bouton, Carte, formaterDate, Titre, Vide } from "../composants/ui";
import { useAwe, useDonnees } from "../contexte";

export function PageDocuments() {
  const { moi } = useAwe();
  const { donnees: documents } = useDonnees(() => api<Document[]>("/api/documents"), ["document"]);
  const [apercu, setApercu] = useState<Document | null>(null);

  return (
    <>
      <Titre sous="Demande à Awé : « Fais-moi un PDF de ma liste de courses »">Documents</Titre>

      <Carte>
        {documents?.length === 0 && <Vide>Aucun PDF pour l'instant.</Vide>}
        <ul className="divide-y divide-encre/8">
          {documents?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-clair font-titre text-xs font-extrabold text-accent-fonce">PDF</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.titre}</p>
                <p className="text-xs text-gris">{formaterDate(d.createdAt, moi.fuseau)}</p>
              </div>
              <div className="flex gap-2">
                <Bouton variante="discret" onClick={() => setApercu(apercu?.id === d.id ? null : d)}>
                  {apercu?.id === d.id ? "Fermer" : "Aperçu"}
                </Bouton>
                <a href={`/api/documents/${d.id}/file?telecharger=1`} className="rounded-full bg-encre px-5 py-2.5 font-semibold text-white hover:bg-encre/85">
                  Télécharger
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Carte>

      {apercu && (
        <Carte className="mt-6 !p-2">
          <iframe title={`Aperçu de ${apercu.titre}`} src={`/api/documents/${apercu.id}/file`} className="h-[70vh] w-full rounded-[20px] bg-white" />
        </Carte>
      )}
    </>
  );
}
