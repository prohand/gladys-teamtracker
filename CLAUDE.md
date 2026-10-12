# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors
working on this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that follows sports teams through the
public ESPN API — the Gladys counterpart of the Home Assistant "Team Tracker"
integration (no code taken from it: it is GPL-3.0, this repository is Apache-2.0). It
started from the official JavaScript template
([GladysAssistant/integration-template-js](https://github.com/GladysAssistant/integration-template-js))
and uses the same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

The user writes `LEAGUE:TEAM` entries (`LIG1:PSG, NFL:KC`). Each team becomes a device
(team score, opponent score, a "Match" status text). Gladys 5.1+ adds five scene
triggers (match soon, started, team scored, opponent scored, ended), one scene action
(`get_match`) and two widgets (`team_match`, `my_teams`). Manifest `transports:
["cloud"]`: ESPN is an internet API, nothing runs on the LAN.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/tracker.test.js            # one file
node --test --test-name-pattern "restart"   # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22 and 24;
on pull requests it also runs the store checks and builds the Docker image. Run the three
commands before pushing. The store check fails until the first release has pushed the
image named in the manifest `docker_image`.

Releases: **Actions → Release** only (bumps `package.json`, manifest `version` +
`docker_image`, rolls `CHANGELOG.md`, re-runs Prettier, tags, builds the multi-arch image,
publishes the GitHub Release).

## Architecture

```
index.js                SDK wiring only: handlers registered before connect(), tracker start/stop
src/config.js           DEFAULT_CONFIG (mirrors the manifest defaults), normalization, parseTeams()
src/leagues.js          league codes -> ESPN sport/league paths (codes are stored by users)
src/espn/client.js      the three ESPN endpoints + team logos (fetch injected, timeouts)
src/espn/parse.js       ESPN JSON -> Match (the team's side: scores, state, result)
src/events.js           two readings -> the scene events between them (pure)
src/format.js           status lines and dates, English and French
src/tracker.js          the loop: read ESPN, publish devices/states/badges, fire events, pace
src/store.js            last reading per team, in /data (restart-safe events)
src/devices/team.js     the device of a followed team (external ids, features, states)
src/actions.js          Configuration buttons: test_teams, find_team
src/scenes.js           scene action get_match (reads the cache, never ESPN)
src/widgets.js          widgets team_match and my_teams, logo images
test/fixtures/          real ESPN answers, trimmed — tests never touch the network
```

### Invariants worth knowing

- **External ids are forever.** A device is `team:<sport>.<league>.<ESPN team id>`, never
  what the user typed: `LIG1:PSG` and `LIG1:160` are the same device. Trigger, action,
  widget, feature, config and league keys are stored by users: never rename them.
- **Three ESPN shapes.** The scoreboard gives scores as strings, a team page's
  `nextEvent` as objects; the status sits on the competition or the event. `parse.js`
  reads them all and never throws on a missing field.
- **One request per league per reading**, plus the team's own page only when it is not
  on today's scoreboard (cached 6 h, read every cycle in the hour before kickoff), plus
  the league's team list once a day. Keep it that way: the API is free and undocumented.
- **The pace follows the matches**: `live_refresh` seconds while a match is live or its
  kickoff has passed (for 6 h), else `idle_refresh` minutes, shortened to wake at the
  reminder and at the kickoff. Gladys' own polling (`poll_frequency`, a fixed enum) is not
  used.
- **One event per transition, the first reading is a baseline.** `events.js` compares
  the previous reading of the same match; `store.js` keeps it across restarts, so an
  update during a match neither replays nor misses a goal. A lowered score (goal
  disallowed) fires nothing.
- **No event as a consequence of a scene action**: `get_match` reads the tracker's cache
  and never calls ESPN (a reading could fire a goal, a scene on it could loop).
- **An outage is not "no match"**: when ESPN fails, the last match is kept, the badge
  turns `unreachable` and the connection status says which teams are not followed.
- **States only for created devices** (`gladys.devices`), deduplicated, republished
  every 6 h (Gladys flags values older than 48 h), and all again after a reconnection or
  a device creation (`resetPublished()`).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features included.
- **The rootfs is read-only**: write only under `/data` (`DATA_DIR` overrides it in
  development).

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or
  the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they
  agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`, never a
  plain string. The catalog `description` holds 10 to 100 characters per language.
  Scene and widget fields require `gladys_version` `>=5.1.0`. `test/manifest.test.js`
  ties the manifest to the code (defaults, actions, triggers, scene action outputs,
  widgets, league list): change both sides together. A new league goes in
  `src/leagues.js` AND in the `find_team` league options.
- **User-facing text** is bilingual: action messages, widget texts, manifest texts and
  `docs/en.md` / `docs/fr.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
  Tests never touch the network: add a trimmed real ESPN answer to `test/fixtures/`.
