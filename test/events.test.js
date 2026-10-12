import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFromEvent } from '../src/espn/parse.js';
import { detectEvents, TRIGGERS } from '../src/events.js';
import { fixture, withState } from './helpers/fakeEspn.js';

const base = fixture('lig1-scoreboard').events[0]; // NICE (2502) – STR (180)
const KICKOFF = '2026-10-18T13:00:00Z';
const at = (iso) => Date.parse(iso);

function reading(state, nice = 0, str = 0, extra = {}) {
  return matchFromEvent(
    withState(base, { state, scores: { 2502: nice, 180: str }, date: KICKOFF, ...extra }),
    '2502',
  );
}

function keys(previous, current, options = {}) {
  return detectEvents({
    previous,
    current,
    now: at('2026-10-18T14:00Z'),
    reminderMinutes: 30,
    ...options,
  }).events.map((e) => e.key);
}

test('the first reading is a baseline: nothing fires', () => {
  assert.deepEqual(keys(undefined, reading('in', 1, 0)), []);
  assert.deepEqual(keys(undefined, reading('post', 2, 1)), []);
});

test('a whole match, reading after reading', () => {
  assert.deepEqual(keys(reading('pre'), reading('in')), [TRIGGERS.MATCH_STARTED]);
  assert.deepEqual(keys(reading('in'), reading('in')), []);
  assert.deepEqual(keys(reading('in'), reading('in', 1, 0)), [TRIGGERS.TEAM_SCORED]);
  assert.deepEqual(keys(reading('in', 1, 0), reading('in', 1, 1)), [TRIGGERS.OPPONENT_SCORED]);
  assert.deepEqual(keys(reading('in', 1, 1), reading('post', 2, 1)), [
    TRIGGERS.TEAM_SCORED,
    TRIGGERS.MATCH_ENDED,
  ]);
  assert.deepEqual(keys(reading('post', 2, 1), reading('post', 2, 1)), []);
});

test('two goals between two readings are one event worth two points', () => {
  const { events } = detectEvents({
    previous: reading('in'),
    current: reading('in', 2, 0),
    now: 0,
    reminderMinutes: 0,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].points, 2);
});

test('a goal disallowed after review fires nothing', () => {
  assert.deepEqual(keys(reading('in', 1, 0), reading('in', 0, 0)), []);
});

test('a postponed match does not end', () => {
  const postponed = reading('post', 0, 0, { completed: false, name: 'STATUS_POSTPONED' });
  assert.deepEqual(keys(reading('pre'), postponed), []);
});

test('a new match seen already live starts; seen already over, it is not news', () => {
  const other = { ...reading('post', 2, 1), id: 'previous' };
  assert.deepEqual(keys(other, reading('in', 1, 0)), [TRIGGERS.MATCH_STARTED]);
  assert.deepEqual(keys(other, reading('post', 3, 0)), []);
  assert.deepEqual(keys(null, reading('in')), [TRIGGERS.MATCH_STARTED]);
});

test('the kickoff reminder fires once, inside its window only', () => {
  const pre = reading('pre');
  const soon = (iso, remindedFor = null, reminderMinutes = 30) =>
    detectEvents({ previous: pre, current: pre, remindedFor, now: at(iso), reminderMinutes });

  assert.deepEqual(soon('2026-10-18T12:00Z').events, [], 'one hour before: too early');
  const due = soon('2026-10-18T12:40Z');
  assert.deepEqual(
    due.events.map((e) => [e.key, e.minutes]),
    [[TRIGGERS.MATCH_SOON, 20]],
  );
  assert.equal(due.remindedFor, pre.id);
  assert.deepEqual(soon('2026-10-18T12:45Z', pre.id).events, [], 'already sent');
  assert.deepEqual(soon('2026-10-18T13:20Z').events, [], 'kickoff long gone');
  assert.deepEqual(soon('2026-10-18T12:40Z', null, 0).events, [], 'reminder turned off');
  // Even on the very first reading: a reminder is about the future.
  assert.equal(
    detectEvents({
      previous: undefined,
      current: pre,
      now: at('2026-10-18T12:40Z'),
      reminderMinutes: 30,
    }).events.length,
    1,
  );
});
