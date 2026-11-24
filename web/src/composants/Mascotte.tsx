// La mascotte d'Awé : un rond bleu vif avec deux grands yeux. Elle bouge selon l'état (animations dans index.css).
import type { EtatAwe } from "../api";

export const LIBELLES_ETAT: Record<EtatAwe, string> = {
  dispo: "Dispo",
  reflechit: "Réfléchit...",
  travaille: "Travaille...",
  attend_validation: "Attend ta validation",
};

const BLEU = "#2563EB"; // = --color-accent dans index.css
const BLEU_CLAIR = "#DBEAFE"; // = --color-accent-clair
const NUIT = "#0F172A"; // = --color-encre

export function Mascotte({ etat = "dispo", taille = 64 }: { etat?: EtatAwe; taille?: number }) {
  // Les yeux regardent vers le haut quand Awé réfléchit.
  const yeuxY = etat === "reflechit" ? 25 : 29;
  return (
    <svg
      className={`etat-${etat} shrink-0 overflow-visible`}
      width={taille}
      height={taille}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Awé : ${LIBELLES_ETAT[etat]}`}
    >
      {etat === "attend_validation" && <circle className="mascotte-halo" cx="32" cy="32" r="28" fill={BLEU_CLAIR} />}
      <g className="mascotte-corps">
        <circle cx="32" cy="32" r="28" fill={BLEU} />
        <g className="mascotte-yeux">
          {/* Blanc des yeux, puis pupilles */}
          <ellipse cx="23.5" cy={yeuxY} rx="6" ry="8.5" fill="#FFFFFF" />
          <ellipse cx="40.5" cy={yeuxY} rx="6" ry="8.5" fill="#FFFFFF" />
          <ellipse cx="24.5" cy={yeuxY + 1} rx="3.4" ry="5" fill={NUIT} />
          <ellipse cx="41.5" cy={yeuxY + 1} rx="3.4" ry="5" fill={NUIT} />
        </g>
      </g>
    </svg>
  );
}
