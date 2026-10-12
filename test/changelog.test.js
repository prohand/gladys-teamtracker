// -----------------------------------------------------------------------------
// The changelog roll of the Release workflow (.github/scripts/changelog-release.mjs):
// the release commit goes straight to main, so it must stay Prettier-clean.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const changelogPath = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));

test('the real changelog rolls under the new version and stays Prettier-clean', async () => {
  const text = await readFile(changelogPath, 'utf8');
  const rolled = rollChangelog(text, '9.8.7', '2026-01-02');
  assert.notEqual(rolled, text, 'CHANGELOG.md needs a "## [Unreleased]" section');
  assert.match(rolled, /^## \[Unreleased\]\n\n## \[9\.8\.7\] - 2026-01-02\n/m);
  assert.match(rolled, /^\[9\.8\.7\]: https:\/\/github\.com\/prohand\/gladys-teamtracker\//m);
  const options = { ...(await prettier.resolveConfig(changelogPath)), filepath: changelogPath };
  assert.equal(await prettier.format(rolled, options), rolled);
});

test('an empty Unreleased section still names the release', () => {
  const text = `# Changelog

## [Unreleased]

[Unreleased]: https://github.com/prohand/gladys-teamtracker/commits/main
`;
  assert.equal(
    rollChangelog(text, '1.0.1', '2026-01-02'),
    `# Changelog

## [Unreleased]

## [1.0.1] - 2026-01-02

- Maintenance release, no functional change.

[Unreleased]: https://github.com/prohand/gladys-teamtracker/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-teamtracker/releases/tag/v1.0.1
`,
  );
});
