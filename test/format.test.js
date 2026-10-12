import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFromEvent } from '../src/espn/parse.js';
import { formatKickoff, formatStatus } from '../src/format.js';
import { fixture, withState } from './helpers/fakeEspn.js';

const base = fixture('lig1-scoreboard').events[0]; // NICE (2502) – STR (180)
const en = { language: 'en', timezone: 'Europe/Paris' };
const fr = { language: 'fr', timezone: 'Europe/Paris' };

function match(change) {
  return matchFromEvent(withState(base, { date: '2026-10-18T13:00:00Z', ...change }), '2502');
}

test('the status line of every phase, in English and French', () => {
  const live = match({ state: 'in', scores: { 2502: 1 } });
  assert.equal(formatStatus(live, en), "Live · 63' · NICE 1 – 0 STR");
  assert.equal(formatStatus(live, fr), "En direct · 63' · NICE 1 – 0 STR");

  const halftime = match({ state: 'in', detail: 'HT', name: 'STATUS_HALFTIME' });
  assert.equal(formatStatus(halftime, fr), 'En direct · Mi-temps · NICE 0 – 0 STR');

  const final = match({ state: 'post', scores: { 180: 2 } });
  assert.equal(formatStatus(final, en), 'Final · NICE 0 – 2 STR · Loss');
  assert.equal(formatStatus(final, fr), 'Terminé · NICE 0 – 2 STR · Défaite');

  const postponed = match({ state: 'post', completed: false, name: 'STATUS_POSTPONED' });
  assert.equal(formatStatus(postponed, en), 'Postponed · NICE vs STR');

  const canceled = match({ state: 'post', completed: false, name: 'STATUS_CANCELED' });
  assert.equal(formatStatus(canceled, fr), 'Annulé · NICE contre STR');

  assert.equal(formatStatus(null, fr), 'Aucun match prévu');
});

test('the next match, in the configured time zone', () => {
  const next = match({ state: 'pre' });
  assert.match(formatStatus(next, en), /^Next · Sun, Oct 18, 03:00 PM · vs STR$/);
  assert.match(
    formatStatus(next, { language: 'en', timezone: 'America/New_York' }),
    /^Next · Sun, Oct 18, 09:00 AM · vs STR$/,
  );
  assert.match(formatStatus(next, fr), /^Prochain match · dim\. 18 oct\.?,? 15:00 · contre STR$/);
  assert.equal(formatKickoff('not a date', 'en', 'UTC'), '');
});
