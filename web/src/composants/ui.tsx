// Petits composants réutilisés partout : titres, cartes, boutons, pastilles.
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Un trait bleu sous les titres : la signature visuelle, discrète. */
export function Soulignement({ className = "" }: { className?: string }) {
  return <span className={`block h-1 w-12 rounded-full bg-accent ${className}`} aria-hidden="true" />;
}

/** Titre de page en bleu nuit, souligné d'un trait bleu. */
export function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-titre text-2xl font-extrabold tracking-tight text-encre sm:text-3xl">{children}</h1>
      <Soulignement className="mt-2" />
      {sous && <p className="mt-3 text-gris">{sous}</p>}
    </header>
  );
}

export function Carte({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ombre-douce rounded-[26px] bg-carte p-5 sm:p-6 ${className}`}>{children}</section>;
}

/** Petite étiquette en italique (Poppins). */
export function Etiquette({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-titre text-sm font-bold italic text-gris">{children}</h2>;
}

/**
 * Pastille arrondie. Les tons ont un SENS (pas de couleur décorative) :
 * accent = actif / réussi, clair = information, gris = neutre,
 * noir = admin, danger = erreur ou urgence.
 */
export type Ton = "accent" | "clair" | "gris" | "noir" | "danger";
const TONS: Record<Ton, string> = {
  accent: "bg-accent text-white",
  clair: "bg-accent-clair text-accent-fonce",
  gris: "bg-encre/8 text-gris",
  noir: "bg-encre text-white",
  danger: "bg-danger/10 text-danger",
};
export function Pastille({ children, ton = "clair" }: { children: ReactNode; ton?: Ton }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONS[ton]}`}>{children}</span>;
}

type BoutonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "principal" | "noir" | "discret" | "danger" };

export function Bouton({ variante = "principal", className = "", ...props }: BoutonProps) {
  const styles = {
    principal: "bg-accent text-white hover:bg-accent-fonce",
    noir: "bg-encre text-white hover:bg-encre/85",
    discret: "bg-encre/6 text-encre hover:bg-encre/12",
    danger: "bg-danger/10 text-danger hover:bg-danger hover:text-white",
  }[variante];
  return (
    <button
      className={`rounded-full px-5 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

/** Message affiché quand une liste est vide. */
export function Vide({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-gris">{children}</p>;
}

/** Date lisible en français, dans le fuseau de l'utilisateur. */
export function formaterDate(iso: string | Date, fuseau: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: fuseau }).format(new Date(iso));
}
