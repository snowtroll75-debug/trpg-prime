#!/usr/bin/env node
/**
 * mutate-effect-grouping — can verify-effect-grouping actually fail?
 *
 * NEW at 3.383.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE POINT: it restores the tab to reading
 * `actor.effects` alone — three rows for a character with seventeen
 * effects acting on them, which is the state this release fixes.
 *
 * THE SECOND is the one that would never be reported: filing the six
 * `featSource` effects as temporary, so a player is handed a delete
 * button for something that defines their character. Nobody reports a
 * button they did not press.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "effect-grouping.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const TPL = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const ROW = path.join(SYSTEM_ROOT, "templates", "actor", "effect-row.hbs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CSS = path.join(SYSTEM_ROOT, "styles", "trg-prime.css");

const MUTATIONS = [
  {
    name: "THE SHIPPED STATE: the tab stops reading owned items",
    file: SHEET,
    from: "    for (const item of actor.items ?? []) {\n      for (const effect of item.effects ?? []) {\n        groups[effectGroup(effect, item)].push(effectRow(effect, item));\n      }\n    }",
    to: "    void actor;",
    breaks: "D1 — three rows against seventeen effects, exactly as before"
  },
  {
    name: "THE SIX MISFILE: featSource on the actor becomes temporary",
    file: RULE,
    from: "  if (flags.featSource) return \"permanent\";",
    to: "  void flags;",
    breaks: "A8 — a delete button on something that defines the character"
  },
  {
    name: "grouping keys on where the document lives alone",
    file: RULE,
    from: "  if (parentItem) {\n    return PERMANENT_ITEM_TYPES.includes(String(parentItem.type ?? \"\").trim())\n      ? \"permanent\"\n      : \"temporary\";\n  }",
    to: "  if (parentItem) return \"permanent\";",
    breaks: "A4 — a magic sword's bonus filed as a permanent feature of the character"
  },
  {
    name: "a condition on an item stops being a condition",
    file: RULE,
    from: "  if (flags.condition) return \"condition\";",
    to: "  if (false) return \"condition\";",
    breaks: "A1/A2 — conditions scattered into the other two groups"
  },
  {
    name: "the fallback becomes PERMANENT, so the unknown is hidden",
    file: RULE,
    from: "  if (flags.featSource) return \"permanent\";\n  return \"temporary\";",
    to: "  if (flags.featSource) return \"permanent\";\n  return \"permanent\";",
    breaks: "A9/A10 — an unanticipated effect hidden in a collapsed panel"
  },
  {
    name: "THE FOURTH ROUTE IS FORGOTTEN: specialtyGrant reads as a note",
    file: RULE,
    from: "  \"specialtyGrant\",",
    to: "  \"notARealFlag\",",
    breaks: "B3 — Dengar's crafting slot filed as a printed note"
  },
  {
    name: "an empty conditionals list counts as a mechanic",
    file: RULE,
    from: "    if (Array.isArray(value)) return value.length > 0;",
    to: "    if (Array.isArray(value)) return true;",
    breaks: "B6 — the absence of a rule read as a rule"
  },
  {
    name: "the undermaintained flags are trusted after all",
    file: RULE,
    from: "  \"conditionals\"",
    to: "  \"conditionals\",\n  \"featPassive\"",
    breaks: "B8 — Dengar is flagged featPassive and changes nothing"
  },
  {
    name: "a transferred effect is offered a delete button",
    file: RULE,
    from: "      deletable: false,",
    to: "      deletable: true,",
    breaks: "C1 — a bin that promises what the row cannot do"
  },
  {
    name: "a granted effect deletes without warning",
    file: RULE,
    from: "  if (flags.grantedBy || flags.featSource) {",
    to: "  if (false) {",
    breaks: "C5/C7 — Graham's actual worry, restored"
  },
  {
    name: "the warning stops naming the item that granted it",
    file: RULE,
    from: "      reason: named\n        ? `This was granted by ${named}. Deleting it here may not come back.`\n        : \"This was granted by something you hold. Deleting it here may not come back.\"",
    to: "      reason: \"This was granted by something you hold. Deleting it here may not come back.\"",
    breaks: "C6b — a warning a player cannot act on"
  },
  {
    name: "the sheet stops resolving the granting item",
    file: SHEET,
    from: "      const sourceName = sourceId ? (actor.items.get(sourceId)?.name ?? null) : null;",
    to: "      const sourceName = null;",
    breaks: "D10b — the name is available and thrown away"
  },
  {
    name: "the deletion reason stops naming the item to open",
    file: RULE,
    from: "      reason: `This comes from ${parentItem.name ?? \"an item\"} — open that to change it.`",
    to: "      reason: \"Not deletable.\"",
    breaks: "C2 — a refusal with nowhere to go"
  },
  {
    name: "notes are mixed back in with real modifiers",
    file: SHEET,
    from: "      mechanical: rows.filter((r) => r.mechanical),",
    to: "      mechanical: rows,",
    breaks: "D3 — 74 note rows beside the numbers that matter"
  },
  {
    name: "the open state is forgotten on every re-render",
    file: SHEET,
    from: "    this._permanentEffectsExpanded = expanded;",
    to: "    void expanded;",
    breaks: "D4 — the panel snaps shut whenever any field is edited"
  },
  {
    name: "the go-to-item control is dropped",
    file: ROW,
    from: "                    data-action=\"effectGoToItem\"",
    to: "                    data-action=\"nothing\"",
    breaks: "D8 — the row's only safe action removed"
  },
  {
    // THE 3.383.1 BUG. A bare partial invocation receives the current
    // context, so every `{{effect.name}}` inside it resolved to nothing:
    // sixteen blank rows, each rendering the wrong control because
    // `{{#if effect.deletable}}` was quietly false. Green harness, broken
    // sheet — found only by opening it.
    name: "THE SHIPPED BUG: the partial is invoked without its context",
    file: TPL,
    // ANCHORED ON ONE OF THE FIVE. Breaking a single invocation is
    // enough: D6b requires EVERY one to pass its context, which is the
    // right shape — one bare invocation is one silently blank table.
    from: '{{#each effectGroups.conditions.mechanical as |effect|}}\n            {{> "systems/trg-prime/templates/actor/effect-row.hbs" effect=this}}',
    to: '{{#each effectGroups.conditions.mechanical as |effect|}}\n            {{> "systems/trg-prime/templates/actor/effect-row.hbs"}}',
    breaks: "D6b — blank rows with the wrong controls"
  },
  {
    name: "the partial loses its @root and reads the wrong context",
    file: ROW,
    from: "{{#if @root.editable}}",
    to: "{{#if ../editable}}",
    breaks: "D7 — controls silently vanish inside the partial"
  },
  {
    name: "the partial is never preloaded",
    file: BOOT,
    from: "    \"systems/trg-prime/templates/actor/effect-row.hbs\"",
    to: "    \"systems/trg-prime/templates/chat/check-card.hbs\"",
    breaks: "D6 — an unregistered partial renders as nothing at all"
  },
  {
    name: "THE COLLAPSE STOPS COLLAPSING",
    file: CSS,
    from: "  .trg-prime .permanent-effects .permanent-effects-body {\n    display: none;",
    to: "  .trg-prime .permanent-effects .permanent-effects-body {\n    display: block;",
    breaks: "D11 — the group Graham asked to hide would always be open"
  },
  {
    name: "the group is never rendered at all",
    file: TPL,
    from: "{{#each effectGroups.permanent.mechanical as |effect|}}",
    to: "{{#each effectGroups.permanent.nothing as |effect|}}",
    breaks: "D5 — the permanent table would be permanently empty"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-effect-grouping.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULE, SHEET, TPL, ROW, BOOT, CSS]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-effect-grouping: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-effect-grouping: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-effect-grouping: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
