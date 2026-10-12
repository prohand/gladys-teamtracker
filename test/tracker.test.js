import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../src/config.js';
import { TRIGGERS } from '../src/events.js';
import { createStore } from '../src/store.js';
import { Tracker } from '../src/tracker.js';
import { createFakeEspn, fixture, withState } from './helpers/fakeEspn.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const PSG = '160';
const STR = '180';
const psgEvent = fixture('psg-team').team.nextEvent[0];

function setup({ teams = 'LIG1:PSG, LIG1:NICE', now = '2026-10-11T20:00Z', store, ...rest } = {}) {
  const gladys = createFakeGladys();
  const espn = createFakeEspn();
  const clock = { now: Date.parse(now) };
  const timers = [];
  let changes = 0;
  const tracker = new Tracker({
    gladys,
    client: espn,
    store,
    now: () => clock.now,
    setTimer: (fn, ms) => {
      timers.push(ms);
      return timers.length;
    },
    clearTimer: () => {},
    onChange: () => {
      changes += 1;
    },
  });
  tracker.configure(normalizeConfig({ teams, ...rest }));
  return { gladys, espn, clock, tracker, timers, changes: () => changes };
}

/** Put PSG's next match on the Ligue 1 scoreboard, in the given state. */
function psgOnScoreboard(espn, state, psg = 0, str = 0) {
  espn.scoreboards['soccer/fra.1'].events = [
    withState(psgEvent, { state, scores: { [PSG]: psg, [STR]: str } }),
  ];
}

const statesOf = (gladys, suffix) =>
  gladys.published.filter((p) => p.featureExternalId.endsWith(suffix)).map((p) => p.state);

test('the first reading resolves the teams and publishes one device per team', async () => {
  const { gladys, espn, tracker } = setup();
  await tracker.refresh();

  assert.deepEqual(espn.calls, [
    'teams soccer/fra.1',
    'scoreboard soccer/fra.1',
    // PSG does not play today: its next match comes from its page.
    'team soccer/fra.1/160',
  ]);
  const devices = gladys.discovered.at(-1);
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['Paris Saint-Germain (Ligue 1)', 'ext:test:team:soccer.fra.1.160'],
      ['Nice (Ligue 1)', 'ext:test:team:soccer.fra.1.2502'],
    ],
  );
  for (const device of devices) {
    for (const feature of device.features) {
      assert.equal(feature.read_only, true);
      assert.ok(Number.isFinite(feature.min) && Number.isFinite(feature.max), 'min/max NOT NULL');
    }
  }
  // Nothing created yet: no state is sent, no scene event on a baseline.
  assert.deepEqual(gladys.published, []);
  assert.deepEqual(gladys.sceneEvents, []);
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });
  assert.deepEqual(
    gladys.transports.map((t) => t.transport),
    ['cloud', 'cloud'],
  );
});

test('created devices get their scores and status line', async () => {
  const { gladys, tracker } = setup({ language: 'fr' });
  await tracker.refresh();
  gladys.createAll();
  await tracker.refresh();

  assert.deepEqual(statesOf(gladys, '2502:team-score'), [2]);
  assert.deepEqual(statesOf(gladys, '2502:opponent-score'), [1]);
  assert.deepEqual(statesOf(gladys, '2502:status'), ['Terminé · NICE 2 – 1 STR · Victoire']);
  // Before a match, the scores read 0; the kickoff is in the configured zone.
  assert.deepEqual(statesOf(gladys, '160:team-score'), [0]);
  assert.match(
    statesOf(gladys, '160:status')[0],
    /^Prochain match · sam\. 17 oct\.?,? 17:15 · à STR$/,
  );

  // Same values: nothing sent again.
  const count = gladys.published.length;
  await tracker.refresh();
  assert.equal(gladys.published.length, count);
});

test('unchanged states are sent again after 6 hours, and all of them after a reconnection', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-11T20:00Z') });
  const { gladys, tracker } = setup();
  await tracker.refresh();
  gladys.createAll();
  await tracker.refresh();
  const first = gladys.published.length;
  assert.ok(first > 0);

  t.mock.timers.tick(5 * 60 * 60 * 1000);
  await tracker.refresh();
  assert.equal(gladys.published.length, first, 'still fresh: nothing sent');

  // Gladys flags a value older than 48 h: the heartbeat re-sends it.
  t.mock.timers.tick(60 * 60 * 1000);
  await tracker.refresh();
  assert.equal(gladys.published.length, 2 * first);

  tracker.resetPublished();
  await tracker.refresh();
  assert.equal(gladys.published.length, 3 * first);
});

test('a whole match fires each scene event once, in order', async () => {
  const { gladys, espn, clock, tracker } = setup({ teams: 'LIG1:PSG' });
  const step = async (iso, state, psg, str) => {
    clock.now = Date.parse(iso);
    psgOnScoreboard(espn, state, psg, str);
    await tracker.refresh();
    return gladys.sceneEvents.splice(0).map((e) => e.key);
  };

  assert.deepEqual(await step('2026-10-17T13:00Z', 'pre'), []);
  assert.deepEqual(await step('2026-10-17T14:50Z', 'pre'), [TRIGGERS.MATCH_SOON]);
  assert.deepEqual(await step('2026-10-17T14:55Z', 'pre'), []);
  assert.deepEqual(await step('2026-10-17T15:16Z', 'in', 0, 0), [TRIGGERS.MATCH_STARTED]);
  assert.deepEqual(await step('2026-10-17T15:30Z', 'in', 1, 0), [TRIGGERS.TEAM_SCORED]);
  assert.deepEqual(await step('2026-10-17T15:31Z', 'in', 1, 0), []);
  assert.deepEqual(await step('2026-10-17T16:00Z', 'in', 1, 1), [TRIGGERS.OPPONENT_SCORED]);
  assert.deepEqual(await step('2026-10-17T17:10Z', 'post', 2, 1), [
    TRIGGERS.TEAM_SCORED,
    TRIGGERS.MATCH_ENDED,
  ]);
  assert.deepEqual(await step('2026-10-17T17:20Z', 'post', 2, 1), []);
});

test('scene event data: the team device, the score and the details', async () => {
  const { gladys, espn, clock, tracker } = setup({ teams: 'LIG1:PSG' });
  clock.now = Date.parse('2026-10-17T15:20Z');
  psgOnScoreboard(espn, 'in', 0, 0);
  await tracker.refresh();
  psgOnScoreboard(espn, 'in', 1, 0);
  await tracker.refresh();

  const [scored] = gladys.sceneEvents.filter((e) => e.key === TRIGGERS.TEAM_SCORED);
  assert.deepEqual(scored.data, {
    team: 'ext:test:team:soccer.fra.1.160',
    team_name: 'Paris Saint-Germain',
    opponent: 'Strasbourg',
    home_away: 'away',
    league: 'Ligue 1',
    team_score: 1,
    opponent_score: 0,
    points: 1,
    summary: "Live · 63' · PSG 1 – 0 STR",
  });
});

test('the pace follows the matches', async () => {
  const { espn, clock, tracker } = setup({ teams: 'LIG1:PSG' });
  // Next match on 17/10 at 15:15Z, reminder 30 min: wake at the reminder.
  clock.now = Date.parse('2026-10-17T14:30Z');
  await tracker.refresh();
  assert.equal(tracker.nextDelay(), 15 * 60_000, 'the 15-minute idle pace is sooner');
  clock.now = Date.parse('2026-10-17T14:40Z');
  assert.equal(tracker.nextDelay(), 5 * 60_000, 'wakes for the reminder at 14:45');
  clock.now = Date.parse('2026-10-17T15:05Z');
  assert.equal(tracker.nextDelay(), 10 * 60_000, 'then for the kickoff');
  // Kickoff passed, still "pre" on ESPN: read at the live pace.
  clock.now = Date.parse('2026-10-17T15:17Z');
  assert.equal(tracker.nextDelay(), 30_000);
  psgOnScoreboard(espn, 'in', 0, 0);
  await tracker.refresh();
  assert.equal(tracker.nextDelay(), 30_000);
  psgOnScoreboard(espn, 'post', 1, 0);
  await tracker.refresh();
  assert.equal(tracker.nextDelay(), 15 * 60_000);
});

test('a refresh asked during a reading joins it', async () => {
  const { espn, tracker } = setup();
  await Promise.all([tracker.refresh(), tracker.refresh(), tracker.refresh()]);
  assert.equal(espn.calls.filter((c) => c.startsWith('scoreboard')).length, 1);
});

test('the team page is not read at every cycle, until the match comes close', async () => {
  const { espn, clock, tracker } = setup({ teams: 'LIG1:PSG' });
  await tracker.refresh();
  clock.now += 30 * 60_000;
  await tracker.refresh();
  assert.equal(espn.calls.filter((c) => c.startsWith('team soccer')).length, 1);
  clock.now = Date.parse('2026-10-17T14:30Z');
  await tracker.refresh();
  await tracker.refresh();
  assert.equal(espn.calls.filter((c) => c.startsWith('team soccer')).length, 3);
});

test('ESPN down: last scores kept, badge unreachable, status disconnected', async () => {
  const { gladys, espn, tracker } = setup();
  await tracker.refresh();
  gladys.createAll();
  await tracker.refresh();
  const published = gladys.published.length;

  espn.failing = true;
  await tracker.refresh();
  assert.equal(gladys.published.length, published, 'an outage is not "no match"');
  assert.deepEqual(
    gladys.transports.slice(-2).map((t) => t.transport),
    ['unreachable', 'unreachable'],
  );
  assert.equal(gladys.connectionStatuses.at(-1).connected, false);
  assert.match(gladys.connectionStatuses.at(-1).message.en, /Not followed: LIG1:PSG, LIG1:NICE/);

  espn.failing = false;
  await tracker.refresh();
  assert.equal(gladys.connectionStatuses.at(-1).connected, true);
  assert.deepEqual(
    gladys.transports.slice(-2).map((t) => t.transport),
    ['cloud', 'cloud'],
  );
});

test('wrong entries and ambiguous abbreviations are reported, not followed', async () => {
  const { gladys, espn, tracker } = setup({ teams: 'TOP14:STA, XX:PSG, LIG1:NICE' });
  espn.scoreboards['rugby/270559'] = { events: [] };
  await tracker.refresh();
  const [sta] = tracker.list();
  assert.equal(sta.resolveError, 'ambiguous');
  assert.equal(sta.candidates.length, 3);
  assert.equal(gladys.discovered.at(-1).length, 1);
  const status = gladys.connectionStatuses.at(-1);
  assert.equal(status.connected, true, 'NICE is followed');
  assert.match(status.message.en, /TOP14:STA/);
  assert.match(status.message.en, /XX:PSG/);
});

test('no team configured: the status says what to do', async () => {
  const { gladys, tracker } = setup({ teams: '' });
  await tracker.refresh();
  assert.equal(gladys.connectionStatuses.at(-1).connected, false);
  assert.match(gladys.connectionStatuses.at(-1).message.en, /Add at least one team/);
});

test('a restart during a match neither replays nor misses a goal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'teamtracker-'));
  try {
    const store = createStore(join(dir, 'state.json'));
    const first = setup({ teams: 'LIG1:PSG', now: '2026-10-17T15:20Z', store });
    await first.tracker.load();
    first.tracker.configure(normalizeConfig({ teams: 'LIG1:PSG' }));
    psgOnScoreboard(first.espn, 'in', 1, 0);
    await first.tracker.refresh();
    assert.deepEqual(first.gladys.sceneEvents, [], 'first reading: baseline');

    // New process, same /data. The score did not move: nothing fires.
    const second = setup({ teams: 'LIG1:PSG', now: '2026-10-17T15:40Z', store });
    await second.tracker.load();
    second.tracker.configure(normalizeConfig({ teams: 'LIG1:PSG' }));
    psgOnScoreboard(second.espn, 'in', 1, 0);
    await second.tracker.refresh();
    assert.deepEqual(second.gladys.sceneEvents, []);
    // The team was remembered: no need to read the league's team list again.
    assert.ok(!second.espn.calls.includes('teams soccer/fra.1'));

    psgOnScoreboard(second.espn, 'in', 2, 0);
    await second.tracker.refresh();
    assert.deepEqual(
      second.gladys.sceneEvents.map((e) => e.key),
      [TRIGGERS.TEAM_SCORED],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the next reading is planned only while running', async () => {
  const { tracker, timers } = setup();
  await tracker.refresh();
  assert.deepEqual(timers, []);
  await tracker.start();
  assert.equal(timers.length, 1);
  tracker.stop();
  await tracker.refresh();
  assert.equal(timers.length, 1);
});

test('a fresh refresh asked during a reading runs another one after it', async () => {
  const { espn, tracker } = setup();
  await Promise.all([tracker.refresh(), tracker.refresh({ fresh: true })]);
  assert.equal(espn.calls.filter((c) => c.startsWith('scoreboard')).length, 2);
});
