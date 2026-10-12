// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults,
// normalizes the received object (a form may send numbers as strings) and
// parses the list of followed teams.
// -----------------------------------------------------------------------------

import { parseLeague } from './leagues.js';

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  teams: '', // "LIG1:PSG, NFL:KC" — see parseTeams()
  language: 'en', // language of the status texts published on the devices
  timezone: 'Europe/Paris', // kickoff times are written in this time zone
  reminder_minutes: 30, // "match starting soon" trigger, 0 = never
  live_refresh: 30, // seconds between two reads while a match is live
  idle_refresh: 15, // minutes between two reads when nothing is live
};

// More teams would mean more ESPN requests than a hobby API deserves.
export const MAX_TEAMS = 20;

const LANGUAGES = ['en', 'fr'];

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function validTimezone(value) {
  const zone = String(value ?? '').trim();
  if (!zone) {
    return DEFAULT_CONFIG.timezone;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_CONFIG.timezone;
  }
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    teams: String(raw.teams ?? DEFAULT_CONFIG.teams),
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
    timezone: validTimezone(raw.timezone),
    reminder_minutes: clampNumber(raw.reminder_minutes, DEFAULT_CONFIG.reminder_minutes, 0, 1440),
    live_refresh: clampNumber(raw.live_refresh, DEFAULT_CONFIG.live_refresh, 15, 300),
    idle_refresh: clampNumber(raw.idle_refresh, DEFAULT_CONFIG.idle_refresh, 5, 120),
  };
}

/**
 * Parse the followed teams: entries separated by commas, semicolons or line
 * breaks, each written `LEAGUE:TEAM` — a league code (LIG1, NFL…) or an ESPN
 * `sport/league` path, then the team abbreviation (PSG) or its ESPN id (160).
 *
 * @param {string} text
 * @returns {{ teams: Array<{ entry: string, sport: string, league: string,
 *   leagueCode: string, leagueName: string, team: string }>,
 *   errors: Array<{ entry: string, reason: 'format' | 'league' | 'duplicate' | 'limit' }> }}
 */
export function parseTeams(text) {
  const teams = [];
  const errors = [];
  const seen = new Set();
  for (const raw of String(text ?? '').split(/[,;\n]/)) {
    const entry = raw.trim();
    if (!entry) {
      continue;
    }
    // Split on the LAST colon: a team never holds one, a league path never does either,
    // but users type "LIG1 : PSG" with spaces.
    const separator = entry.lastIndexOf(':');
    const leagueText = separator > 0 ? entry.slice(0, separator).trim() : '';
    const team = separator > 0 ? entry.slice(separator + 1).trim() : '';
    if (!leagueText || !team || !/^[A-Za-z0-9.&'-]{1,40}$/.test(team)) {
      errors.push({ entry, reason: 'format' });
      continue;
    }
    const league = parseLeague(leagueText);
    if (!league) {
      errors.push({ entry, reason: 'league' });
      continue;
    }
    const key = `${league.sport}/${league.league}:${team.toUpperCase()}`;
    if (seen.has(key)) {
      errors.push({ entry, reason: 'duplicate' });
      continue;
    }
    if (teams.length >= MAX_TEAMS) {
      errors.push({ entry, reason: 'limit' });
      continue;
    }
    seen.add(key);
    teams.push({
      entry,
      sport: league.sport,
      league: league.league,
      leagueCode: league.code,
      leagueName: league.name,
      team,
    });
  }
  return { teams, errors };
}
