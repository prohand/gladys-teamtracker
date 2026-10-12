// -----------------------------------------------------------------------------
// Leagues the integration knows by a short code.
//
// Scores come from ESPN's public scoreboard API (no account, no key), the same
// source as the Home Assistant "Team Tracker" integration. A league is reached
// by its `sport` and `league` path segments:
//
//   https://site.api.espn.com/apis/site/v2/sports/<sport>/<league>/scoreboard
//
// Only team sports are listed: a match is two competitors, each with a score.
// Any other ESPN team league can still be followed by writing its two path
// segments instead of a code (`soccer/por.1:SLB`), see parseLeague().
//
// The codes are stored in the users' configuration: never rename one.
// -----------------------------------------------------------------------------

export const LEAGUES = {
  // Soccer — France first, the integration was born on a French forum.
  LIG1: { sport: 'soccer', league: 'fra.1', name: 'Ligue 1' },
  LIG2: { sport: 'soccer', league: 'fra.2', name: 'Ligue 2' },
  CDF: { sport: 'soccer', league: 'fra.coupe_de_france', name: 'Coupe de France' },
  D1F: { sport: 'soccer', league: 'fra.w.1', name: 'Première Ligue' },
  EPL: { sport: 'soccer', league: 'eng.1', name: 'Premier League' },
  LIGA: { sport: 'soccer', league: 'esp.1', name: 'LaLiga' },
  SERA: { sport: 'soccer', league: 'ita.1', name: 'Serie A' },
  BUND: { sport: 'soccer', league: 'ger.1', name: 'Bundesliga' },
  CL: { sport: 'soccer', league: 'uefa.champions', name: 'Champions League' },
  EL: { sport: 'soccer', league: 'uefa.europa', name: 'Europa League' },
  ECL: { sport: 'soccer', league: 'uefa.europa.conf', name: 'Conference League' },
  MLS: { sport: 'soccer', league: 'usa.1', name: 'MLS' },
  NWSL: { sport: 'soccer', league: 'usa.nwsl', name: 'NWSL' },
  WC: { sport: 'soccer', league: 'fifa.world', name: 'FIFA World Cup' },
  WWC: { sport: 'soccer', league: 'fifa.wwc', name: "FIFA Women's World Cup" },
  // Rugby: ESPN gives rugby leagues a numeric id instead of a slug.
  TOP14: { sport: 'rugby', league: '270559', name: 'Top 14' },
  SIXN: { sport: 'rugby', league: '180659', name: 'Six Nations' },
  RWC: { sport: 'rugby', league: '164205', name: 'Rugby World Cup' },
  // North American leagues.
  NFL: { sport: 'football', league: 'nfl', name: 'NFL' },
  NCAAF: { sport: 'football', league: 'college-football', name: 'NCAA Football' },
  NBA: { sport: 'basketball', league: 'nba', name: 'NBA' },
  WNBA: { sport: 'basketball', league: 'wnba', name: 'WNBA' },
  NCAAM: { sport: 'basketball', league: 'mens-college-basketball', name: 'NCAA Men' },
  NCAAW: { sport: 'basketball', league: 'womens-college-basketball', name: 'NCAA Women' },
  NHL: { sport: 'hockey', league: 'nhl', name: 'NHL' },
  MLB: { sport: 'baseball', league: 'mlb', name: 'MLB' },
};

// What a free-form `sport/league` path may contain: ESPN slugs are lowercase
// letters, digits, dots, dashes and underscores. Anything else would end up in
// a URL, so it is refused rather than escaped.
const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Resolve a league as written by the user: a code of LEAGUES (any case) or
 * a `sport/league` ESPN path.
 * @param {string} text
 * @returns {{ code: string, sport: string, league: string, name: string } | null}
 */
export function parseLeague(text) {
  const raw = String(text ?? '').trim();
  const known = LEAGUES[raw.toUpperCase()];
  if (known) {
    return { code: raw.toUpperCase(), ...known };
  }
  const parts = raw.toLowerCase().split('/');
  if (parts.length === 2 && parts.every((part) => SEGMENT.test(part))) {
    const [sport, league] = parts;
    const listed = Object.entries(LEAGUES).find(
      ([, entry]) => entry.sport === sport && entry.league === league,
    );
    if (listed) {
      return { code: listed[0], ...listed[1] };
    }
    return { code: `${sport}/${league}`, sport, league, name: league };
  }
  return null;
}

/** Stable identifier of a league, used in the device external ids. */
export function leagueKey({ sport, league }) {
  return `${sport}.${league}`;
}
