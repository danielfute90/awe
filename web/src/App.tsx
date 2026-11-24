// =====================================================================
// L'application : connexion, mise en page (barre latérale sur ordinateur,
// onglets en bas sur mobile) et navigation entre les pages.
// =====================================================================
import { useEffect, useState, type ReactNode } from "react";
import { api, definirCsrf, NonConnecte, type Moi } from "./api";
import { Mascotte, LIBELLES_ETAT } from "./composants/Mascotte";
import { PageAdmin } from "./pages/Admin";
import {
  IconeAdmin,
  IconeConnexions,
  IconeConversation,
  IconeCourses,
  IconeDocuments,
  IconeReglages,
  IconeValidation,
} from "./composants/icones";
import { FournisseurAwe, useAwe } from "./contexte";
import { PageConnexion } from "./pages/Connexion";
import { PageConnexions } from "./pages/Connexions";
import { PageConversation } from "./pages/Conversation";
import { PageCourses } from "./pages/Courses";
import { PageDocuments } from "./pages/Documents";
import { PageReglages } from "./pages/Reglages";
import { PageValidations } from "./pages/Validations";

// Les pages : adresse, nom, icône, contenu.
type Page = { chemin: string; nom: string; icone: ReactNode; page: () => ReactNode };
const PAGES: Page[] = [
  { chemin: "/", nom: "Conversation", icone: <IconeConversation />, page: () => <PageConversation /> },
  { chemin: "/validations", nom: "Validations", icone: <IconeValidation />, page: () => <PageValidations /> },
  { chemin: "/courses", nom: "Courses", icone: <IconeCourses />, page: () => <PageCourses /> },
  { chemin: "/documents", nom: "Documents", icone: <IconeDocuments />, page: () => <PageDocuments /> },
  { chemin: "/connexions", nom: "Connexions", icone: <IconeConnexions />, page: () => <PageConnexions /> },
  { chemin: "/reglages", nom: "Réglages", icone: <IconeReglages />, page: () => <PageReglages /> },
];
// La page Admin n'apparaît que pour l'admin (et le serveur refuse les autres de toute façon).
const PAGE_ADMIN: Page = { chemin: "/admin", nom: "Admin", icone: <IconeAdmin />, page: () => <PageAdmin /> };

/** Navigation sans rechargement : on change l'adresse et on prévient l'appli. */
export function naviguer(chemin: string) {
  history.pushState(null, "", chemin);
  dispatchEvent(new PopStateEvent("popstate"));
}

function useChemin() {
  const [chemin, setChemin] = useState(location.pathname);
  useEffect(() => {
    const maj = () => setChemin(location.pathname);
    addEventListener("popstate", maj);
    return () => removeEventListener("popstate", maj);
  }, []);
  return chemin;
}

export function App() {
  const [moi, setMoi] = useState<Moi | null | "deconnecte" | "injoignable">(null);

  useEffect(() => {
    api<Moi>("/api/me")
      .then((m) => {
        definirCsrf(m.csrf);
        setMoi(m);
      })
      .catch((err) => setMoi(err instanceof NonConnecte ? "deconnecte" : "injoignable"));
  }, []);

  if (moi === "injoignable") {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <Mascotte etat="dispo" taille={72} />
          <p className="mt-4 text-gris">Le serveur d'Awé ne répond pas. Vérifie que pnpm dev est lancé, puis recharge la page.</p>
        </div>
      </div>
    );
  }
  if (moi === null) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Mascotte etat="reflechit" taille={72} />
      </div>
    );
  }
  if (moi === "deconnecte") return <PageConnexion />;

  return (
    <FournisseurAwe moiInitial={moi}>
      <Mise />
    </FournisseurAwe>
  );
}

function Mise() {
  const chemin = useChemin();
  const { etat, enDirect, moi } = useAwe();
  const pages = moi.role === "admin" ? [...PAGES, PAGE_ADMIN] : PAGES;
  const courante = pages.find((p) => p.chemin === chemin) ?? pages[0];

  const lien = (p: Page, mobile: boolean) => {
    const actif = p === courante;
    return (
      <a
        key={p.chemin}
        href={p.chemin}
        onClick={(e) => {
          e.preventDefault();
          naviguer(p.chemin);
        }}
        aria-current={actif ? "page" : undefined}
        className={
          mobile
            ? `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${actif ? "text-accent" : "text-gris/70"}`
            : `flex items-center gap-3 rounded-full px-4 py-2.5 font-medium transition ${actif ? "bg-accent text-white" : "text-gris hover:bg-encre/5"}`
        }
      >
        <span className={mobile && actif ? "rounded-full bg-accent-clair px-3 py-0.5" : ""}>{p.icone}</span>
        {/* Sur mobile (7 onglets), seul l'onglet actif affiche son nom ; les autres le gardent pour les lecteurs d'écran. */}
        <span className={mobile && !actif ? "sr-only" : "truncate"}>{p.nom}</span>
      </a>
    );
  };

  return (
    <div className="min-h-dvh md:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 p-5 md:flex">
        <div className="flex items-center gap-3 px-2">
          <Mascotte etat={etat} taille={48} />
          <div>
            <p className="font-titre text-2xl font-extrabold leading-none">Awé</p>
            <p className="mt-1 text-xs text-gris">
              {LIBELLES_ETAT[etat]}
              {!enDirect && " · hors ligne"}
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">{pages.map((p) => lien(p, false))}</nav>
      </aside>

      {/* Contenu de la page */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 md:pb-6 md:pt-10">{courante.page()}</main>

      {/* Onglets en bas (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-encre/10 bg-carte/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {pages.map((p) => lien(p, true))}
      </nav>
    </div>
  );
}
