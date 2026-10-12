import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchInScoreboard,
  findTeam,
  matchFromEvent,
  parseTeamDetail,
  parseTeamsList,
} from '../src/espn/parse.js';
import { fixture, withState } from './helpers/fakeEspn.js';

const lig1 = fixture('lig1-scoreboard');
const NICE = '2502';
const STR = '180';

test('a finished match reads from the followed team side, with its result', () => {
  const nice = matchFromEvent(lig1.events[0], NICE);
  assert.equal(nice.state, 'post');
  assert.equal(nice.completed, true);
  assert.equal(nice.homeAway, 'home');
  assert.deepEqual([nice.team.abbreviation, nice.team.score], ['NICE', 2]);
  assert.deepEqual([nice.opponent.abbreviation, nice.opponent.score], ['STR', 1]);
  assert.equal(nice.result, 'win');

  const strasbourg = matchFromEvent(lig1.events[0], STR);
  assert.equal(strasbourg.homeAway, 'away');
  assert.equal(strasbourg.result, 'loss');
});

test('a team that does not play the event gets no match', () => {
  assert.equal(matchFromEvent(lig1.events[0], '160'), null);
  assert.equal(matchFromEvent({}, '160'), null);
});

test('a draw, and a shootout decided by the winner flag', () => {
  const draw = withState(lig1.events[0], { state: 'post', scores: { [NICE]: 1, [STR]: 1 } });
  assert.equal(matchFromEvent(draw, NICE).result, 'draw');
  draw.competitions[0].competitors.find((c) => c.team.id === STR).winner = true;
  assert.equal(matchFromEvent(draw, NICE).result, 'loss');
});

test('a postponed match is over without a result', () => {
  const postponed = withState(lig1.events[0], {
    state: 'post',
    completed: false,
    name: 'STATUS_POSTPONED',
  });
  const match = matchFromEvent(postponed, NICE);
  assert.equal(match.completed, false);
  assert.equal(match.result, null);
});

test('scores given as objects (team pages) read as numbers', () => {
  const event = withState(lig1.events[0], { state: 'in' });
  event.competitions[0].competitors[0].score = { value: 3, displayValue: '3' };
  event.competitions[0].competitors[1].score = undefined;
  const match = matchFromEvent(event, NICE);
  assert.equal(match.team.score, 3);
  assert.equal(match.opponent.score, 0);
});

test('on a scoreboard, a live match wins over the others of the week', () => {
  const live = withState(lig1.events[0], {
    state: 'in',
    date: '2026-10-12T13:00:00Z',
    scores: { [NICE]: 1 },
  });
  const board = { events: [lig1.events[0], live] };
  assert.equal(findMatchInScoreboard(board, NICE, Date.parse('2026-10-12T14:00Z')).state, 'in');
});

test('a match finished in the last hours stays shown, an older one gives way', () => {
  const next = withState(lig1.events[0], { state: 'pre', date: '2026-10-18T13:00:00Z' });
  next.id = 'next';
  const board = { events: [lig1.events[0], next] };
  // NICE–STR kicked off on 2026-10-11 at 13:00Z.
  assert.equal(findMatchInScoreboard(board, NICE, Date.parse('2026-10-11T20:00Z')).state, 'post');
  assert.equal(findMatchInScoreboard(board, NICE, Date.parse('2026-10-13T20:00Z')).id, 'next');
  assert.equal(findMatchInScoreboard(board, '160', Date.now()), null);
});

test('teams of a league, found by id or by a unique abbreviation', () => {
  const lig1Teams = parseTeamsList(fixture('lig1-teams'));
  assert.ok(lig1Teams.length > 10);
  assert.equal(findTeam(lig1Teams, 'psg').team.name, 'Paris Saint-Germain');
  assert.equal(findTeam(lig1Teams, '160').team.abbreviation, 'PSG');
  assert.equal(findTeam(lig1Teams, 'XYZ').error, 'not_found');

  // Top 14: La Rochelle, Stade Francais and Stade Toulousain are all "STA".
  const top14 = parseTeamsList(fixture('top14-teams'));
  const sta = findTeam(top14, 'STA');
  assert.equal(sta.error, 'ambiguous');
  assert.equal(sta.candidates.length, 3);
  assert.equal(findTeam(top14, 'RAC').team.name, 'Racing 92');
});

test('a team page gives the team and its next match', () => {
  const { team, match } = parseTeamDetail(fixture('psg-team'));
  assert.equal(team.id, '160');
  assert.match(team.logo, /^https:\/\/a\.espncdn\.com\//);
  assert.equal(match.state, 'pre');
  assert.equal(match.homeAway, 'away');
  assert.equal(match.opponent.abbreviation, 'STR');
  assert.deepEqual(parseTeamDetail({}), { team: null, match: null });
});
