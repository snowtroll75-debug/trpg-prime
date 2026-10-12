#!/usr/bin/env node
/**
 * mutate-chooser-index-fields — can verify-chooser-index-fields fail?
 * NEW at 3.552.7.
 *
 * The first mutation is the shipped bug, put back exactly as it stood
 * when Graham's Arcane Knowledge chooser found nothing in a cold world.
 * If that one ever says SURVIVED, this whole file is decoration.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const CASTING = path.join(SYSTEM_ROOT, "module", "magic", "casting.mjs");
const BUILDER = path.join(SYSTEM_ROOT, "module", "magic-item-builder-workflow.mjs");
const GRANTS = path.join(SYSTEM_ROOT, "module", "grants-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chooser-index-fields.mjs");

const MUTATIONS = [
  {
    file: FEATS,
    name: "A1 THE SHIPPED BUG: traits drops out of the base field list",
    from: '    fields: ["system.tradition", "system.ppCost", "system.specialist", "system.traits", ...indexFields]',
    to: '    fields: ["system.tradition", "system.ppCost", "system.specialist", ...indexFields]',
    breaks: "A2/B2 — six cantrip choosers matched nothing on a cold world and said so as \"no matching spells\""
  },
  {
    file: FEATS,
    name: "A2 a caller can no longer ask for anything of its own",
    from: '"system.specialist", "system.traits", ...indexFields]',
    to: '"system.specialist", "system.traits"]',
    breaks: "A3 — Primal Warrior's defence and the specialist-class choosers would go dead"
  },
  {
    file: FEATS,
    name: "A3 Primal Warrior stops declaring the category its filter reads",
    from: '        indexFields: ["system.category"],\n        flagKey: "primalWarriorSpell",',
    to: '        flagKey: "primalWarriorSpell",',
    breaks: "B2 — the filter is dead on a cold world, silently, and the chooser offers nothing"
  },
  {
    file: FEATS,
    name: "A4 a chooser starts filtering on a field nobody asked for",
    from: '        title: "Lorist",',
    to: '        title: "Lorist",\n        extraTest: (s) => Boolean(s.system?.school),',
    breaks: "B2 — the rule is the class of bug, not the six known instances"
  },
  {
    file: FEATS,
    name: "A4b Primal Warrior goes back to reading attack/save off the traits",
    from: '        filter: (s) => /^(attack|save)$/i.test(String(s.system?.category ?? "").trim()),',
    to: '        filter: (s) => /attack|save/i.test(String(s.system?.traits ?? "")),',
    breaks: "E1 — the shipped filter, which matched 0 of 586 spells and offered nothing"
  },
  {
    file: CASTING,
    name: "A5 isCantripSpell stops requiring the Cantrip trait",
    from: '  return /\\bcantrip\\b/i.test(String(spell?.system?.traits ?? ""));',
    to: "  return true;",
    breaks: "C3 — PP 0 alone would let every at-will spell through, and the base-list rule loses its reason"
  },
  {
    file: BUILDER,
    name: "A6 the ammunition builder stops asking for quantity again",
    from: '"system.damage", "system.quantity"] }) : [];',
    to: '"system.damage"] }) : [];',
    breaks: "D2/D3 — a bundle of 20 arrows priced and weighed as one"
  },
  {
    file: GRANTS,
    name: "A7 a field-declaring index call elsewhere loses its field",
    from: '  const index = await pack.getIndex({ fields: ["system.sourceClass"] });',
    to: "  const index = await pack.getIndex({ fields: [\"system.img\"] });",
    breaks: "D2 — matchGrants could no longer tell the Rogue's Trap Finder from the Ranger's"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

/* ────────────────────────────────────────────────────────────────── *
 * P: THE PACK. Section E of the check reads the spells pack, so the
 * ruling that sorted the eight ambiguous spells can only be tested by
 * putting one back where it was. Read, mutated, restored and re-read
 * outside guardFiles — a corrupted pack is not something to find out
 * about later. Same shape as mutate-chapter2's.
 * ────────────────────────────────────────────────────────────────── */
async function withPackField(pack, name, mutate, body) {
  const dir = path.join(SYSTEM_ROOT, "packs", pack);
  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let key = null;
  let original = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (v?.name === name && k.startsWith("!items!") && !k.slice(7).includes("!")) {
        key = k; original = JSON.parse(JSON.stringify(v)); break;
      }
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(original));
    mutate(mutated);
    await db.put(key, mutated);
    await db.close();
    return await body();
  } finally {
    const restore = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
    await restore.open();
    if (key && original) await restore.put(key, original);
    const back = key ? await restore.get(key).catch(() => null) : null;
    await restore.close();
    if (key && JSON.stringify(back) !== JSON.stringify(original)) {
      process.stderr.write(`mutate-chooser-index-fields: FAILED TO RESTORE spells/${name} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  {
    name: "P1 Temporal Stasis drifts back to utility",
    item: "Temporal Stasis",
    mutate: (doc) => { doc.system.category = "utility"; },
    breaks: "E6 — it would drop off every attack/save list again while still rolling a save"
  },
  {
    name: "P2 a bystander-save spell is promoted to a save spell",
    item: "Solitude",
    mutate: (doc) => { doc.system.category = "save"; },
    breaks: "E7 — the other half of the ruling: the fog's save is not the target's"
  },
  {
    name: "P3 one of the eight loses the defence that made it ambiguous",
    item: "Scrying",
    mutate: (doc) => { doc.system.defence = ""; },
    breaks: "E8 — the ruling that sorted it no longer applies, and should be re-argued"
  },
  {
    name: "P4 a spell is given a category the system does not know",
    item: "Tame",
    mutate: (doc) => { doc.system.category = "reaction"; },
    breaks: "E3 — a fourth category would divide every spell list silently"
  }
];

const guard = guardFiles([FEATS, CASTING, BUILDER, GRANTS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chooser-index-fields: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

for (const m of PACK_MUTATIONS) {
  const outcome = await withPackField("spells", m.item, m.mutate, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-chooser-index-fields: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-chooser-index-fields: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
