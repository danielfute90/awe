// =====================================================================
// Création de PDF (pdfkit). Les fichiers sont rangés dans storage/<userId>/
// et enregistrés dans la table documents.
//
// Mise en forme simple du contenu, ligne par ligne :
//   "# Titre"   → intertitre
//   "- élément" → puce
//   ligne vide  → espace
//   autre       → paragraphe
// =====================================================================
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { config } from "../config.js";
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
  // userId est un nombre venant de la base : impossible de sortir du dossier storage/.
  const dossier = path.join(config.STORAGE_DIR, String(userId));
  await mkdir(dossier, { recursive: true });
  const chemin = path.join(dossier, `${Date.now()}-${slug(titre)}.pdf`);

  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: titre, Author: "Awé" } });
  const termine = new Promise<void>((ok, ko) => {
    const flux = createWriteStream(chemin);
    flux.on("finish", ok);
    flux.on("error", ko);
    doc.pipe(flux);
  });

  // En-tête
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#141414").text(titre);
  doc.font("Helvetica").fontSize(10).fillColor("#4A4A45").text(`Créé par Awé le ${formaterDate(new Date(), fuseau)}`);
  doc.moveDown(1.2);

  // Contenu
  doc.fillColor("#141414");
  for (const ligne of contenu.replace(/\r/g, "").split("\n")) {
    const l = ligne.trim();
    if (!l) doc.moveDown(0.5);
    else if (l.startsWith("# ")) doc.moveDown(0.4).font("Helvetica-Bold").fontSize(15).text(l.slice(2)).moveDown(0.2);
    else if (/^[-*] /.test(l)) doc.font("Helvetica").fontSize(12).text(`•  ${l.slice(2)}`, { indent: 12 });
    else doc.font("Helvetica").fontSize(12).text(l, { align: "left" });
  }

  doc.end();
  await termine;

  const [document] = await db.insert(documents).values({ userId, titre, chemin }).returning();
  emettre(userId, { type: "document", document: { id: document.id, titre, chemin } });
  return document;
}
