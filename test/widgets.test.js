import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { Tracker } from '../src/tracker.js';
import {
  createWidgets,
  logoKey,
  MY_TEAMS_WIDGET,
  refreshWidgets,
  TEAM_MATCH_WIDGET,
  WIDGET_KEYS,
  widgetImage,
} from '../src/widgets.js';
import { createFakeEspn, fixture, withState } from './helpers/fakeEspn.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const PSG_DEVICE = 'ext:test:team:soccer.fra.1.160';
const NICE_DEVICE = 'ext:test:team:soccer.fra.1.2502';

async function setup(teams = 'LIG1:PSG, LIG1:NICE') {
  const gladys = createFakeGladys();
  const espn = createFakeEspn();
  const config = normalizeConfig({ teams });
  const tracker = new Tracker({ gladys, client: espn, now: () => Date.parse('2026-10-11T20:00Z') });
  tracker.configure(config);
  await tracker.refresh();
  const widgets = createWidgets(tracker);
  const get = (key, settings = {}) =>
    widgets[key].get(gladys, { settings, language: 'en', units: 'metric', config });
  return { gladys, espn, config, tracker, widgets, get };
}

test('every content is rendered exactly as sent', async () => {
  const { get, gladys } = await setup();
  const contents = [
    await get(TEAM_MATCH_WIDGET, { team: PSG_DEVICE }), // next match
    await get(TEAM_MATCH_WIDGET, { team: NICE_DEVICE }), // finished
    await get(TEAM_MATCH_WIDGET, {}), // no team chosen
    await get(MY_TEAMS_WIDGET),
  ];
  gladys.createAll();
  contents.push(await get(TEAM_MATCH_WIDGET, { team: NICE_DEVICE }));
  for (const content of contents) {
    // [] = nothing the core would drop, truncate or trim to the budget.
    assert.deepEqual(validateWidgetContent(content), []);
  }
});

test('a live match: live TTL, LIVE badge, valid content', async () => {
  const { espn, tracker, get } = await setup();
  const live = withState(fixture('psg-team').team.nextEvent[0], {
    state: 'in',
    scores: { 160: 2, 180: 1 },
  });
  espn.scoreboards['soccer/fra.1'].events.push(live);
  await tracker.refresh();

  const match = await get(TEAM_MATCH_WIDGET, { team: PSG_DEVICE });
  assert.deepEqual(validateWidgetContent(match), []);
  assert.equal(match.ttl_seconds, 30);
  assert.equal(match.components[0].text, 'PSG 2 – 1 STR');

  const list = await get(MY_TEAMS_WIDGET);
  assert.deepEqual(validateWidgetContent(list), []);
  const [first] = list.components[0].items;
  assert.equal(first.title, 'Paris Saint-Germain', 'the live match comes first');
  assert.deepEqual(first.badge.text, { en: 'LIVE', fr: 'DIRECT' });
});

test('the score tiles follow the device features once the device exists', async () => {
  const { gladys, get } = await setup();
  const before = await get(TEAM_MATCH_WIDGET, { team: NICE_DEVICE });
  assert.deepEqual(
    before.components.filter((c) => c.type === 'value').map((c) => c.value),
    [2, 1],
  );
  gladys.createAll();
  const after = await get(TEAM_MATCH_WIDGET, { team: NICE_DEVICE });
  const features = new Set(gladys.devices.flatMap((d) => d.features.map((f) => f.external_id)));
  const tiles = after.components.filter((c) => c.type === 'value');
  assert.equal(tiles.length, 2);
  for (const tile of tiles) {
    assert.ok(features.has(tile.device_feature), `unknown feature ${tile.device_feature}`);
  }
});

test('every button action is handled and answers a short toast', async () => {
  const { gladys, espn, config, widgets, get } = await setup();
  for (const key of WIDGET_KEYS) {
    const content = await get(key, { team: PSG_DEVICE });
    const buttons = content.components.filter((c) => c.type === 'button' && c.action);
    assert.ok(buttons.length > 0);
    for (const { action } of buttons) {
      const calls = espn.calls.length;
      const message = await widgets[key].action(gladys, {
        actionKey: action.key,
        params: action.params ?? {},
        settings: {},
        config,
      });
      assert.ok(message.en.length <= 200 && message.fr.length <= 200);
      assert.ok(espn.calls.length > calls, 'the button reads ESPN again');
    }
    await assert.rejects(
      widgets[key].action(gladys, { actionKey: 'nope', params: {}, settings: {}, config }),
    );
  }
});

test('team logos are served by image key, ESPN hosts only', async () => {
  const { tracker, espn, get } = await setup();
  const list = await get(MY_TEAMS_WIDGET);
  const keys = list.components[0].items.map((item) => item.image).filter(Boolean);
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.match(key, /^[a-z0-9][a-z0-9-]{0,63}$/);
    const base64 = await widgetImage(tracker, espn, key);
    assert.ok(Buffer.from(base64, 'base64').length > 0);
  }
  assert.equal(logoKey(tracker.list()[0]), 'logo-soccer-fra-1-160');
  await assert.rejects(widgetImage(tracker, espn, 'logo-unknown'));
});

test('refreshWidgets nudges every declared widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.widgetRefreshes, WIDGET_KEYS);
});
