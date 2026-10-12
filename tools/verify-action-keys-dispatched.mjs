#!/usr/bin/env node
/**
 * verify-action-keys-dispatched — an action that promises mechanics must
 * have something that performs them.
 *
 * NEW at 3.434.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SHAPE THIS EXISTS TO CATCH, FOUND THREE TIMES BEFORE IT WAS
 * WRITTEN.
 *
 * An action with `checkType: "none"` has no roll, so `resolveAction`
 * does the only generic thing it can: check the cost, spend it, post the
 * printed description, and stop. That is correct for an action whose
 * text is genuinely advice. It is a silent, complete failure for one
 * whose text promises an effect — the button is real, the cost is real,
 * and nothing happens.
 *
 *   - SUSTAIN A SPELL (3.424.0). Graham: "deducts an AP, creates an
 *     entry on the chat card but does nothing else." The key appeared
 *     exactly once in the system: in its own data entry.
 *   - ATTACK OF OPPORTUNITY (3.430.3). Graham: "spending a reaction but
 *     not prompting an attack." The key appeared twice — its data entry,
 *     and one NEGATIVE guard excluding it from provoking itself.
 *   - DISMISS (3.434.0). Found by the sweep this check is made of,
 *     before anybody reported it. The Magic tab ended the spell for
 *     free; the Actions tab charged an AP and ended nothing.
 *
 * Three of one shape is a pattern, and a pattern deserves a ratchet
 * rather than a fourth report.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A DECLARED LIST RATHER THAN A CLEVER PREDICATE.
 *
 * "Does this action's description promise mechanics?" is a question about
 * English, and this project has met enough rules inferred from wording.
 * So every `checkType: "none"` key is required to be EITHER dispatched
 * somewhere outside its own data file, or named here with a reason it
 * needs no code. Adding a key to that list is a deliberate act with an
 * author; forgetting to wire one is not.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const DATA_FILES = [
  "module/data/basic-actions.mjs",
  "module/data/special-actions.mjs",
  "module/data/skill-actions.mjs"
];

/**
 * The `checkType: "none"` actions that legitimately need no handler,
 * each with the reason. None of these is a shrug.
 */
const NO_HANDLER_NEEDED = {
  // AVERT GAZE LEFT THIS LIST AT 3.556.0, and its exemption is worth
  // quoting because B5 is what noticed it had gone stale: "The scope is
  // 'abilities that require looking at a creature', which no data in this
  // system marks, so an automatic version would either fire against
  // everything or against nothing."
  //
  // `visual` IS marked — it is one of the appendix's traits and 32 pack
  // entries carry it (pages 61-70 audit). And the answer was neither of
  // the two the exemption feared: Graham's ruling of 16 September 2026
  // made it OFFERED rather than automatic, so it fires against exactly
  // what the player says it fires against. It is dispatched now, through
  // BASIC_ACTION_STANCE_EFFECTS.
  // MOUNT/DISMOUNT LEFT THIS LIST AT 3.506.0. It was exempt because it
  // was `checkType: "none"` — Graham's ruling of 6 Sep 2026 makes it a
  // DC 20 Handle Animal check while an encounter is running, so it is a
  // check like any other and needs no exemption. B4 is what noticed:
  // an exemption naming an action that is no longer a non-check action
  // is a stale excuse, and a stale excuse is how a real gap hides.
  // INTERACT LEFT THIS LIST AT 3.621.0. It was exempt as "the generic
  // Interact … there is nothing specific to perform"; Appendix 2 gives it
  // one — "someone shaking you awake with an Interact action" — and an
  // Interact aimed at a sleeper now wakes it (block 39's R7). B5 noticed.
};

const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ------------------------------------------------------------------ */
/* Collect every action key with its checkType.                       */
/* ------------------------------------------------------------------ */

const actions = [];
for (const rel of DATA_FILES) {
  const full = path.join(SYSTEM_ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, "utf8");
  const re = /key:\s*"([A-Za-z0-9_]+)"([\s\S]{0,800}?)(?=\n {2}\{|\n\];|$)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, key, block] = m;
    actions.push({
      key,
      name: (block.match(/name:\s*"([^"]+)"/) ?? [])[1] ?? "",
      checkType: (block.match(/checkType:\s*"([^"]+)"/) ?? [])[1] ?? "",
      file: rel
    });
  }
}

ok("A1 the action tables were readable", actions.length > 20, `${actions.length} keys found`);
ok("A2 keys are unique across the tables",
  new Set(actions.map((a) => a.key)).size === actions.length);

/* ------------------------------------------------------------------ */
/* Which keys are read anywhere outside their own data file.          */
/* ------------------------------------------------------------------ */

const sources = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".mjs")) sources.push(full);
  }
})(path.join(SYSTEM_ROOT, "module"));
sources.push(path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"));

// COMMENTS ARE STRIPPED FIRST. Every one of the three defects above is
// discussed at length in comments that name the key, so an unstripped
// scan would find every orphan "referenced" by the paragraph explaining
// that it is not.
const haystack = sources
  .filter((f) => !DATA_FILES.some((d) => f.endsWith(d.replace(/^module\//, "").replace(/^/, "module/"))))
  .filter((f) => !/[/\\]data[/\\](basic|special|skill)-actions\.mjs$/.test(f))
  .map((f) => strip(fs.readFileSync(f, "utf8")))
  .join("\n");

/**
 * Whether anything outside the data tables reads this key.
 *
 * TWO SHAPES COUNT, and the first version of this check only knew one.
 *
 *   - A QUOTED LITERAL — `if (action.key === "dismiss")`. This is how
 *     Sustain, Attack of Opportunity and Dismiss are routed.
 *   - A PROPERTY KEY IN A DISPATCH TABLE — `fullDefence: { ... }`, read
 *     back as `BASIC_ACTION_STANCE_EFFECTS[actionKey]`. That is a
 *     perfectly good way to dispatch and arguably better than a chain of
 *     comparisons, and the first version of this check called Full
 *     Defence unwired because of it. A check that cries wolf about a
 *     working action is how a ratchet gets switched off.
 *
 * Deliberately a shade permissive: the failure this exists to catch is an
 * action nothing reads AT ALL, and all three real ones had their key
 * appearing essentially nowhere.
 */
const dispatched = (key) => {
  // A NEGATIVE GUARD IS NOT A HANDLER, and this is the whole reason the
  // rule is written out rather than being one regex.
  //
  // `attackOfOpportunity` appeared in exactly two places when it was
  // broken: its data entry, and `action.key !== "attackOfOpportunity"` —
  // a line whose entire purpose is to EXCLUDE it. The first version of
  // this check counted that as dispatch, so it would not have caught one
  // of the three defects it was built from. Its own mutation file said
  // so on the first run.
  const withoutNegatives = haystack.replace(
    new RegExp(`[!=]==?\\s*["'\`]${key}["'\`]|["'\`]${key}["'\`]\\s*[!=]==?`, "g"),
    (match) => (match.startsWith("!") || match.includes("!==") ? " " : match)
  );
  return new RegExp(`["'\`]${key}["'\`]`).test(withoutNegatives)
    || new RegExp(`\\b${key}\\s*:`).test(withoutNegatives);
};

/* ------------------------------------------------------------------ */
/* The ratchet.                                                        */
/* ------------------------------------------------------------------ */

const noneType = actions.filter((a) => a.checkType === "none");
ok("B1 there are checkType:none actions to police", noneType.length > 5, `${noneType.length}`);

const unwired = noneType.filter((a) => !dispatched(a.key) && !NO_HANDLER_NEEDED[a.key]);
ok("B2 every checkType:none action is dispatched or declared handler-free",
  unwired.length === 0,
  unwired.map((a) => `${a.key} (${a.name})`).join(", ")
    + " — spends its cost, posts its description, and does nothing");

// THE THREE THAT TAUGHT THIS. Each must stay wired; a regression that
// unwires one should fail here rather than wait for a fourth report.
for (const [key, where] of [
  ["sustainASpell", "magic/sustain-workflow.mjs"],
  ["attackOfOpportunity", "combat/opportunity.mjs"],
  ["dismiss", "magic/dismiss-workflow.mjs"]
]) {
  ok(`B3 ${key} is still dispatched`, dispatched(key), `should reach ${where}`);
}

// AND THE DECLARED EXEMPTIONS MUST STILL BE REAL. An entry for a key
// that no longer exists, or that has since been wired, is a comment
// pretending to be a decision.
const stale = Object.keys(NO_HANDLER_NEEDED).filter(
  (key) => !actions.some((a) => a.key === key));
ok("B4 no exemption names an action that no longer exists", stale.length === 0, stale.join(", "));
const nowWired = Object.keys(NO_HANDLER_NEEDED).filter(
  (key) => actions.some((a) => a.key === key && a.checkType === "none") && dispatched(key));
ok("B5 no exemption covers an action that is now dispatched", nowWired.length === 0,
  `${nowWired.join(", ")} — wired since the exemption was written; delete the exemption`);
ok("B6 every exemption carries a real reason",
  Object.values(NO_HANDLER_NEEDED).every((r) => typeof r === "string" && r.length > 60));

/* ================================================================== */

const label = "verify-action-keys-dispatched";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed (${actions.length} actions, ${noneType.length} with no check)`);
