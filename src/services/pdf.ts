// =====================================================================
// Création de PDF (pdfkit). Le PDF est fabriqué en mémoire puis rangé
// DANS la base (table documents, colonne contenu) : il survit aux
// redéploiements, contrairement à un fichier sur le disque du serveur.
//
// Mise en forme simple du contenu, ligne par ligne :
//   "# Titre"   → intertitre
//   "- élément" → puce
//   ligne vide  → espace
//   autre       → paragraphe
// =====================================================================
import PDFDocument from "pdfkit";
import { db, documents } from "../db/index.js";
import { emettre } from "./events.js";
import { formaterDate } from "./temps.js";

/** "Liste de courses !" → "liste-de-courses" (nom de fichier sans risque). */
function slug(texte: string) {
  return (
    texte
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "document"
  );
}

export async function creerPdf(userId: number, titre: string, contenu: string, fuseau: string) {
  const fichier = `${Date.now()}-${slug(titre)}.pdf`;

  // pdfkit produit le PDF par petits morceaux (chunks) : on les collecte en mémoire,
  // puis on les colle bout à bout en un seul bloc d'octets (Buffer).
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: titre, Author: "Awé" } });
  const morceaux: Buffer[] = [];
  const termine = new Promise<Buffer>((ok, ko) => {
    doc.on("data", (morceau: Buffer) => morceaux.push(morceau));
    doc.on("end", () => ok(Buffer.concat(morceaux)));
    doc.on("error", ko);
  });

  // En-tête
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#0F172A").text(titre);
  doc.font("Helvetica").fontSize(10).fillColor("#475569").text(`Créé par Awé le ${formaterDate(new Date(), fuseau)}`);
  doc.moveDown(1.2);

  // Contenu
  doc.fillColor("#0F172A");
  for (const ligne of contenu.replace(/\r/g, "").split("\n")) {
    const l = ligne.trim();
    if (!l) doc.moveDown(0.5);
    else if (l.startsWith("# ")) doc.moveDown(0.4).font("Helvetica-Bold").fontSize(15).text(l.slice(2)).moveDown(0.2);
    else if (/^[-*] /.test(l)) doc.font("Helvetica").fontSize(12).text(`•  ${l.slice(2)}`, { indent: 12 });
    else doc.font("Helvetica").fontSize(12).text(l, { align: "left" });
  }

  doc.end();
  const octets = await termine;

  const [document] = await db
    .insert(documents)
    .values({ userId, titre, chemin: fichier, contenu: octets })
    .returning({ id: documents.id, titre: documents.titre, fichier: documents.chemin });
  emettre(userId, { type: "document", document });
  return document;
}
