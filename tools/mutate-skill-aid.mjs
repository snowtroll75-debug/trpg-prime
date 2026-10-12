#!/usr/bin/env node
/**
 * mutate-skill-aid — can verify-skill-aid actually fail?
 *
 * NEW at 3.380.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE POINT: it restores the state Aid Another was
 * in for the whole life of the system — the roll happens, the card is
 * posted, and the bonus reaches nobody. One line.
 *
 * The second family is the one that would be found LAST at a table:
 * letting Innate Teamwork extend a fumbled Aid, so one bad roll hands the
 * whole party a penalty. Nobody reports a feat for being too generous,
 * and nobody looks twice at a -1 they half expected.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const AID = path.join(SYSTEM_ROOT, "module", "skill-aid.mjs");
const SKILLS = path.join(SYSTEM_ROOT, "module", "skills.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED STATE: the bonus reaches nobody",
    file: SKILLS,
    from: "    await addPendingModifier(first, grant);",
    to: "    void grant;",
    breaks: "D1 — a calculator again, exactly as before this release"
  },
  {
    name: "the roll happens before anyone is chosen",
    file: SKILLS,
    // RE-ANCHORED AT 3.617.1: recipients are named by uuid (O1 of the 3.617.0 drive).
    from: "  const pool = aidRecipientPool({ sceneAllies, partyCharacters, selfId: actor.uuid });",
    to: "  const pool = { candidates: [{ id: \"x\", name: \"x\" }], source: \"scene\", reason: null };",
    breaks: "D2/D3 — rolling first and finding nobody to hand it to"
  },
  {
    name: "an empty pool rolls into the void instead of refusing",
    file: SKILLS,
    from: "  if (!pool.candidates.length) {\n    ui.notifications.warn(`Aid Another: ${pool.reason}.`);\n    return null;\n  }",
    to: "  void pool;",
    breaks: "D3 — the defect this release removes, restored"
  },
  {
    name: "a failed aid says nothing at all",
    file: SKILLS,
    from: "      content: `<div class=\"trg-prime\"><p><em>${actor.name}'s help comes to nothing — no bonus or penalty is carried forward.</em></p></div>`",
    to: "      content: `<div class=\"trg-prime\"><p><em>&nbsp;</em></p></div>`",
    breaks: "D5 — the lead would wait for a bonus that never arrives"
  },
  {
    name: "INNATE TEAMWORK SPREADS A FUMBLE ROUND THE PARTY",
    file: AID,
    from: "  return Boolean(grant?.helpful);",
    to: "  return Boolean(grant);",
    breaks: "C4/C5 — one bad roll would hand every ally a penalty"
  },
  {
    name: "the feat extends even with no grant to extend",
    file: AID,
    from: "  if (!owns) return false;\n  return Boolean(grant?.helpful);",
    to: "  return owns;",
    breaks: "C6/C10 — extending nothing, to everyone"
  },
  {
    name: "the feat gate stops being checked",
    file: AID,
    from: "  if (!owns) return false;",
    to: "  void owns;",
    breaks: "C7 — everyone would have Innate Teamwork"
  },
  {
    name: "the extension re-offers the ally who already has it",
    file: SKILLS,
    from: "    const others = pool.candidates.filter((a) => a.id !== result.allyId);",
    to: "    const others = pool.candidates;",
    breaks: "D7 — the first ally could be given the same bonus twice"
  },
  {
    name: "a plain failure grants a zero instead of nothing",
    file: AID,
    from: "  if (!value) return null;",
    to: "  if (value === null) return null;",
    breaks: "B4 — the lead's dialog fills with rows worth nothing"
  },
  {
    name: "the penalties are clamped away, so Aid can only help",
    file: AID,
    from: "  let value = bonusCheckModifier(String(degree ?? \"\").trim().toLowerCase());",
    to: "  let value = Math.max(0, bonusCheckModifier(String(degree ?? \"\").trim().toLowerCase()));",
    breaks: "B7/B8 — a fumbled Aid would quietly become harmless"
  },
  {
    name: "every grant is marked helpful, penalties included",
    file: AID,
    from: "    helpful: value > 0",
    to: "    helpful: true",
    breaks: "B9 — and Innate Teamwork would then extend penalties"
  },
  {
    name: "the bonus outlives the check it belongs to",
    file: AID,
    from: "    oneShot: true,",
    to: "    oneShot: false,",
    breaks: "B3 — one Aid would bonus every later roll the lead made"
  },
  {
    name: "the scope stops naming the skill and purpose",
    file: AID,
    from: "  const scope = what\n    ? `The ${skill} check to ${what} that ${aiderName} aided`\n    : `The ${skill} check ${aiderName} aided`;",
    to: "  const scope = \"Aid\";",
    breaks: "B11-B15 — the lead could not tell which check it was for"
  },
  {
    name: "the aider can aid themselves",
    file: AID,
    from: "    .filter((a) => a && a.id && a.id !== selfId);",
    to: "    .filter((a) => a && a.id);",
    breaks: "A2/A5 — a character would bonus their own check"
  },
  {
    name: "the party fallback is dropped, so out-of-combat Aid grants nothing",
    file: AID,
    from: "  const party = unique(notSelf(partyCharacters));\n  if (party.length) return { candidates: party, source: \"party\", reason: null };",
    to: "  void partyCharacters;",
    breaks: "A4/A5 — two characters in a library would have nobody to aid"
  },
  {
    name: "a duplicated ally is offered twice",
    file: AID,
    from: "    return list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));",
    to: "    return list.filter((a) => Boolean(seen) || Boolean(a));",
    breaks: "A9 — the same ally appearing twice reads as a bug"
  },
  {
    name: "an empty pool stops explaining itself",
    file: AID,
    from: "    reason: \"there is nobody to aid — no allies on this scene and no other player characters\"",
    to: "    reason: null",
    breaks: "A7 — the anti-silence rule at the one place a user reads"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-skill-aid.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([AID, SKILLS]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-skill-aid: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-skill-aid: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-skill-aid: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
