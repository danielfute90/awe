// =====================================================================
// Dates et fuseaux horaires.
// En base, toutes les dates sont en UTC. On convertit vers/depuis l'heure
// locale de l'utilisateur (ex. "Europe/Paris") uniquement ici.
// =====================================================================

/** Vérifie qu'un fuseau existe (ex. "Europe/Paris", "Africa/Abidjan"). */
export function fuseauValide(fuseau: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

/** Découpe une date en année, mois, jour, heure... telle qu'on la lit dans ce fuseau. */
function partiesLocales(date: Date, fuseau: string) {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const valeur = (type: string) => Number(parties.find((p) => p.type === type)?.value);
  return {
    annee: valeur("year"),
    mois: valeur("month"),
    jour: valeur("day"),
    heure: valeur("hour"),
    minute: valeur("minute"),
    seconde: valeur("second"),
  };
}

/** Écart (en ms) entre l'heure locale du fuseau et l'UTC, à un instant donné. */
function decalageMs(date: Date, fuseau: string) {
  const p = partiesLocales(date, fuseau);
  const memeHeureEnUtc = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
  return memeHeureEnUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convertit une heure locale "AAAA-MM-JJTHH:MM" (dans le fuseau donné) en date UTC.
 * Renvoie null si le format est invalide.
 * Exemple : "2026-07-01T09:00" à Paris → 07:00 UTC (heure d'été).
 */
export function heureLocaleVersUtc(heureLocale: string, fuseau: string): Date | null {
  const m = heureLocale.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const [, a, mo, j, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || j < 1 || j > 31 || h > 23 || mi > 59) return null;

  const naif = Date.UTC(a, mo - 1, j, h, mi);
  // Deux passes pour bien gérer les changements d'heure (été/hiver).
  let resultat = naif - decalageMs(new Date(naif), fuseau);
  resultat = naif - decalageMs(new Date(resultat), fuseau);
  return new Date(resultat);
}

/** Minuit (heure locale) du jour en cours, en UTC. Sert au budget "par jour". */
export function debutDeJournee(fuseau: string, maintenant = new Date()): Date {
  const p = partiesLocales(maintenant, fuseau);
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  const minuit = `${p.annee}-${deuxChiffres(p.mois)}-${deuxChiffres(p.jour)}T00:00`;
  return heureLocaleVersUtc(minuit, fuseau) ?? maintenant;
}

/** Date lisible en français, ex. "samedi 14 novembre 2026 à 23:50". */
export function formaterDate(date: Date, fuseau: string): string {
  const jour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: fuseau,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: fuseau,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${jour} à ${heure}`;
}
