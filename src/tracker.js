// -----------------------------------------------------------------------------
// The tracker: reads ESPN for every followed team, publishes the devices and
// their states, fires the scene events, and decides when to read again.
//
// One reading ("cycle") per league and per wake-up: the scoreboard serves
// every followed team of the league at once. A team absent from it (no match
// today) gets its next match from its own `teams/<id>` page, read again at
// most every few hours, or often when that match is about to start.
//
// The pace follows the matches, not a fixed poll: `live_refresh` seconds while
// a match is live (or its kickoff has passed), otherwise `idle_refresh`
// minutes — shortened to wake exactly at the kickoff reminder and at the
// kickoff. Gladys' own polling is not used: its frequencies are a fixed enum.
//
// Readings never overlap: a manual refresh (widget button, Test action)
// during a cycle joins it instead of starting another one.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { parseTeams } from './config.js';
import { findMatchInScoreboard, findTeam, parseTeamDetail, parseTeamsList } from './espn/parse.js';
import { detectEvents, eventData } from './events.js';
import { formatStatus } from './format.js';
import { leagueKey } from './leagues.js';
import { buildTeamDevice, teamExternalIds, teamStates } from './devices/team.js';

const logger = createLogger({ name: 'tracker' });

const HOUR = 60 * 60 * 1000;
// The teams of a league change once a season: one read a day is plenty.
const TEAMS_LIST_TTL = 24 * HOUR;
// A team's next match, when it is not on today's scoreboard.
const DETAIL_TTL = 6 * HOUR;
// Its page is read at every cycle from this long before the kickoff.
const DETAIL_CLOSE_TO_KICKOFF = HOUR;
// A match still `pre` this long after its kickoff is late or postponed, not
// worth live polling any more.
const LATE_KICKOFF = 6 * HOUR;
// Gladys marks a value older than 48 h as outdated: republish the unchanged
// ones well before.
const REPUBLISH_AFTER = 6 * HOUR;
const MIN_DELAY = 15_000;
const MAX_STATES_PER_REQUEST = 100;

function entryKey(spec) {
  return `${spec.sport}/${spec.league}:${spec.team.toUpperCase()}`;
}

export class Tracker {
  /**
   * @param {object} deps
   * @param {object} deps.gladys   the SDK instance (or a fake)
   * @param {object} deps.client   ESPN client (src/espn/client.js)
   * @param {object} [deps.store]  persistence (src/store.js)
   * @param {() => number} [deps.now]
   * @param {(fn: Function, ms: number) => unknown} [deps.setTimer]
   * @param {(handle: unknown) => void} [deps.clearTimer]
   * @param {() => void} [deps.onChange] something shown changed (widgets)
   */
  constructor({ gladys, client, store, now, setTimer, clearTimer, onChange }) {
    this.gladys = gladys;
    this.client = client;
    this.store = store;
    this.now = now ?? Date.now;
    this.setTimer = setTimer ?? setTimeout;
    this.clearTimer = clearTimer ?? clearTimeout;
    this.onChange = onChange ?? (() => {});

    this.config = null;
    this.parseErrors = [];
    /** @type {Map<string, object>} followed teams, keyed by entryKey() */
    this.tracked = new Map();
    /** @type {Map<string, { teams: object[], fetchedAt: number }>} */
    this.teamLists = new Map();
    /** @type {Map<string, string>} */
    this.transports = new Map();
    this.devicesSignature = null;
    this.saved = {};
    this.inflight = null;
    this.timer = null;
    this.running = false;
  }

  /** Read what the previous run remembered. Call once, at startup. */
  async load() {
    this.saved = (await this.store?.load()) ?? {};
    // Teams configured before the load: fill what they do not know yet.
    for (const tracked of this.tracked.values()) {
      const saved = this.saved[tracked.key];
      if (!saved) {
        continue;
      }
      tracked.info ??= saved.info ?? null;
      if (tracked.match === undefined && 'match' in saved) {
        tracked.match = saved.match;
      }
      tracked.remindedFor ??= saved.remindedFor ?? null;
    }
  }

  /** Apply a (new) configuration. The next refresh() reads with it. */
  configure(config) {
    this.config = config;
    const { teams, errors } = parseTeams(config.teams);
    this.parseErrors = errors;
    const next = new Map();
    for (const spec of teams) {
      const key = entryKey(spec);
      const kept = this.tracked.get(key);
      const saved = this.saved[key];
      next.set(
        key,
        kept
          ? { ...kept, spec }
          : {
              key,
              spec,
              info: saved?.info ?? null,
              // `undefined` = never read: the first reading is a baseline.
              match: saved && 'match' in saved ? saved.match : undefined,
              remindedFor: saved?.remindedFor ?? null,
              detail: null,
              resolveError: null,
              candidates: [],
              reachable: null,
            },
      );
    }
    this.tracked = next;
    for (const err of errors) {
      logger.warn(`Ignored team entry "${err.entry}": ${err.reason}`);
    }
  }

  /** Followed teams, in configuration order. */
  list() {
    return [...this.tracked.values()];
  }

  /** The followed team behind a device external id, or undefined. */
  findByDevice(externalId) {
    return this.list().find(
      (t) => t.info && teamExternalIds(this.gladys, t.spec, t.info.id).device === externalId,
    );
  }

  deviceId(tracked) {
    return teamExternalIds(this.gladys, tracked.spec, tracked.info.id).device;
  }

  /** Discovery payload: the resolved teams. */
  buildDevices() {
    return this.list()
      .filter((t) => t.info)
      .map((t) => buildTeamDevice(this.gladys, t, this.config));
  }

  start() {
    this.running = true;
    return this.refresh();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /**
   * Forget what was published: after a reconnection Gladys may have missed
   * states, and a device created meanwhile has none yet.
   */
  resetPublished() {
    this.gladys.forgetPublishedStates();
    this.transports.clear();
    this.devicesSignature = null;
  }

  /**
   * Read now, then plan the next one. A reading in progress is joined; with
   * `fresh`, another one follows it (the configuration or the created devices
   * changed while it ran, so its result is already stale).
   */
  refresh({ fresh = false } = {}) {
    if (this.inflight && fresh) {
      return this.inflight.then(() => this.refresh());
    }
    if (!this.inflight) {
      this.inflight = this.cycle()
        .catch((err) => logger.error('Reading failed', err))
        .finally(() => {
          this.inflight = null;
          this.schedule();
        });
    }
    return this.inflight;
  }

  schedule() {
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.running) {
      return;
    }
    const delay = this.nextDelay();
    logger.debug(`Next reading in ${Math.round(delay / 1000)} s`);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.refresh();
    }, delay);
  }

  /** Milliseconds until the next reading. */
  nextDelay() {
    const now = this.now();
    const {
      live_refresh: liveSeconds,
      idle_refresh: idleMinutes,
      reminder_minutes: reminder,
    } = this.config;
    const live = liveSeconds * 1000;
    let delay = idleMinutes * 60_000;
    for (const { match } of this.tracked.values()) {
      if (!match || match.state === 'post') {
        continue;
      }
      const untilKickoff = Date.parse(match.kickoff) - now;
      if (match.state === 'in' || (untilKickoff <= 0 && untilKickoff > -LATE_KICKOFF)) {
        return Math.max(MIN_DELAY, live);
      }
      if (untilKickoff > 0) {
        delay = Math.min(delay, untilKickoff);
        const untilReminder = untilKickoff - reminder * 60_000;
        if (reminder > 0 && untilReminder > 0) {
          delay = Math.min(delay, untilReminder);
        }
      }
    }
    return Math.max(MIN_DELAY, delay);
  }

  async cycle() {
    if (!this.config) {
      return;
    }
    const before = this.snapshot();
    const byLeague = new Map();
    for (const tracked of this.tracked.values()) {
      const key = leagueKey(tracked.spec);
      byLeague.set(key, [...(byLeague.get(key) ?? []), tracked]);
    }

    const events = [];
    for (const [key, group] of byLeague) {
      events.push(...(await this.readLeague(key, group)));
    }

    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.fireEvents(events);
    await this.reportStatus();

    const after = this.snapshot();
    if (after !== before) {
      await this.save();
      this.onChange();
    }
  }

  async readLeague(key, group) {
    const { sport, league } = group[0].spec;
    const now = this.now();

    // 1) Turn what the user typed into ESPN team ids.
    if (group.some((t) => !t.info)) {
      const list = await this.teamsList(key, sport, league, now);
      for (const tracked of group.filter((t) => !t.info)) {
        if (!list) {
          tracked.resolveError = 'unreachable';
          continue;
        }
        const found = findTeam(list, tracked.spec.team);
        const before = tracked.resolveError;
        tracked.resolveError = found.error ?? null;
        tracked.candidates = found.candidates ?? [];
        if (found.team) {
          tracked.info = found.team;
          logger.info(`${tracked.spec.entry} is ${found.team.name} (ESPN id ${found.team.id})`);
        } else if (found.error !== before) {
          // Once per problem, not at every reading.
          logger.warn(`${tracked.spec.entry}: team ${found.error} in ${tracked.spec.leagueName}`);
        }
      }
    }

    const resolved = group.filter((t) => t.info);
    if (resolved.length === 0) {
      return [];
    }

    // 2) Today's matches of the league.
    let scoreboard = null;
    try {
      scoreboard = await this.client.scoreboard(sport, league);
    } catch (err) {
      logger.warn(`${group[0].spec.leagueName}: scoreboard unavailable (${err.message})`);
    }

    const events = [];
    for (const tracked of resolved) {
      if (!scoreboard) {
        // Keep the last known match: an outage must not read as "no match".
        tracked.reachable = false;
        continue;
      }
      let match = findMatchInScoreboard(scoreboard, tracked.info.id, now);
      tracked.reachable = true;
      if (!match) {
        // 3) Not playing today: its next match, from its own page.
        const detail = await this.teamDetail(tracked, now);
        if (detail === undefined) {
          tracked.reachable = false;
          continue;
        }
        match = detail;
      }
      events.push(...this.apply(tracked, match, now));
    }
    return events;
  }

  async teamsList(key, sport, league, now) {
    const cached = this.teamLists.get(key);
    if (cached && now - cached.fetchedAt < TEAMS_LIST_TTL) {
      return cached.teams;
    }
    try {
      const teams = parseTeamsList(await this.client.teams(sport, league));
      this.teamLists.set(key, { teams, fetchedAt: now });
      return teams;
    } catch (err) {
      logger.warn(`${key}: team list unavailable (${err.message})`);
      return cached?.teams ?? null;
    }
  }

  /** The team's next match (null: none known), or undefined when unreadable. */
  async teamDetail(tracked, now) {
    const { detail } = tracked;
    const closeToKickoff =
      detail?.match && Date.parse(detail.match.kickoff) - now < DETAIL_CLOSE_TO_KICKOFF;
    if (detail && now - detail.fetchedAt < DETAIL_TTL && !closeToKickoff) {
      return detail.match;
    }
    try {
      const json = await this.client.team(tracked.spec.sport, tracked.spec.league, tracked.info.id);
      const parsed = parseTeamDetail(json);
      if (parsed.team?.id === tracked.info.id) {
        tracked.info = { ...tracked.info, ...parsed.team };
      }
      tracked.detail = { match: parsed.match, fetchedAt: now };
      return parsed.match;
    } catch (err) {
      logger.warn(`${tracked.spec.entry}: team page unavailable (${err.message})`);
      return detail ? detail.match : undefined;
    }
  }

  apply(tracked, match, now) {
    const { events, remindedFor } = detectEvents({
      previous: tracked.match,
      current: match,
      remindedFor: tracked.remindedFor,
      now,
      reminderMinutes: this.config.reminder_minutes,
    });
    tracked.match = match;
    tracked.remindedFor = remindedFor;
    return events.map((event) => ({ event, tracked }));
  }

  async publishDevices() {
    const devices = this.buildDevices();
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    await this.gladys.publishDiscoveredDevices(devices);
    this.devicesSignature = signature;
  }

  async publishAllStates() {
    // States of a device the user has not created yet are refused: only send
    // those of created devices (the list the SDK keeps up to date).
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    const states = this.list()
      .filter((t) => t.info && t.match !== undefined && created.has(this.deviceId(t)))
      .flatMap((t) => teamStates(this.gladys, t, this.config));
    // The SDK only sends what changed (plus the heartbeat) and splits the
    // batch by 100.
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: REPUBLISH_AFTER });
    } catch (err) {
      logger.error('Gladys refused the states', err);
    }
  }

  async publishTransports() {
    const entries = this.list()
      .filter((t) => t.info && t.reachable !== null)
      .map((t) => ({
        external_id: this.deviceId(t),
        transport: t.reachable ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
      }))
      .filter((entry) => this.transports.get(entry.external_id) !== entry.transport);
    if (entries.length === 0) {
      return;
    }
    try {
      for (let i = 0; i < entries.length; i += MAX_STATES_PER_REQUEST) {
        await this.gladys.publishTransports(entries.slice(i, i + MAX_STATES_PER_REQUEST));
      }
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.warn(`Gladys refused the transport badges: ${err.message}`);
    }
  }

  async fireEvents(events) {
    for (const { event, tracked } of events) {
      const data = eventData(
        event,
        this.deviceId(tracked),
        tracked.spec.leagueName,
        formatStatus(event.match, this.config),
      );
      logger.info(`Scene event ${event.key} <- ${tracked.spec.entry}: ${data.summary}`);
      try {
        await this.gladys.publishSceneEvent(event.key, data);
      } catch (err) {
        logger.warn(`Scene event ${event.key} refused: ${err.message}`);
      }
    }
  }

  /** The connection status of the Configuration screen. */
  async reportStatus() {
    const teams = this.list();
    const working = teams.filter((t) => t.info && t.reachable !== false);
    const problems = [
      ...this.parseErrors.map((err) => err.entry),
      ...teams.filter((t) => !t.info || t.reachable === false).map((t) => t.spec.entry),
    ];
    let message;
    if (teams.length === 0 && problems.length === 0) {
      message = {
        en: 'Add at least one team in the configuration, e.g. LIG1:PSG.',
        fr: 'Ajoutez au moins une équipe dans la configuration, par ex. LIG1:PSG.',
      };
    } else if (problems.length > 0) {
      const list = problems.join(', ');
      message = {
        en: `Not followed: ${list}. Use "Test the teams" to see why.`,
        fr: `Non suivies : ${list}. Utilisez « Tester les équipes » pour savoir pourquoi.`,
      };
    }
    try {
      await this.gladys.setConnectionStatus(working.length > 0, message);
    } catch (err) {
      logger.warn(`Cannot report the connection status: ${err.message}`);
    }
  }

  snapshot() {
    return JSON.stringify(
      this.list().map((t) => [t.key, t.info, t.match, t.remindedFor, t.reachable, t.resolveError]),
    );
  }

  async save() {
    if (!this.store) {
      return;
    }
    const teams = { ...this.saved };
    for (const t of this.tracked.values()) {
      teams[t.key] = {
        info: t.info,
        ...(t.match !== undefined && { match: t.match }),
        remindedFor: t.remindedFor,
      };
    }
    // Teams no longer followed are forgotten.
    for (const key of Object.keys(teams)) {
      if (!this.tracked.has(key)) {
        delete teams[key];
      }
    }
    this.saved = teams;
    await this.store.save(teams);
  }
}
