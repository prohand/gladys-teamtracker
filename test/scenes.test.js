import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeConfig } from '../src/config.js';
import { GET_MATCH, createSceneActions, matchOutputs } from '../src/scenes.js';
import { Tracker } from '../src/tracker.js';
import { createFakeEspn, fixture, withState } from './helpers/fakeEspn.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

async function setup() {
  const gladys = createFakeGladys();
  const espn = createFakeEspn();
  const config = normalizeConfig({ teams: 'LIG1:PSG, LIG1:NICE' });
  const clock = { now: Date.parse('2026-10-17T15:20Z') };
  const tracker = new Tracker({ gladys, client: espn, now: () => clock.now });
  tracker.configure(config);
  return { gladys, espn, config, tracker, clock };
}

test('get_match answers every declared output, from the cache only', async () => {
  const { gladys, espn, config, tracker } = await setup();
  await tracker.refresh();
  const calls = espn.calls.length;
  const actions = createSceneActions(tracker);
  const outputs = await actions[GET_MATCH](gladys, {
    fields: { team: 'ext:test:team:soccer.fra.1.2502' },
    config,
  });
  assert.equal(espn.calls.length, calls, 'a scene action never reads ESPN (no event loop)');

  const declared = manifest.scene_actions.find((a) => a.key === GET_MATCH).outputs;
  assert.deepEqual(Object.keys(outputs).sort(), declared.map((o) => o.key).sort());
  for (const { key, type } of declared) {
    assert.equal(typeof outputs[key], type, `output ${key}`);
  }
  assert.equal(outputs.state, 'post');
  assert.equal(outputs.result, 'win');
  assert.equal(outputs.summary, 'Final · NICE 2 – 1 STR · Win');
});

test('get_match on a team no longer followed fails this action only', async () => {
  const { gladys, config, tracker } = await setup();
  await tracker.refresh();
  const actions = createSceneActions(tracker);
  await assert.rejects(
    actions[GET_MATCH](gladys, { fields: { team: 'ext:test:team:nope' }, config }),
    /not a followed team/,
  );
});

test('without a match, the outputs are neutral', () => {
  const outputs = matchOutputs({ match: null }, normalizeConfig());
  assert.deepEqual(outputs, {
    state: 'none',
    is_live: false,
    team_score: 0,
    opponent_score: 0,
    opponent: '',
    kickoff: '',
    result: '',
    summary: 'No match scheduled',
  });
});

test('every scene event carries only keys its trigger declares', async () => {
  const { gladys, espn, tracker, clock } = await setup();
  const event = fixture('psg-team').team.nextEvent[0];
  const play = async (iso, state, psg, str) => {
    clock.now = Date.parse(iso);
    espn.scoreboards['soccer/fra.1'].events = [
      withState(event, { state, scores: { 160: psg, 180: str } }),
    ];
    await tracker.refresh();
  };
  await play('2026-10-17T14:00Z', 'pre', 0, 0);
  await play('2026-10-17T14:50Z', 'pre', 0, 0);
  await play('2026-10-17T15:16Z', 'in', 0, 0);
  await play('2026-10-17T15:30Z', 'in', 1, 1);
  await play('2026-10-17T17:10Z', 'post', 1, 1);

  const fired = new Set(gladys.sceneEvents.map((e) => e.key));
  assert.deepEqual(
    [...fired].sort(),
    manifest.scene_triggers.map((t) => t.key).sort(),
    'the scenario fires every declared trigger',
  );
  for (const { key, data } of gladys.sceneEvents) {
    const trigger = manifest.scene_triggers.find((t) => t.key === key);
    const declared = new Set([...trigger.fields, ...trigger.variables].map((f) => f.key));
    assert.ok(Object.keys(data).length <= 30, 'at most 30 keys');
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.has(name), `${key}.${name} is not declared`);
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    }
    for (const field of trigger.fields) {
      assert.ok(field.key in data, `${key}: the filter ${field.key} has no value to match`);
    }
  }
  const ended = gladys.sceneEvents.find((e) => e.key === 'match_ended');
  assert.equal(ended.data.result, 'draw');
});
