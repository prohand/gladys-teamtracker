// -----------------------------------------------------------------------------
// Device type: FOLLOWED TEAM
//
// One Gladys device per followed team, three read-only features:
//   - team-score      the team's score in the current (or last) match;
//   - opponent-score  the opponent's score;
//   - status          one line: "Live · 63' · PSG 2 – 1 OM", "Next · Sat…".
//
// Scores are `counter-sensor` integers, so scene conditions can compare them
// ("if my team leads"). The status is a `text` feature: Gladys shows it as is
// and never marks it as outdated.
//
// The external id is built from the ESPN team id and the league, never from
// what the user typed: "LIG1:PSG" and "LIG1:160" are the same device, and the
// device survives a change of abbreviation.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { formatStatus } from '../format.js';
import { leagueKey } from '../leagues.js';

export const DEVICE_TYPE = 'team';

export const FEATURE = {
  TEAM_SCORE: 'team-score',
  OPPONENT_SCORE: 'opponent-score',
  STATUS: 'status',
};

const FEATURE_NAMES = {
  en: {
    [FEATURE.TEAM_SCORE]: 'Score',
    [FEATURE.OPPONENT_SCORE]: 'Opponent score',
    [FEATURE.STATUS]: 'Match',
  },
  fr: {
    [FEATURE.TEAM_SCORE]: 'Score',
    [FEATURE.OPPONENT_SCORE]: 'Score adverse',
    [FEATURE.STATUS]: 'Match',
  },
  de: {
    [FEATURE.TEAM_SCORE]: 'Punkte',
    [FEATURE.OPPONENT_SCORE]: 'Punkte des Gegners',
    [FEATURE.STATUS]: 'Spiel',
  },
  es: {
    [FEATURE.TEAM_SCORE]: 'Puntos',
    [FEATURE.OPPONENT_SCORE]: 'Puntos del rival',
    [FEATURE.STATUS]: 'Partido',
  },
};

// Highest score a feature accepts: basketball goes past 150, nothing past 999.
const MAX_SCORE = 999;

/**
 * Ids of a followed team's device and features.
 * @param {{ sport: string, league: string }} league
 * @param {string} teamId ESPN team id
 */
export function teamExternalIds(gladys, league, teamId) {
  return gladys.externalIds(DEVICE_TYPE, `${leagueKey(league)}.${teamId}`);
}

/**
 * Discovery payload of a followed team.
 * @param {{ spec: object, info: { id: string, name: string } }} tracked
 */
export function buildTeamDevice(gladys, tracked, config) {
  const ids = teamExternalIds(gladys, tracked.spec, tracked.info.id);
  const names = FEATURE_NAMES[config.language] ?? FEATURE_NAMES.en;
  const score = (key) => ({
    name: names[key],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    min: 0,
    max: MAX_SCORE,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  });
  return {
    name: `${tracked.info.name} (${tracked.spec.leagueName})`,
    external_id: ids.device,
    features: [
      score(FEATURE.TEAM_SCORE),
      score(FEATURE.OPPONENT_SCORE),
      {
        name: names[FEATURE.STATUS],
        external_id: ids.feature(FEATURE.STATUS),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        // Gladys stores min/max as NOT NULL, text features included.
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}

/**
 * States of a followed team, in the `publishStates` shape. Before a match
 * (`pre`) the scores read 0: a condition "my team leads" must not hold on the
 * score of the previous match.
 */
export function teamStates(gladys, tracked, config) {
  const ids = teamExternalIds(gladys, tracked.spec, tracked.info.id);
  const { match } = tracked;
  const states = [];
  if (match) {
    const live = match.state !== 'pre';
    states.push(
      {
        device_feature_external_id: ids.feature(FEATURE.TEAM_SCORE),
        state: live ? match.team.score : 0,
      },
      {
        device_feature_external_id: ids.feature(FEATURE.OPPONENT_SCORE),
        state: live ? match.opponent.score : 0,
      },
    );
  }
  states.push({
    device_feature_external_id: ids.feature(FEATURE.STATUS),
    text: formatStatus(match, config),
  });
  return states;
}
