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
import { formatStatus } from './format.js';
import { LEAGUES, leagueKey, parseLeague } from './leagues.js';

const logger = createLogger({ name: 'actions' });

// A message under a button stays readable up to a few dozen lines.
const MAX_FOUND = 40;

const REASONS = {
  format: {
    en: 'write it LEAGUE:TEAM, e.g. LIG1:PSG',
    fr: 'écrivez-la LIGUE:ÉQUIPE, par ex. LIG1:PSG',
  },
  league: {
    en: 'unknown league code (see the documentation)',
    fr: 'code de ligue inconnu (voir la documentation)',
  },
  duplicate: { en: 'written twice', fr: 'écrite deux fois' },
  limit: { en: 'too many teams (20 at most)', fr: "trop d'équipes (20 au plus)" },
  not_found: {
    en: 'no such team in this league, use "Find a team"',
    fr: 'équipe absente de cette ligue, utilisez « Trouver une équipe »',
  },
  unreachable: {
    en: 'ESPN did not answer, try again later',
    fr: "ESPN n'a pas répondu, réessayez plus tard",
  },
};

function describeTeam(tracked, config, language) {
  const { spec } = tracked;
  if (!tracked.info) {
    if (tracked.resolveError === 'ambiguous') {
      const choices = tracked.candidates.map((c) => `${spec.leagueCode}:${c.id} (${c.name})`);
      return language === 'fr'
        ? `${spec.entry} : plusieurs équipes portent ce nom, écrivez plutôt ${choices.join(' ou ')}`
        : `${spec.entry}: several teams carry it, write ${choices.join(' or ')} instead`;
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
    };
  }
  const build = (language) =>
    [
      ...teams.map((t) => describeTeam(t, tracker.config, language)),
      ...tracker.parseErrors.map((err) => `${err.entry}: ${REASONS[err.reason][language]}`),
    ].join('\n');
  return { en: build('en'), fr: build('fr') };
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
    };
  }
  logger.info(`Action find_team <- ${league.code} "${fields.search ?? ''}"`);
  const teams = await tracker.teamsList(leagueKey(league), league.sport, league.league, Date.now());
  if (!teams) {
    return { en: REASONS.unreachable.en, fr: REASONS.unreachable.fr };
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
  const build = (language) => {
    const intro =
      language === 'fr'
        ? `${found.length} équipe(s) en ${league.name}, à copier dans le champ Équipes :`
        : `${found.length} team(s) in ${league.name}, to copy into the Teams field:`;
    const tail =
      more > 0
        ? [
            language === 'fr'
              ? `… et ${more} autres, affinez la recherche.`
              : `… and ${more} more, narrow the search.`,
          ]
        : [];
    return [intro, ...lines, ...tail].join('\n');
  };
  return { en: build('en'), fr: build('fr') };
}
