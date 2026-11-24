// =====================================================================
// Admin (rôle admin uniquement) : invitations, utilisateurs, coûts par jour
// avec la barre du budget, et le journal d'une tâche étape par étape.
// =====================================================================
import { useEffect, useState } from "react";
import { api, type CoutJour, type Tache, type Utilisateur } from "../api";
import { Bouton, Carte, Etiquette, formaterDate, Pastille, Titre, Vide } from "../composants/ui";
import { useAwe, useDonnees } from "../contexte";

export function PageAdmin() {
  const { moi, notifier } = useAwe();
  const { donnees: utilisateurs, recharger } = useDonnees(() => api<Utilisateur[]>("/api/admin/users"), []);
  const { donnees: couts } = useDonnees(() => api<{ jours: CoutJour[]; limiteParJour: number }>("/api/admin/costs"), ["message"]);
  const [invitation, setInvitation] = useState<{ code: string; lien: string | null } | null>(null);
  const [cible, setCible] = useState(moi.id);
  const { donnees: taches, recharger: rechargerTaches } = useDonnees(() => api<Tache[]>(`/api/admin/logs/${cible}`), ["message"]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Quand on choisit un autre utilisateur, on recharge son journal.
  useEffect(() => {
    void rechargerTaches();
  }, [cible, rechargerTaches]);

  const inviter = async (role: "membre" | "invite") => {
    try {
      setInvitation(await api("/api/admin/invitations", { methode: "POST", corps: { role } }));
    } catch (err) {
      notifier(err instanceof Error ? err.message : "Erreur");
    }
  };

  const retirer = async (u: Utilisateur) => {
    if (!confirm(`Retirer ${u.prenom} et supprimer toutes ses données ?`)) return;
    notifier((await api<{ texte: string }>(`/api/admin/users/${u.id}`, { methode: "DELETE" })).texte);
    await recharger();
  };

  const limite = couts?.limiteParJour ?? 1;
  const totalSemaine = couts?.jours.reduce((s, j) => s + j.cout, 0) ?? 0;

  return (
    <>
      <Titre sous="Réservé à l'administrateur.">Admin</Titre>

      <div className="flex flex-col gap-6">
        {/* Invitations */}
        <Carte>
          <Etiquette>Inviter quelqu'un</Etiquette>
          <div className="flex flex-wrap gap-2">
            <Bouton onClick={() => inviter("membre")}>Inviter un membre</Bouton>
            <Bouton variante="discret" onClick={() => inviter("invite")}>
              Inviter un invité (sans Gmail)
            </Bouton>
          </div>
          {invitation && (
            <div className="mt-4 rounded-2xl bg-fond p-4">
              <p className="text-sm text-gris">Lien à envoyer (un seul usage, valable 7 jours) :</p>
              {invitation.lien ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-lg bg-white px-3 py-2 text-sm">{invitation.lien}</code>
                  <Bouton
                    variante="noir"
                    onClick={() => navigator.clipboard.writeText(invitation.lien!).then(() => notifier("Lien copié."))}
                  >
                    Copier
                  </Bouton>
                </div>
              ) : (
                <p className="mt-2">
                  Code : <b>{invitation.code}</b> — la personne envoie <code>/start {invitation.code}</code> au bot.
                </p>
              )}
            </div>
          )}
        </Carte>

        {/* Utilisateurs */}
        <Carte>
          <Etiquette>Utilisateurs</Etiquette>
          <ul className="divide-y divide-encre/8">
            {utilisateurs?.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex-1 font-medium">
                  n°{u.id} · {u.prenom}
                </span>
                <Pastille ton={u.role === "admin" ? "noir" : u.role === "membre" ? "clair" : "gris"}>{u.role}</Pastille>
                {!u.telegram && <Pastille ton="gris">sans Telegram</Pastille>}
                {u.role !== "admin" && (
                  <Bouton variante="danger" className="!px-4 !py-1.5 text-sm" onClick={() => retirer(u)}>
                    Retirer
                  </Bouton>
                )}
              </li>
            ))}
          </ul>
        </Carte>

        {/* Coûts */}
        <Carte>
          <Etiquette>Coûts estimés (14 derniers jours)</Etiquette>
          {couts?.jours.length === 0 && <Vide>Aucune consommation.</Vide>}
          <ul className="flex flex-col gap-3">
            {couts?.jours.map((j) => (
              <li key={`${j.jour}-${j.userId}`}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>
                    <b>{j.jour}</b> · {j.prenom}
                  </span>
                  <span className="text-gris">
                    {j.tokens.toLocaleString("fr-FR")} tokens · {j.cout.toFixed(3)} $
                  </span>
                </div>
                {/* Barre du budget : en rouge au-delà de 80 % */}
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-encre/8">
                  <div
                    className={`h-full rounded-full ${j.tokens / limite >= 0.8 ? "bg-danger" : "bg-accent"}`}
                    style={{ width: `${Math.min(100, (j.tokens / limite) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {couts && couts.jours.length > 0 && (
            <p className="mt-4 text-sm text-gris">
              Total : <b className="text-encre">{totalSemaine.toFixed(3)} $</b> · budget de référence : {limite.toLocaleString("fr-FR")} tokens par jour
              et par personne (l'admin n'est jamais bloqué).
            </p>
          )}
        </Carte>

        {/* Journal */}
        <Carte>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Etiquette>Journal des tâches</Etiquette>
            <select
              value={cible}
              onChange={(e) => setCible(Number(e.target.value))}
              aria-label="Utilisateur"
              className="rounded-full border border-encre/15 bg-white px-4 py-2 text-sm"
            >
              {utilisateurs?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.prenom} (n°{u.id})
                </option>
              ))}
            </select>
          </div>
          {taches?.length === 0 && <Vide>Aucune tâche enregistrée.</Vide>}
          <ul className="flex flex-col gap-2">
            {taches?.map((t) => (
              <li key={t.tacheId} className="rounded-2xl bg-fond">
                <button
                  onClick={() => setOuverte(ouverte === t.tacheId ? null : t.tacheId)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                  aria-expanded={ouverte === t.tacheId}
                >
                  <span className="text-sm font-medium">{formaterDate(t.debut, moi.fuseau)}</span>
                  <span className="flex items-center gap-2 text-xs text-gris">
                    {t.etapes.length} étape{t.etapes.length > 1 ? "s" : ""} · {t.tokens} tokens · {t.cout.toFixed(4)} $
                    {t.erreur && <Pastille ton="danger">erreur</Pastille>}
                  </span>
                </button>
                {ouverte === t.tacheId && (
                  <ol className="flex flex-col gap-2 px-4 pb-4">
                    {t.etapes.map((e, i) => (
                      <li key={i} className="rounded-xl bg-white p-3 text-sm">
                        <p className="font-semibold">
                          {e.etape}. {e.outil ?? "appel au modèle"}
                          <span className="ml-2 font-normal text-gris">
                            {e.dureeMs != null && `${e.dureeMs} ms`}
                            {e.tokensIn + e.tokensOut > 0 && ` · ${e.tokensIn} + ${e.tokensOut} tokens`}
                          </span>
                        </p>
                        {e.params && <pre className="mt-1 overflow-auto whitespace-pre-wrap break-all text-xs text-gris">paramètres : {e.params}</pre>}
                        {e.resultat && <p className="mt-1 break-words text-xs">résultat : {e.resultat}</p>}
                        {e.erreur && <p className="mt-1 break-words text-xs font-medium text-red-700">{e.erreur}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </Carte>
      </div>
    </>
  );
}
