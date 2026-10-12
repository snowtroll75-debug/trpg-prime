/**
 * Every declared skill-action key, parsed from the data file.
 *
 * NEW at 3.504.0, for `verify-pp2-bonuses`.
 *
 * PARSED RATHER THAN LISTED. A second hand-maintained copy of 97 keys is
 * the shape `MECHANICAL_KINDS` had when it was wrong by forty-one — so
 * this reads `module/data/skill-actions.mjs` and lets the file be the
 * authority. The check that uses it asserts a floor on the count, because
 * a regex that quietly stops matching reports an empty list and every
 * scoped action then passes for the wrong reason.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./sources.mjs";

const SOURCE = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs"), "utf8");

export const SKILL_ACTION_KEYS = Object.freeze(
  [...new Set([...SOURCE.matchAll(/key:\s*"([A-Za-z0-9]+)"/g)].map((m) => m[1]))].sort());
