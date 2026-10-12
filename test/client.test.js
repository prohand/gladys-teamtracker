import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEspnClient, EspnError } from '../src/espn/client.js';
import { createStore } from '../src/store.js';

function fakeFetch(answer) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    return answer(url);
  };
  return { fetch, urls };
}

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
});

test('the ESPN URLs, one per endpoint', async () => {
  const { fetch, urls } = fakeFetch(() => json({ events: [] }));
  const client = createEspnClient({ fetch });
  await client.scoreboard('soccer', 'fra.1');
  await client.teams('rugby', '270559');
  await client.team('football', 'nfl', '12');
  assert.deepEqual(urls, [
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?limit=200',
    'https://site.api.espn.com/apis/site/v2/sports/rugby/270559/teams?limit=1000',
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12',
  ]);
});

test('HTTP errors, network errors and non-JSON answers become EspnError', async () => {
  const http = createEspnClient({ fetch: async () => json({}, 503) });
  await assert.rejects(http.scoreboard('soccer', 'fra.1'), (err) => {
    assert.ok(err instanceof EspnError);
    assert.equal(err.status, 503);
    return true;
  });
  const down = createEspnClient({
    fetch: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await assert.rejects(down.teams('soccer', 'fra.1'), /ESPN unreachable: ECONNREFUSED/);
  const html = createEspnClient({
    fetch: async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }),
  });
  await assert.rejects(html.team('soccer', 'fra.1', '160'), /not JSON/);
});

test('logos come from ESPN image hosts only, resized', async () => {
  const { fetch, urls } = fakeFetch(() => json({}));
  const client = createEspnClient({ fetch });
  const png = await client.logo('https://a.espncdn.com/i/teamlogos/soccer/500/160.png');
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual(urls, [
    'https://a.espncdn.com/combiner/i?img=%2Fi%2Fteamlogos%2Fsoccer%2F500%2F160.png&w=128&h=128',
  ]);
  await assert.rejects(client.logo('https://evil.example/logo.png'), /Not an ESPN image/);
  await assert.rejects(client.logo('http://a.espncdn.com/logo.png'), /Not an ESPN image/);
  await assert.rejects(client.logo('https://espncdn.com.evil.example/x.png'), /Not an ESPN image/);
});

test('the store survives a missing or broken file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'teamtracker-'));
  try {
    const path = join(dir, 'sub', 'state.json');
    const store = createStore(path);
    assert.deepEqual(await store.load(), {});
    await store.save({ a: { info: null, remindedFor: null } });
    assert.deepEqual(await store.load(), { a: { info: null, remindedFor: null } });
    await writeFile(path, '{ not json');
    assert.deepEqual(await store.load(), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
