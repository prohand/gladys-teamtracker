// -----------------------------------------------------------------------------
// Read the ESPN answers into the few values the integration uses.
//
// ESPN shapes differ between endpoints: a score is a string ("2") on the
// scoreboard and an object ({ value, displayValue }) in a team's nextEvent;
// the status sits on the competition or on the event. Everything is read
// defensively: a missing field gives a neutral value, never an exception.
// -----------------------------------------------------------------------------

/**
 * A match, seen from the followed team.
 * @typedef {object} Match
 * @property {string} id            ESPN event id
 * @property {'pre' | 'in' | 'post'} state
 * @property {boolean} completed    played to the end (false when postponed or canceled)
 * @property {string} statusName    ESPN status, e.g. STATUS_HALFTIME, STATUS_POSTPONED
 * @property {string} detail        short ESPN text: "63'", "HT", "FT", "10/18 - 4:25 PM EDT"
 * @property {string} kickoff       ISO date
 * @property {'home' | 'away'} homeAway
 * @property {{ id: string, abbreviation: string, name: string, score: number }} team
 * @property {{ id: string, abbreviation: string, name: string, score: number }} opponent
 * @property {'win' | 'loss' | 'draw' | null} result
 * @property {string} venue
 */

const STATES = ['pre', 'in', 'post'];

function text(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readScore(score) {
  const raw = score && typeof score === 'object' ? (score.value ?? score.displayValue) : score;
  const number = Number.parseInt(raw, 10);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function readTeam(raw = {}) {
  return {
    id: text(raw.id),
    abbreviation: text(raw.abbreviation),
    name: text(raw.displayName || raw.shortDisplayName || raw.name || raw.abbreviation),
    shortName: text(raw.shortDisplayName || raw.displayName || raw.abbreviation),
    logo: text(raw.logos?.[0]?.href || raw.logo),
  };
}

/** Teams of a league, from the `teams` endpoint. */
export function parseTeamsList(json) {
  const teams = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((entry) => readTeam(entry.team)).filter((team) => team.id);
}

/**
 * Find the team the user wrote: its ESPN id, or its abbreviation when only one
 * team of the league carries it (Top 14 has three "STA").
 * @returns {{ team?: object, error?: 'not_found' | 'ambiguous', candidates?: object[] }}
 */
export function findTeam(teams, query) {
  const wanted = text(query).trim().toUpperCase();
  const byId = teams.find((team) => team.id === wanted);
  if (byId) {
    return { team: byId };
  }
  const byAbbreviation = teams.filter((team) => team.abbreviation.toUpperCase() === wanted);
  if (byAbbreviation.length === 1) {
    return { team: byAbbreviation[0] };
  }
  if (byAbbreviation.length > 1) {
    return { error: 'ambiguous', candidates: byAbbreviation };
  }
  return { error: 'not_found', candidates: [] };
}

/**
 * The match of an ESPN event as seen from `teamId`, or null when the team
 * does not play it.
 * @returns {Match | null}
 */
export function matchFromEvent(event, teamId) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const mine = competitors.find((c) => text(c.team?.id ?? c.id) === text(teamId));
  const other = competitors.find((c) => c !== mine);
  if (!mine || !other) {
    return null;
  }
  const status = competition.status ?? event.status ?? {};
  const type = status.type ?? {};
  const state = STATES.includes(type.state) ? type.state : 'pre';
  const team = { ...readTeam(mine.team), score: readScore(mine.score) };
  const opponent = { ...readTeam(other.team), score: readScore(other.score) };
  const completed = state === 'post' && type.completed === true;

  let result = null;
  if (completed) {
    // `winner` decides a penalty shootout the scores call a draw.
    if (mine.winner === true) result = 'win';
    else if (other.winner === true) result = 'loss';
    else if (team.score > opponent.score) result = 'win';
    else if (team.score < opponent.score) result = 'loss';
    else result = 'draw';
  }

  return {
    id: text(event.id || competition.id),
    state,
    completed,
    statusName: text(type.name),
    detail: text(type.shortDetail || type.detail || type.description),
    kickoff: text(competition.date || event.date),
    homeAway: mine.homeAway === 'away' ? 'away' : 'home',
    team: { id: team.id, abbreviation: team.abbreviation, name: team.name, score: team.score },
    opponent: {
      id: opponent.id,
      abbreviation: opponent.abbreviation,
      name: opponent.name,
      score: opponent.score,
    },
    result,
    venue: text(competition.venue?.fullName),
  };
}

// A finished match stays on display this long after its kickoff, before the
// next one takes its place.
const RECENT_POST_MS = 18 * 60 * 60 * 1000;

/**
 * Pick the match of `teamId` on a scoreboard. A week scoreboard (NFL) or a
 * tournament day may list several: a live one wins, then a match finished in
 * the last hours, then the next one to come.
 * @returns {Match | null}
 */
export function findMatchInScoreboard(json, teamId, now = Date.now()) {
  const matches = (json?.events ?? [])
    .map((event) => matchFromEvent(event, teamId))
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  if (matches.length === 0) {
    return null;
  }
  const live = matches.find((match) => match.state === 'in');
  if (live) {
    return live;
  }
  const recent = matches
    .filter((match) => match.state === 'post' && now - Date.parse(match.kickoff) < RECENT_POST_MS)
    .at(-1);
  if (recent) {
    return recent;
  }
  return matches.find((match) => match.state === 'pre') ?? matches.at(-1);
}

/** The team and its next (or current) match, from the `teams/<id>` endpoint. */
export function parseTeamDetail(json) {
  const raw = json?.team;
  if (!raw) {
    return { team: null, match: null };
  }
  const team = readTeam(raw);
  const event = (raw.nextEvent ?? [])[0];
  return { team, match: event ? matchFromEvent(event, team.id) : null };
}
