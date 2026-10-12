#!/usr/bin/env node
/**
 * mutate-languages — can verify-languages fail? NEW at 3.553.0.
 *
 * The module is pure, so almost all of these are source mutations to the
 * arithmetic itself. The first is the rule page 38 states and page 20
 * misprints, which Graham ruled on: it is here so that the ruling has a
 * failing test behind it and not only a memory.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const LANG = path.join(SYSTEM_ROOT, "module", "languages.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-languages.mjs");

const MUTATIONS = [
  {
    file: LANG,
    name: "A1 the Linguistics rate stops paying",
    from: "  const perRate = Math.floor(ranks / RANKS_PER_LANGUAGE);",
    to: "  const perRate = 0;",
    breaks: "B3/B5 — 'for every 5 skill ranks… you may learn an additional language'"
  },
  {
    file: LANG,
    name: "A2 the rate rounds up, so one rank buys a language",
    from: "  const perRate = Math.floor(ranks / RANKS_PER_LANGUAGE);",
    to: "  const perRate = Math.ceil(ranks / RANKS_PER_LANGUAGE);",
    breaks: "B3 — four ranks is not five"
  },
  {
    file: LANG,
    name: "A3 the printed five becomes four",
    from: "RANKS_PER_LANGUAGE = 5;",
    to: "RANKS_PER_LANGUAGE = 4;",
    breaks: "B3/B4 — the rate is printed on page 38"
  },
  {
    file: LANG,
    name: "A4 Linguist adds a flat language instead of doubling the rate",
    from: "    sources.push({ label: \"Linguist\", count: perRate, scope: \"free\" });",
    to: "    sources.push({ label: \"Linguist\", count: 1, scope: \"free\" });",
    breaks: "B5/B6 — 'in addition to the one you normally get for every 5 ranks' is a rate"
  },
  {
    file: LANG,
    name: "A5 a negative Intelligence starts taking languages away",
    from: "  if (int > 0) sources.push({ label: `Intelligence +${int}`, count: int, scope: \"racial\" });",
    to: "  if (int !== 0) sources.push({ label: `Intelligence ${int}`, count: int, scope: \"racial\" });",
    breaks: "B2 — the rule only ever adds"
  },
  {
    file: LANG,
    name: "A6 THE PAGE 20 MISPRINT: the Intelligence threshold moves to 5",
    from: "  if (int > 0) sources.push({ label: `Intelligence +${int}`, count: int, scope: \"racial\" });",
    to: "  if (int >= 5) sources.push({ label: `Intelligence +${int}`, count: int, scope: \"racial\" });",
    breaks: "B1 — Graham ruled page 20 a typo; Chapter 2's own section governs"
  },
  {
    file: LANG,
    name: "A7 Polyglot Savant's two stop being held to common and uncommon",
    from: '    from: Object.freeze(["common", "uncommon"])',
    to: "    unrestricted: true",
    breaks: "B9/D12 — the feat's own stated range still binds even when the race's list does not"
  },
  {
    file: LANG,
    name: "A8 a background's slots become racially scoped again",
    from: '      scope: grant.scope === "free" ? "free" : "racial",',
    to: '      scope: "racial",',
    breaks: "C4 — Graham's ruling of 3 August: a background is upbringing, not bloodline"
  },
  {
    file: LANG,
    name: "A9 Linguistics slots are held to the racial list",
    from: '  if (perRate > 0) sources.push({ label: `Linguistics ${ranks} ranks`, count: perRate, scope: "free" });',
    to: '  if (perRate > 0) sources.push({ label: `Linguistics ${ranks} ranks`, count: perRate, scope: "racial" });',
    breaks: "C2/D10 — ranks are earned in play, so every language they buy is a post-1st-level pick"
  },
  {
    file: LANG,
    name: "A10 a language already granted for free costs a slot as well",
    from: "    if (coreSeen.has(key) || chosenSeen.has(key)) continue;",
    to: "    if (chosenSeen.has(key)) continue;",
    breaks: "D6 — picking a language your race already gave you is not a second language"
  },
  {
    file: LANG,
    name: "A11 the spend is clamped to the allowance, so over-allowance reads as zero",
    from: "  const spent = chosenRows.length;",
    to: "  const spent = Math.min(chosenRows.length, Number(allowance.total ?? 0));",
    breaks: "D7 — 'Your GM may allow you to select different languages', so it is reported, not hidden"
  },
  {
    file: LANG,
    name: "A12 remaining goes negative instead of bottoming out",
    from: "    remaining: Math.max(0, total - spent),",
    to: "    remaining: total - spent,",
    breaks: "D9 — the panel reads '5 / 7 · 2 left', and '-2 left' is not a sentence"
  },
  {
    file: LANG,
    name: "A13 every off-list pick is flagged, free slots or not",
    from: "  const uncovered = coverOffListPicks(offRacial, sources, resolveRange);",
    to: "  const uncovered = offRacial;",
    breaks: "D10 — a character with free slots is entitled to them; off-list is not the same as wrong"
  },
  {
    file: LANG,
    name: "A14 a named exception outside the group is dropped",
    from: "    names.add(canonicalLanguage(entry));",
    to: "    if (LANGUAGE_GROUPS.includes(entry.toLowerCase())) names.add(canonicalLanguage(entry));",
    breaks: "C8/E4 — the Gnome's Gaelic and the Dwarf's Gaian are the exceptions a groups-only model loses"
  },
  {
    file: LANG,
    name: "A15 a malformed choice spec is guessed at rather than refused",
    from: "  const match = /^(\\d+)\\s+(.+)$/.exec(clean);\n  if (!match) return null;\n  const count = Number(match[1]);\n  if (!Number.isFinite(count) || count <= 0) return null;",
    to: "  const match = /^(\\d+)?\\s*(.+)$/.exec(clean);\n  if (!match) return null;\n  const count = Number(match[1] ?? 1);\n  if (count <= 0) return null;",
    breaks: "B16 — a typo should cost that one grant, not invent an allowance"
  }
];

/* ────────────────────────────────────────────────────────────────── *
 * P: THE PACK — section E reads the races.
 * ────────────────────────────────────────────────────────────────── */
async function withPack(pack, name, mutate, body) {
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
      process.stderr.write(`mutate-languages: FAILED TO RESTORE ${pack}/${name} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  {
    name: "P1 a race stops declaring its core languages",
    pack: "races", item: "Orc",
    mutate: (doc) => { doc.system.coreLanguages = ""; },
    breaks: "E2/E6 — the Orc speaks Sharuk, and a blank field speaks nothing"
  },
  {
    name: "P2 a race's additional languages resolve to nothing",
    pack: "races", item: "Dwarf",
    mutate: (doc) => { doc.system.additionalLanguages = "any of the usual"; },
    breaks: "E4 — a spec that resolves to an empty set is the same as no spec at all"
  },
  {
    name: "P3 a core language is one the book never names",
    pack: "races", item: "Elf",
    mutate: (doc) => { doc.system.coreLanguages = "Aelvish, Elvish"; },
    breaks: "E5 — a second spelling of a language is a second language"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([LANG, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-languages: verify already fails on an unmodified tree.\n");
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
  const outcome = await withPack(m.pack, m.item, m.mutate, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-languages: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-languages: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
