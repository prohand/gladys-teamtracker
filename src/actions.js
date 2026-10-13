// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
//   - test_teams  read ESPN now and say, team by team, what is followed and
//                 why an entry is not;
//   - find_team   list the teams of a league with the exact text to paste
//                 ("LIG1:PSG"), filtered by a search word.
//
// The resolved message (multi-language object) is shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { formatStatus, multilingual } from './format.js';
import { LEAGUES, leagueKey, parseLeague } from './leagues.js';

const logger = createLogger({ name: 'actions' });

// A message under a button stays readable up to a few dozen lines.
const MAX_FOUND = 40;

const REASONS = {
  format: {
    en: 'write it LEAGUE:TEAM, e.g. LIG1:PSG',
    fr: 'écrivez-la LIGUE:ÉQUIPE, par ex. LIG1:PSG',
    de: 'schreib es als LIGA:TEAM, z. B. LIG1:PSG',
    es: 'escríbalo como LIGA:EQUIPO, p. ej. LIG1:PSG',
  },
  league: {
    en: 'unknown league code (see the documentation)',
    fr: 'code de ligue inconnu (voir la documentation)',
    de: 'unbekannter Liga-Code (siehe Dokumentation)',
    es: 'código de liga desconocido (consulte la documentación)',
  },
  duplicate: {
    en: 'written twice',
    fr: 'écrite deux fois',
    de: 'doppelt eingetragen',
    es: 'escrito dos veces',
  },
  limit: {
    en: 'too many teams (20 at most)',
    fr: "trop d'équipes (20 au plus)",
    de: 'zu viele Teams (höchstens 20)',
    es: 'demasiados equipos (20 como máximo)',
  },
  not_found: {
    en: 'no such team in this league, use "Find a team"',
    fr: 'équipe absente de cette ligue, utilisez « Trouver une équipe »',
    de: 'kein solches Team in dieser Liga, nutze „Team suchen“',
    es: 'no existe ese equipo en esta liga, use «Buscar un equipo»',
  },
  unreachable: {
    en: 'ESPN did not answer, try again later',
    fr: "ESPN n'a pas répondu, réessayez plus tard",
    de: 'ESPN hat nicht geantwortet, versuch es später erneut',
    es: 'ESPN no ha respondido, inténtelo más tarde',
  },
};

// "PSG: several teams carry it, write LIG1:1 (…) or LIG1:2 (…) instead".
const AMBIGUOUS = {
  en: (entry, choices) => `${entry}: several teams carry it, write ${choices.join(' or ')} instead`,
  fr: (entry, choices) =>
    `${entry} : plusieurs équipes portent ce nom, écrivez plutôt ${choices.join(' ou ')}`,
  de: (entry, choices) =>
    `${entry}: mehrere Teams tragen diesen Namen, schreib stattdessen ${choices.join(' oder ')}`,
  es: (entry, choices) =>
    `${entry}: varios equipos llevan ese nombre, escriba mejor ${choices.join(' o ')}`,
};

const FOUND = {
  en: (count, league) => `${count} team(s) in ${league}, to copy into the Teams field:`,
  fr: (count, league) => `${count} équipe(s) en ${league}, à copier dans le champ Équipes :`,
  de: (count, league) => `${count} Team(s) in ${league}, zum Kopieren in das Feld Teams:`,
  es: (count, league) => `${count} equipo(s) en ${league}, para copiar en el campo Equipos:`,
};

const MORE = {
  en: (more) => `… and ${more} more, narrow the search.`,
  fr: (more) => `… et ${more} autres, affinez la recherche.`,
  de: (more) => `… und ${more} weitere, verfeinere die Suche.`,
  es: (more) => `… y ${more} más, afine la búsqueda.`,
};

function describeTeam(tracked, config, language) {
  const { spec } = tracked;
  if (!tracked.info) {
    if (tracked.resolveError === 'ambiguous') {
      const choices = tracked.candidates.map((c) => `${spec.leagueCode}:${c.id} (${c.name})`);
      return AMBIGUOUS[language](spec.entry, choices);
    }
    const reason = REASONS[tracked.resolveError ?? 'unreachable'][language];
    return `${spec.entry}: ${reason}`;
  }
  const status =
    tracked.reachable === false
      ? REASONS.unreachable[language]
      : formatStatus(tracked.match ?? null, { ...config, language });
  return `${tracked.info.name} (${spec.leagueName}): ${status}`;
}

/** Handler of `test_teams`. */
export async function testTeams(tracker) {
  logger.info('Action test_teams -> reading ESPN now');
  await tracker.refresh();
  const teams = tracker.list();
  if (teams.length === 0 && tracker.parseErrors.length === 0) {
    return {
      en: 'No team to follow yet: write one in the Teams field, e.g. LIG1:PSG, NFL:KC.',
      fr: 'Aucune équipe à suivre : écrivez-en une dans le champ Équipes, par ex. LIG1:PSG, NFL:KC.',
      de: 'Noch kein Team zu verfolgen: Trage eines in das Feld Teams ein, z. B. LIG1:PSG, NFL:KC.',
      es: 'Aún no hay ningún equipo que seguir: escriba uno en el campo Equipos, p. ej. LIG1:PSG, NFL:KC.',
    };
  }
  const build = (language) =>
    [
      ...teams.map((t) => describeTeam(t, tracker.config, language)),
      ...tracker.parseErrors.map((err) => `${err.entry}: ${REASONS[err.reason][language]}`),
    ].join('\n');
  return multilingual(build);
}

function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Handler of `find_team`. */
export async function findTeams(tracker, fields) {
  const league = parseLeague(fields.league);
  if (!league) {
    return {
      en: `Unknown league "${fields.league}". Known codes: ${Object.keys(LEAGUES).join(', ')}.`,
      fr: `Ligue « ${fields.league} » inconnue. Codes connus : ${Object.keys(LEAGUES).join(', ')}.`,
      de: `Unbekannte Liga „${fields.league}“. Bekannte Codes: ${Object.keys(LEAGUES).join(', ')}.`,
      es: `Liga «${fields.league}» desconocida. Códigos conocidos: ${Object.keys(LEAGUES).join(', ')}.`,
    };
  }
  logger.info(`Action find_team <- ${league.code} "${fields.search ?? ''}"`);
  const teams = await tracker.teamsList(leagueKey(league), league.sport, league.league, Date.now());
  if (!teams) {
    return { ...REASONS.unreachable };
  }
  const search = normalize(fields.search).trim();
  const found = teams
    .filter(
      (team) =>
        !search ||
        [team.name, team.shortName, team.abbreviation, team.id].some((value) =>
          normalize(value).includes(search),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (found.length === 0) {
    return {
      en: `No team of ${league.name} matches "${fields.search}".`,
      fr: `Aucune équipe de ${league.name} ne correspond à « ${fields.search} ».`,
      de: `Kein Team aus ${league.name} passt zu „${fields.search}“.`,
      es: `Ningún equipo de ${league.name} coincide con «${fields.search}».`,
    };
  }
  // The abbreviation is enough when it is unique in the league; otherwise the id.
  const count = new Map();
  for (const team of teams) {
    count.set(team.abbreviation, (count.get(team.abbreviation) ?? 0) + 1);
  }
  const lines = found.slice(0, MAX_FOUND).map((team) => {
    const key = count.get(team.abbreviation) === 1 ? team.abbreviation : team.id;
    return `${league.code}:${key} — ${team.name}`;
  });
  const more = found.length - lines.length;
  return multilingual((language) =>
    [
      FOUND[language](found.length, league.name),
      ...lines,
      ...(more > 0 ? [MORE[language](more)] : []),
    ].join('\n'),
  );
}
