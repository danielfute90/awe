// Icônes en SVG (traits simples, couleur = celle du texte).
import type { ReactNode } from "react";

function Icone({ children, taille = 22 }: { children: ReactNode; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconeConversation = () => <Icone><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></Icone>;
export const IconeValidation = () => <Icone><path d="M9 12l2 2 4-4" /><rect x="3" y="3" width="18" height="18" rx="5" /></Icone>;
export const IconeCourses = () => <Icone><path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6 5 3H2" /><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></Icone>;
export const IconeDocuments = () => <Icone><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Icone>;
export const IconeConnexions = () => <Icone><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Icone>;
export const IconeReglages = () => <Icone><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icone>;
export const IconeAdmin = () => <Icone><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></Icone>;
export const IconeEnvoyer = () => <Icone><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></Icone>;
export const IconePoubelle = () => <Icone taille={18}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Icone>;

/** Petite icône de source d'un message : avion en papier (Telegram) ou écran (web). */
export const IconeSource = ({ source }: { source: "telegram" | "web" }) =>
  source === "telegram" ? (
    <Icone taille={13}><path d="M22 3 2 11l7 2 2 7 4-5 5 4z" /></Icone>
  ) : (
    <Icone taille={13}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Icone>
  );
