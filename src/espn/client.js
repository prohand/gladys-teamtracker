// -----------------------------------------------------------------------------
// ESPN public API client (no account, no key).
//
// Three read-only endpoints per league, under
// https://site.api.espn.com/apis/site/v2/sports/<sport>/<league>/ :
//   - scoreboard     the matches of the current day (or week, NFL): live scores;
//   - teams          every team of the league: id, abbreviation, name;
//   - teams/<id>     one team, with `nextEvent` (its next or current match).
//
// The API is undocumented: it can change or throttle without notice. Every
// call has a timeout, and the caller keeps the last known data when one fails.
// `fetch` is injected so the tests never touch the network.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const TIMEOUT_MS = 10_000;

export class EspnError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = 'EspnError';
    this.status = status;
    this.url = url;
  }
}

function leagueUrl(sport, league, path) {
  return `${BASE_URL}/${encodeURIComponent(sport)}/${encodeURIComponent(league)}/${path}`;
}

/**
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createEspnClient({ fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  async function getJson(url) {
    let response;
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new EspnError(`ESPN unreachable: ${err.message}`, { url });
    }
    if (!response.ok) {
      throw new EspnError(`ESPN HTTP ${response.status}`, { status: response.status, url });
    }
    try {
      return await response.json();
    } catch {
      throw new EspnError('ESPN answered something that is not JSON', { url });
    }
  }

  return {
    scoreboard(sport, league) {
      return getJson(`${leagueUrl(sport, league, 'scoreboard')}?limit=200`);
    },
    teams(sport, league) {
      return getJson(`${leagueUrl(sport, league, 'teams')}?limit=1000`);
    },
    team(sport, league, teamId) {
      return getJson(leagueUrl(sport, league, `teams/${encodeURIComponent(teamId)}`));
    },
    /**
     * A team logo, resized by ESPN's image service, as a Buffer. Only ESPN's
     * own image hosts are fetched: the URL comes from an ESPN answer, and
     * the integration must not be turned into a fetcher of arbitrary URLs.
     */
    async logo(url, size = 128) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !/(^|\.)espncdn\.com$/.test(parsed.hostname)) {
        throw new EspnError(`Not an ESPN image: ${parsed.hostname}`, { url });
      }
      const resized =
        `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(parsed.pathname)}` +
        `&w=${size}&h=${size}`;
      let response;
      try {
        response = await fetch(resized, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        throw new EspnError(`ESPN unreachable: ${err.message}`, { url: resized });
      }
      if (!response.ok) {
        throw new EspnError(`ESPN HTTP ${response.status}`, {
          status: response.status,
          url: resized,
        });
      }
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
