// -----------------------------------------------------------------------------
// Fake ESPN client: serves the fixtures of test/fixtures (real ESPN answers,
// trimmed) and lets a test rewrite them, e.g. to put a match live or to make
// the API fail. Counts the calls, so the tests can check the request budget.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

export function createFakeEspn() {
  const espn = {
    calls: [],
    failing: false,
    scoreboards: {
      'soccer/fra.1': fixture('lig1-scoreboard'),
      'football/nfl': fixture('nfl-scoreboard'),
    },
    teamLists: {
      'soccer/fra.1': fixture('lig1-teams'),
      'rugby/270559': fixture('top14-teams'),
    },
    teamPages: {
      'soccer/fra.1/160': fixture('psg-team'),
    },

    answer(table, key) {
      if (espn.failing) {
        throw new Error('ESPN HTTP 503');
      }
      if (!(key in table)) {
        throw new Error(`ESPN HTTP 404 (${key})`);
      }
      return structuredClone(table[key]);
    },

    async scoreboard(sport, league) {
      espn.calls.push(`scoreboard ${sport}/${league}`);
      return espn.answer(espn.scoreboards, `${sport}/${league}`);
    },
    async teams(sport, league) {
      espn.calls.push(`teams ${sport}/${league}`);
      return espn.answer(espn.teamLists, `${sport}/${league}`);
    },
    async team(sport, league, id) {
      espn.calls.push(`team ${sport}/${league}/${id}`);
      return espn.answer(espn.teamPages, `${sport}/${league}/${id}`);
    },
    async logo(url) {
      espn.calls.push(`logo ${url}`);
      // A 1×1 PNG.
      return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
    },
  };
  return espn;
}

/**
 * A scoreboard event of `fixtureEvent` turned into the given state and
 * score, for the team ids it already holds.
 * @param {object} event an event of a scoreboard fixture
 * @param {{ state: 'pre' | 'in' | 'post', scores?: Record<string, number>,
 *   date?: string, detail?: string, completed?: boolean, name?: string }} change
 */
export function withState(event, { state, scores = {}, date, detail, completed, name }) {
  const copy = structuredClone(event);
  const competition = copy.competitions[0];
  const type = {
    name:
      name ?? { pre: 'STATUS_SCHEDULED', in: 'STATUS_FIRST_HALF', post: 'STATUS_FULL_TIME' }[state],
    state,
    completed: completed ?? state === 'post',
    description: state,
    detail: detail ?? (state === 'in' ? "63'" : state === 'post' ? 'FT' : '10/17 - 11:15 AM EDT'),
    shortDetail:
      detail ?? (state === 'in' ? "63'" : state === 'post' ? 'FT' : '10/17 - 11:15 AM EDT'),
  };
  copy.status = { ...copy.status, type };
  competition.status = { ...competition.status, type };
  if (date) {
    copy.date = date;
    competition.date = date;
  }
  for (const competitor of competition.competitors) {
    const id = competitor.team.id;
    competitor.score = String(scores[id] ?? 0);
    delete competitor.winner;
  }
  return copy;
}
