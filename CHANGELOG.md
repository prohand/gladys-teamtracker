# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change in the Unreleased section below as you make it. The Release
workflow moves that section under the version it ships, and the section becomes the
notes of the version's GitHub Release.

## [Unreleased]

## [1.1.1] - 2026-10-23

- Maintenance release, no functional change.

## [1.1.0] - 2026-10-13

### Added

- German and Spanish translations (configuration screen, messages, widgets,
  documentation).

### Fixed

- The English documentation names the Gladys screens as the Gladys interface does.

## [1.0.2] - 2026-10-12

### Changed

- `@gladysassistant/integration-sdk` updated to 0.15.0.

## [1.0.1] - 2026-10-12

### Added

- Follow up to 20 sports teams, written `LEAGUE:TEAM` (`LIG1:PSG, TOP14:RAC, NFL:KC`):
  soccer (Ligue 1, Ligue 2, Coupe de France, Première Ligue, Premier League, LaLiga,
  Serie A, Bundesliga, Champions League, Europa League, Conference League, MLS, NWSL,
  World Cups), rugby (Top 14, Six Nations, Rugby World Cup), NFL, NCAA Football, NBA,
  WNBA, NCAA basketball, NHL and MLB, plus any other ESPN team league by its
  `sport/league` path. Scores come from the public ESPN API: no account, no key.
- One device per team: team score, opponent score and a "Match" status line (live
  clock, final result or next kickoff), in English or French, with kickoff times in
  the configured time zone.
- Scene triggers: match starting soon (reminder before kickoff), match started, my team
  scored, opponent scored, match ended (filter on win, loss or draw). Each one can be
  filtered on the team and on home or away matches.
- Scene action "Get the match of a team": state, scores, opponent, kickoff, result and
  summary for the following actions.
- Dashboard widgets: "Team match" (live score of one team) and "My teams" (every team,
  with its logo and a LIVE, result or NEXT badge).
- Configuration buttons: "Test the teams" says, team by team, what is followed and why
  an entry is not; "Find a team" lists the teams of a league with the line to paste.
- Reading pace driven by the matches: every 30 s while a match is live, every 15 min
  otherwise, waking up exactly for the kickoff reminder and the kickoff.
- Cloud transport badge on every team (unreachable while ESPN does not answer), and the
  last known scores are kept during an outage.
- The last reading of every team is kept in `/data`: a restart during a match neither
  replays nor misses a goal.
- `SECURITY.md`, `CLAUDE.md`, user documentation in English and French, CI (Prettier,
  ESLint, tests on Node 22 and 24, store checks and Docker build on pull requests) and
  UI-driven releases.

[Unreleased]: https://github.com/prohand/gladys-teamtracker/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/prohand/gladys-teamtracker/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/prohand/gladys-teamtracker/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/prohand/gladys-teamtracker/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-teamtracker/releases/tag/v1.0.1
