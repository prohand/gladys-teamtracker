// -----------------------------------------------------------------------------
// Human texts about a match, in English, French, German or Spanish.
//
// A device `text` feature holds ONE string, so the status published on the
// devices follows the `language` of the configuration. The widgets and the
// action messages are multi-language objects ({ en, fr, de, es }) the core
// picks from (English when the reader's language is none of them).
// -----------------------------------------------------------------------------

/** Every language this integration writes, English first (the fallback). */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const LOCALES = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const WORDS = {
  en: {
    live: 'Live',
    final: 'Final',
    next: 'Next',
    postponed: 'Postponed',
    canceled: 'Canceled',
    noMatch: 'No match scheduled',
    vs: 'vs',
    at: 'at',
    win: 'Win',
    loss: 'Loss',
    draw: 'Draw',
    halftime: 'Halftime',
    unknown: 'Unknown team',
  },
  fr: {
    live: 'En direct',
    final: 'Terminé',
    next: 'Prochain match',
    postponed: 'Reporté',
    canceled: 'Annulé',
    noMatch: 'Aucun match prévu',
    vs: 'contre',
    at: 'à',
    win: 'Victoire',
    loss: 'Défaite',
    draw: 'Match nul',
    halftime: 'Mi-temps',
    unknown: 'Équipe inconnue',
  },
  de: {
    live: 'Live',
    final: 'Beendet',
    next: 'Nächstes Spiel',
    postponed: 'Verschoben',
    canceled: 'Abgesagt',
    noMatch: 'Kein Spiel geplant',
    vs: 'gegen',
    at: 'bei',
    win: 'Sieg',
    loss: 'Niederlage',
    draw: 'Unentschieden',
    halftime: 'Halbzeit',
    unknown: 'Unbekanntes Team',
  },
  es: {
    live: 'En directo',
    final: 'Finalizado',
    next: 'Próximo partido',
    postponed: 'Aplazado',
    canceled: 'Cancelado',
    noMatch: 'Ningún partido previsto',
    vs: 'contra',
    at: 'en casa de',
    win: 'Victoria',
    loss: 'Derrota',
    draw: 'Empate',
    halftime: 'Descanso',
    unknown: 'Equipo desconocido',
  },
};

export function words(language) {
  return WORDS[language] ?? WORDS.en;
}

/** "Sat, Oct 17, 5:15 PM" / "sam. 17 oct., 17:15", in the configured time zone. */
export function formatKickoff(iso, language, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

/** "PSG 2 – 1 OM", always the followed team first. */
export function formatScore(match) {
  return `${match.team.abbreviation} ${match.team.score} – ${match.opponent.score} ${match.opponent.abbreviation}`;
}

/** "vs OM" at home, "at OM" away. */
export function formatOpponent(match, language) {
  const w = words(language);
  return `${match.homeAway === 'away' ? w.at : w.vs} ${match.opponent.abbreviation}`;
}

/** The live clock: ESPN's short text, with the halftime words translated. */
export function formatClock(match, language) {
  if (match.statusName === 'STATUS_HALFTIME' || /^(HT|Halftime)$/i.test(match.detail)) {
    return words(language).halftime;
  }
  return match.detail;
}

export function formatResult(result, language) {
  return result ? words(language)[result] : '';
}

function isCanceled(match) {
  return /CANCEL|ABANDON|FORFEIT/.test(match.statusName);
}

function isPostponed(match) {
  return /POSTPONED|DELAYED|SUSPENDED/.test(match.statusName);
}

/**
 * One line telling where the team stands: the status text feature of the
 * device, the summary of the scene events and of the `get_match` action.
 */
export function formatStatus(match, { language, timezone }) {
  const w = words(language);
  if (!match) {
    return w.noMatch;
  }
  if (match.state === 'in') {
    return `${w.live} · ${formatClock(match, language)} · ${formatScore(match)}`;
  }
  if (match.state === 'post') {
    if (match.completed) {
      return `${w.final} · ${formatScore(match)} · ${formatResult(match.result, language)}`;
    }
    const label = isCanceled(match) ? w.canceled : w.postponed;
    return `${label} · ${match.team.abbreviation} ${formatOpponent(match, language)}`;
  }
  if (isPostponed(match)) {
    return `${w.postponed} · ${match.team.abbreviation} ${formatOpponent(match, language)}`;
  }
  return `${w.next} · ${formatKickoff(match.kickoff, language, timezone)} · ${formatOpponent(match, language)}`;
}

/** Every language at once, for the widgets and the action messages. */
export function multilingual(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}
