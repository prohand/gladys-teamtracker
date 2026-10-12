import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTeams, testTeams } from '../src/actions.js';
import { normalizeConfig } from '../src/config.js';
import { Tracker } from '../src/tracker.js';
import { createFakeEspn } from './helpers/fakeEspn.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function setup(teams) {
  const espn = createFakeEspn();
  espn.scoreboards['rugby/270559'] = { events: [] };
  const tracker = new Tracker({
    gladys: createFakeGladys(),
    client: espn,
    now: () => Date.parse('2026-10-11T20:00Z'),
  });
  tracker.configure(normalizeConfig({ teams }));
  return { espn, tracker };
}

test('test_teams explains every entry, in both languages', async () => {
  const { tracker } = setup('LIG1:NICE, LIG1:XYZ, TOP14:STA, NOPE:PSG, LIG1');
  const message = await testTeams(tracker);
  const lines = message.en.split('\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[0], 'Nice (Ligue 1): Final · NICE 2 – 1 STR · Win');
  assert.match(lines[1], /^LIG1:XYZ: no such team/);
  assert.match(lines[2], /TOP14:119318 \(La Rochelle\) or TOP14:25921/);
  assert.match(lines[3], /^NOPE:PSG: unknown league code/);
  assert.match(lines[4], /^LIG1: write it LEAGUE:TEAM/);
  assert.equal(message.fr.split('\n').length, 5);
  assert.match(message.fr, /Terminé · NICE 2 – 1 STR · Victoire/);
});

test('test_teams without any team says how to add one', async () => {
  const { tracker } = setup('');
  assert.match((await testTeams(tracker)).en, /No team to follow yet/);
});

test('find_team lists the line to paste, by abbreviation or by id when shared', async () => {
  const { tracker } = setup('');
  const paris = await findTeams(tracker, { league: 'LIG1', search: 'paris' });
  assert.deepEqual(paris.en.split('\n').slice(1), [
    'LIG1:PAR — Paris FC',
    'LIG1:PSG — Paris Saint-Germain',
  ]);

  // Three Top 14 teams are "STA": the id is the only safe thing to paste.
  const stade = await findTeams(tracker, { league: 'TOP14', search: 'stade' });
  assert.match(stade.en, /TOP14:25921 — Stade Francais Paris/);
  assert.match(stade.en, /TOP14:25922 — Stade Toulousain/);

  const accents = await findTeams(tracker, { league: 'TOP14', search: 'BÈGLES' });
  assert.match(accents.en, /TOP14:UNI — Bordeaux Begles/);

  assert.match((await findTeams(tracker, { league: 'LIG1', search: 'zzz' })).en, /No team/);
  assert.match((await findTeams(tracker, { league: 'XX' })).en, /Unknown league/);
});

test('find_team reads the team list once a day at most', async () => {
  const { espn, tracker } = setup('');
  await findTeams(tracker, { league: 'LIG1' });
  await findTeams(tracker, { league: 'LIG1', search: 'nice' });
  assert.equal(espn.calls.filter((c) => c === 'teams soccer/fra.1').length, 1);
  espn.failing = true;
  assert.match((await findTeams(tracker, { league: 'TOP14' })).en, /ESPN did not answer/);
});
