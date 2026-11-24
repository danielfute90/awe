// La mascotte d'Awé : un cercle en quatre quarts fluo (bleu, rouge, jaune, vert)
// avec deux grands yeux. Elle bouge selon l'état (animations dans index.css).
import type { EtatAwe } from "../api";

export const LIBELLES_ETAT: Record<EtatAwe, string> = {
  dispo: "Dispo",
  reflechit: "Réfléchit...",
  travaille: "Travaille...",
  attend_validation: "Attend ta validation",
};

// Les quatre quarts du cercle (centre 32,32 ; rayon 28), dans le sens des aiguilles d'une montre.
const QUARTS = [
  { d: "M32 32 L32 4 A28 28 0 0 1 60 32 Z", couleur: "#FF2D6F" }, // en haut à droite : rouge
  { d: "M32 32 L60 32 A28 28 0 0 1 32 60 Z", couleur: "#FFE014" }, // en bas à droite : jaune
  { d: "M32 32 L32 60 A28 28 0 0 1 4 32 Z", couleur: "#1FE27A" }, // en bas à gauche : vert
  { d: "M32 32 L4 32 A28 28 0 0 1 32 4 Z", couleur: "#2E7DFF" }, // en haut à gauche : bleu
];

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
      {etat === "attend_validation" && <circle className="mascotte-halo" cx="32" cy="32" r="28" fill="#FFE014" />}
      <g className="mascotte-corps">
        {QUARTS.map((q) => (
          <path key={q.couleur} d={q.d} fill={q.couleur} />
        ))}
        <circle cx="32" cy="32" r="28" fill="none" stroke="#141414" strokeWidth="1.5" />
        <g className="mascotte-yeux">
          {/* Blanc des yeux, puis pupilles */}
          <ellipse cx="23.5" cy={yeuxY} rx="6" ry="8.5" fill="#FFFFFF" stroke="#141414" strokeWidth="1.2" />
          <ellipse cx="40.5" cy={yeuxY} rx="6" ry="8.5" fill="#FFFFFF" stroke="#141414" strokeWidth="1.2" />
          <ellipse cx="24.5" cy={yeuxY + 1} rx="3.4" ry="5" fill="#141414" />
          <ellipse cx="41.5" cy={yeuxY + 1} rx="3.4" ry="5" fill="#141414" />
        </g>
      </g>
    </svg>
  );
}
