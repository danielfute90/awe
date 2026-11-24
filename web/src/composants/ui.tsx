// Petits composants réutilisés partout : titres, cartes, boutons, pastilles.
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Les quatre couleurs fluo, et la couleur de texte lisible sur chacune. */
export type Couleur = "bleu" | "rouge" | "jaune" | "vert";
export const FOND: Record<Couleur, string> = {
  bleu: "bg-bleu text-white",
  rouge: "bg-rouge text-white",
  jaune: "bg-jaune text-encre",
  vert: "bg-vert text-encre",
};

/** La signature visuelle : une bande en quatre fragments fluo. */
export function BandeFluo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex h-1.5 w-28 overflow-hidden rounded-full ${className}`} aria-hidden="true">
      <span className="flex-1 bg-bleu" />
      <span className="flex-1 bg-rouge" />
      <span className="flex-1 bg-jaune" />
      <span className="flex-1 bg-vert" />
    </span>
  );
}

/** Titre dans une barre noire légèrement inclinée, soulignée par la bande fluo. */
export function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="inline-block -rotate-[1.5deg] rounded-2xl bg-encre px-5 py-2 font-titre text-2xl font-extrabold text-white sm:text-3xl">
        {children}
      </h1>
      <BandeFluo className="ml-3 mt-2 -rotate-[1.5deg]" />
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

/** Pastille arrondie, dans une des couleurs fluo (ou gris / noir). */
export function Pastille({ children, ton = "vert" }: { children: ReactNode; ton?: Couleur | "gris" | "noir" }) {
  const couleurs = ton === "gris" ? "bg-encre/8 text-gris" : ton === "noir" ? "bg-encre text-white" : FOND[ton];
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${couleurs}`}>{children}</span>;
}

type BoutonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "principal" | "noir" | "discret" | "danger" };

export function Bouton({ variante = "principal", className = "", ...props }: BoutonProps) {
  const styles = {
    principal: "bg-bleu text-white hover:brightness-110",
    noir: "bg-encre text-white hover:bg-encre/85",
    discret: "bg-encre/6 text-encre hover:bg-encre/12",
    danger: "bg-rouge text-white hover:brightness-110",
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
