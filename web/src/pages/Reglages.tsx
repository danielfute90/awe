// Réglages : prénom, réponse vocale, fuseau horaire, effacer mes données, déconnexion.
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { Bouton, Carte, Etiquette, Titre } from "../composants/ui";
import { useAwe } from "../contexte";

export function PageReglages() {
  const { moi, rafraichirMoi, notifier } = useAwe();
  const [prenom, setPrenom] = useState(moi.prenom);
  const [voix, setVoix] = useState(moi.voixActivee);
  const [fuseau, setFuseau] = useState(moi.fuseau);
  const [enCours, setEnCours] = useState(false);
  const fuseaux = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setEnCours(true);
    try {
      await api("/api/settings", { methode: "PATCH", corps: { prenom, voixActivee: voix, fuseau } });
      await rafraichirMoi();
      notifier("Réglages enregistrés.");
    } catch (err) {
      notifier(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnCours(false);
    }
  };

  const effacer = async () => {
    const ok = confirm(
      "Effacer TOUTES tes données ? Conversation, courses, rappels, PDF, validations et journal seront supprimés, et Gmail sera déconnecté. C'est définitif.",
    );
    if (!ok) return;
    await api("/api/me/data", { methode: "DELETE" });
    await rafraichirMoi();
    notifier("Tes données ont été effacées.");
  };

  const deconnexion = async () => {
    await api("/auth/logout", { methode: "POST" });
    location.href = "/";
  };

  return (
    <>
      <Titre>Réglages</Titre>

      <Carte>
        <form onSubmit={enregistrer} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <Etiquette>Ton prénom</Etiquette>
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              maxLength={50}
              required
              className="rounded-full border border-encre/15 bg-white px-4 py-2.5 outline-none focus:border-encre"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span>
              <Etiquette>Réponse vocale</Etiquette>
              <span className="text-sm text-gris">Quand tu envoies une note vocale, Awé répond aussi en vocal (réponses courtes).</span>
            </span>
            <input type="checkbox" checked={voix} onChange={(e) => setVoix(e.target.checked)} className="h-6 w-6 shrink-0 accent-encre" />
          </label>

          <label className="flex flex-col gap-1.5">
            <Etiquette>Fuseau horaire (pour les rappels)</Etiquette>
            <select
              value={fuseau}
              onChange={(e) => setFuseau(e.target.value)}
              className="rounded-full border border-encre/15 bg-white px-4 py-2.5 outline-none focus:border-encre"
            >
              {fuseaux.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <div>
            <Bouton type="submit" variante="noir" disabled={enCours}>
              Enregistrer
            </Bouton>
          </div>
        </form>
      </Carte>

      <Carte className="mt-6">
        <Etiquette>Budget du jour</Etiquette>
        <div className="h-3 overflow-hidden rounded-full bg-encre/8">
          <div
            className={`h-full rounded-full ${moi.budget.utilises / moi.budget.limite >= 0.8 ? "bg-rouge" : "bg-vert"}`}
            style={{ width: `${Math.min(100, (moi.budget.utilises / moi.budget.limite) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-gris">
          {moi.budget.utilises.toLocaleString("fr-FR")} tokens utilisés sur {moi.budget.limite.toLocaleString("fr-FR")} aujourd'hui.
          {moi.budget.illimite && " Tu es administrateur : tu n'es jamais bloqué, tu reçois juste une alerte à 80 %."}
        </p>
      </Carte>

      <Carte className="mt-6">
        <Etiquette>Zone sensible</Etiquette>
        <div className="flex flex-wrap gap-2">
          <Bouton variante="discret" onClick={deconnexion}>
            Se déconnecter
          </Bouton>
          <Bouton variante="danger" onClick={effacer}>
            Effacer mes données
          </Bouton>
        </div>
      </Carte>
    </>
  );
}
