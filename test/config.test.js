import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, MAX_TEAMS, normalizeConfig, parseTeams } from '../src/config.js';
import { LEAGUES, parseLeague } from '../src/leagues.js';

test('normalizeConfig fills the defaults and forces the types', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({
    teams: 'LIG1:PSG',
    live_refresh: '45',
    idle_refresh: 1,
    reminder_minutes: 'abc',
    language: 'it',
    timezone: 'Not/AZone',
  });
  assert.equal(config.live_refresh, 45);
  assert.equal(config.idle_refresh, 5, 'clamped to the manifest minimum');
  assert.equal(config.reminder_minutes, DEFAULT_CONFIG.reminder_minutes);
  assert.equal(config.language, 'en', 'a language the integration does not write falls back');
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'es' }).language, 'es');
  assert.equal(config.timezone, DEFAULT_CONFIG.timezone);
  assert.equal(normalizeConfig({ timezone: 'America/New_York' }).timezone, 'America/New_York');
});

test('teams are LEAGUE:TEAM entries, separated by commas, semicolons or lines', () => {
  const { teams, errors } = parseTeams(' LIG1:PSG ; nfl : kc\nsoccer/por.1:SLB, TOP14:25922');
  assert.deepEqual(errors, []);
  assert.deepEqual(
    teams.map((t) => [t.sport, t.league, t.team, t.leagueCode]),
    [
      ['soccer', 'fra.1', 'PSG', 'LIG1'],
      ['football', 'nfl', 'kc', 'NFL'],
      ['soccer', 'por.1', 'SLB', 'soccer/por.1'],
      ['rugby', '270559', '25922', 'TOP14'],
    ],
  );
});

test('wrong entries are reported, the right ones kept', () => {
  const { teams, errors } = parseTeams('PSG, XX:PSG, LIG1:PSG, lig1:psg, LIG1:P$G, a/b/c:X');
  assert.equal(teams.length, 1);
  assert.deepEqual(
    errors.map((e) => e.reason),
    ['format', 'league', 'duplicate', 'format', 'league'],
  );
});

test(`at most ${MAX_TEAMS} teams`, () => {
  const entries = Array.from({ length: MAX_TEAMS + 2 }, (_, i) => `NBA:${i + 1}`).join(',');
  const { teams, errors } = parseTeams(entries);
  assert.equal(teams.length, MAX_TEAMS);
  assert.deepEqual(
    errors.map((e) => e.reason),
    ['limit', 'limit'],
  );
});

test('league codes, and ESPN paths that name a known league, resolve to it', () => {
  assert.equal(parseLeague('lig1').league, 'fra.1');
  assert.equal(parseLeague('soccer/fra.1').code, 'LIG1');
  assert.equal(parseLeague('soccer/../x'), null);
  assert.equal(parseLeague('soccer/fra 1'), null);
  for (const [code, league] of Object.entries(LEAGUES)) {
    assert.match(code, /^[A-Z0-9]+$/, 'codes are what users type: plain capitals');
    assert.ok(league.sport && league.league && league.name);
  }
});
