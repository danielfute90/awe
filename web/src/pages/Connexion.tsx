// Page affichée quand on n'est pas connecté : pas de mot de passe, on passe par Telegram.
// En mode démo, un bouton permet d'entrer directement.
import { useEffect, useState } from "react";
import { Mascotte } from "../composants/Mascotte";
import { BandeFluo, Carte } from "../composants/ui";

export function PageConnexion() {
  const lienInvalide = new URLSearchParams(location.search).get("lien") === "invalide";
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/info")
      .then((r) => r.json())
      .then((info: { demo: boolean }) => setDemo(info.demo))
      .catch(() => {});
  }, []);

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Carte className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Mascotte etat="dispo" taille={96} />
        </div>
        <h1 className="mx-auto mt-6 inline-block -rotate-[1.5deg] rounded-2xl bg-encre px-5 py-2 font-titre text-3xl font-extrabold text-white">
          Awé
        </h1>
        <BandeFluo className="mx-auto mt-2 -rotate-[1.5deg]" />

        {demo ? (
          <>
            <p className="mt-6 text-lg">Ton assistant personnel, sur Telegram et le web.</p>
            <p className="mt-2 text-gris">
              Version de démonstration : données d'exemple, aucune vraie IA, aucun vrai email envoyé.
            </p>
            <a
              href="/auth/demo"
              className="mt-6 inline-block rounded-full bg-bleu px-6 py-3 font-semibold text-white hover:brightness-110"
            >
              Entrer dans la démo
            </a>
          </>
        ) : (
          <>
            {lienInvalide && (
              <p className="mt-5 rounded-2xl bg-red-50 p-3 text-sm text-red-800">
                Ce lien n'est plus valable (il ne sert qu'une fois et expire après 10 minutes). Demandes-en un nouveau.
              </p>
            )}
            <p className="mt-6 text-lg">
              Ouvre Telegram et envoie <b className="rounded-lg bg-jaune px-2 py-0.5">/web</b> à Awé.
            </p>
            <p className="mt-2 text-gris">Il te répond avec un lien de connexion. Pas de mot de passe à retenir.</p>
            <p className="mt-6 text-sm text-gris">
              Sans Telegram : lance <code className="rounded bg-encre/6 px-1.5 py-0.5">pnpm lien-web</code> dans le terminal.
            </p>
          </>
        )}
      </Carte>
    </div>
  );
}
