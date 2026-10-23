// Citing LandSandBoat lines without copying them. A citation gives the file, the line number and a
// fingerprint of the line: the first 12 hex digits of the SHA-256 of the line with its leading and
// trailing spaces trimmed. A checkout can be checked against the fingerprint, and the line itself is
// never stored here.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fingerprint = (line) => createHash('sha256').update(line.trim()).digest('hex').slice(0, 12);

// The commit a checkout is at, or null when git can't tell. A copy of its files, such as
// third_party/landsandboat/, names its commit in a COMMIT file, which comes first: inside this repo, git
// would answer with this repo's own commit.
export function checkoutCommit(root) {
  if (existsSync(join(root, 'COMMIT'))) return (/^([0-9a-f]{40})\s*$/.exec(readFileSync(join(root, 'COMMIT'), 'utf8')) || [])[1] || null;
  try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return null; }
}

// The commit a data file's citations were made at, from its "// LandSandBoat commit: <hash>" line.
export const citedCommit = (text) => (/^\/\/ LandSandBoat commit: ([0-9a-f]{40})$/m.exec(text) || [])[1] || null;
