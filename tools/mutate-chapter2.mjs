#!/usr/bin/env node
/**
 * mutate-chapter2 — can verify-chapter2 fail? NEW at 3.552.0.
 *
 * The pack mutations matter most here, exactly as they did for chapter 1.
 * Every defect this block fixed was DATA that looked right and did
 * nothing: an empty grant field, a flag on the wrong ability, a filter
 * one clause short. Sections P and Q recreate those, and prove the new
 * checks would have caught them.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const COND = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const LANG = path.join(SYSTEM_ROOT, "module", "languages.mjs");
const RPP = path.join(SYSTEM_ROOT, "module", "racial-pp.mjs");
const SA = path.join(SYSTEM_ROOT, "module", "combat", "save-advantage.mjs");
const PF = path.join(SYSTEM_ROOT, "module", "combat", "passive-feats.mjs");
const TG = path.join(SYSTEM_ROOT, "module", "magic", "tradition-gate.mjs");
const BS = path.join(SYSTEM_ROOT, "module", "magic", "beneficial-save.mjs");
const FW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const CASTING = path.join(SYSTEM_ROOT, "module", "magic", "casting.mjs");
const PICK = path.join(SYSTEM_ROOT, "module", "picker-filters.mjs");
const GRANTS = path.join(SYSTEM_ROOT, "module", "grants-workflow.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const FM = path.join(SYSTEM_ROOT, "module", "combat", "forced-movement.mjs");
const FMW = path.join(SYSTEM_ROOT, "module", "combat", "forced-movement-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter2.mjs");

const MUTATIONS = [
  /* ── the language rule Graham ruled on ─────────────────────────── */
  {
    file: LANG,
    name: "E1 the Intelligence threshold moves to 5, as page 20 misprints it",
    from: "  if (int > 0) sources.push({ label: `Intelligence +${int}`, count: int, scope: \"racial\" });",
    to: "  if (int >= 5) sources.push({ label: `Intelligence +${int}`, count: int, scope: \"racial\" });",
    breaks: "E2/E3 — Graham ruled page 20 a typo; Chapter 2's Bonus Languages section governs"
  },
  {
    file: LANG,
    name: "E2 a named language outside its group is dropped",
    from: "    names.add(canonicalLanguage(entry));",
    to: "    if (LANGUAGE_GROUPS.includes(entry)) names.add(canonicalLanguage(entry));",
    breaks: "E7/E8/E9 — the Gnome's Gaelic and the Dwarf's Gaian are the exceptions a groups-only model loses"
  },

  /* ── per-level grants ──────────────────────────────────────────── */
  {
    file: RPP,
    name: "D1 a heritage PP rate drifts",
    from: '"gul-fyr": 1',
    to: '"gul-fyr": 2',
    breaks: "D2 — Gul-Fyr prints one additional PP each level"
  },
  {
    file: FW,
    name: "D2 Stout-Fyr's HP becomes a flat lump rather than per level",
    from: '{ heritage: "Stout-Fyr", stat: "hp", value: 1 }',
    to: '{ heritage: "Stout-Fyr", stat: "hp", value: 12 }',
    breaks: "D4 — the flat-vs-per-level shape the Sharuk-Xal incident cost, in the row no harness read"
  },

  /* ── the five defects 3.552.0 fixed ────────────────────────────── */
  {
    file: BS,
    name: "G1 the beneficial-spell save goes back to reading the cast gate",
    from: "  const forbidden = beneficialSaveTraditionsOf(target);",
    to: "  const forbidden = forbiddenTraditionsOf(target);",
    breaks: "G2 — a Nerini gnome has to roll a Will save to be healed"
  },
  {
    file: TG,
    name: "G2 the beneficial-save flag stops being its own",
    from: "    const declared = document?.flags?.[SYSTEM_ID]?.beneficialTraditionSave;",
    to: "    const declared = document?.flags?.[SYSTEM_ID]?.forbiddenTraditions;",
    breaks: "G2 — the same leak by the other route"
  },
  {
    file: SA,
    name: "G3 a spell-only reaction stops checking what forced the save",
    from: "    if (entry?.spellOnly && !isSpell) {",
    to: "    if (false && entry?.spellOnly && !isSpell) {",
    breaks: "G16/G17 — Gnome Resistance is offered on poison, falling and traps again"
  },
  {
    file: SA,
    name: "G4 the spell gate widens to every reaction, printed trigger or not",
    from: "    if (entry?.spellOnly && !isSpell) {",
    to: "    if (!isSpell) {",
    breaks: "G19 — Evasion and its kin print no spell trigger and must not be narrowed"
  },
  {
    file: PF,
    name: "G5 the terrain rule goes back to a feat name",
    from: "  if (magical || !eases) return { cost: charged, eased: false };",
    to: "  if (magical) return { cost: charged, eased: false };",
    breaks: "G11 — terrain would be eased for everybody, which is the opposite failure"
  },
  {
    file: PF,
    name: "G6 formidable terrain is eased all the way to normal",
    from: "  const eased = Math.max(1, multiplier - 1);",
    to: "  const eased = 1;",
    breaks: "G10 — the printed rule steps formidable down to difficult, not to nothing"
  },
  {
    file: PF,
    name: "G7 magical terrain stops being exempt",
    from: "  if (magical || !eases) return { cost: charged, eased: false };",
    to: "  if (!eases) return { cost: charged, eased: false };",
    breaks: "G12 — 'non-magical difficult terrain' is the printed scope"
  },
  {
    file: PF,
    name: "G8 the terrain flag stops being read off effects",
    from: "  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {",
    to: "  for (const effect of []) {",
    breaks: "G8 — a heritage's transferred effect is one of the two carriers"
  },
  {
    file: CASTING,
    name: "G9 a cantrip chooser goes back to PP 0 alone",
    from: "  if (Number(spell?.system?.ppCost ?? 1) !== 0) return false;\n  return /\\bcantrip\\b/i.test(String(spell?.system?.traits ?? \"\"));",
    to: "  return Number(spell?.system?.ppCost ?? 1) === 0;",
    breaks: "G21 — five choosers offered Guidance, which is PP 0 and not a cantrip"
  },
  {
    file: CASTING,
    name: "G10 the cantrip test stops requiring PP 0",
    from: "  if (Number(spell?.system?.ppCost ?? 1) !== 0) return false;",
    to: "  if (false) return false;",
    breaks: "G21 — Arcane Knowledge prints 'cantrip (PP 0)', so the cost is part of its own rule"
  },

  /* ── the pairing and the engine ────────────────────────────────── */
  {
    file: PICK,
    name: "H1 the heritage picker stops filtering by race",
    from: "      return (entry) => matchesSource(entry.system?.sourceRace, race);\n    case \"origin\":",
    to: "      return () => true;\n    case \"origin\":",
    breaks: "H4 — an Ascendan is offered Dwarf heritages"
  },
  /* ── the four remaining audit defects ──────────────────────────── */
  {
    file: FW,
    name: "I1 the Human's ethnicity lore has a flag and no button",
    from: '  "human": { hint: "Name the lore of your ethnicity',
    to: '  "humanx": { hint: "Name the lore of your ethnicity',
    breaks: "I5 — an authored choice nothing asks about grants exactly nothing, which is the state D3 found"
  },
  {
    file: FW,
    name: "I2 Shadow Stance goes back to an untimed Concealed",
    from: '      await applyConditionTags(actor, [{ key: "concealed", label: "Concealed" }], { expiresRound });',
    to: '      await actor.toggleStatusEffect("concealed", { active: true });',
    breaks: "I6/I9 — a permanent -2 to be hit for one AP, until somebody notices"
  },
  {
    file: FW,
    name: "I3 the stance clock counts to the wrong boundary",
    from: "      const expiresRound = inCombat ? Number(game.combat?.round ?? 0) + 1 : null;",
    to: "      const expiresRound = inCombat ? Number(game.combat?.round ?? 0) : null;",
    breaks: "I7 — expiring at the current round means the sweep takes it away before the stance has done anything"
  },
  {
    file: GRANTS,
    name: "I4 the Use nudge narrows back to races and heritages",
    // Narrowed at 3.563.0: the specialist-skill gate above this one grew a
    // second clause, so this line is now unique on its own.
    from: "  if (FOUNDATION_ITEM_TYPES.includes(sourceItem.type)) {",
    to: "  if ([\"race\", \"heritage\"].includes(sourceItem.type)) {",
    breaks: "I10 — the narrowing that left a Soldier's Weapon Focus unchosen and unmentioned"
  },
  {
    file: GRANTS,
    name: "I5 a granted ability's own Use action stops being mentioned",
    from: '      if (granted.flags?.["trg-prime"]?.grantedBy?.sourceId !== sourceItem.id) continue;',
    to: "      continue;",
    breaks: "I11 — Versatile's button is on the ability, and the ability is what nobody sees"
  },
  {
    file: GRANTS,
    name: "I8 the card names the same button twice, in two wordings",
    from: "    if (!alreadyNamed && setupChoicePending(actor, sourceItem)) {",
    to: "    if (setupChoicePending(actor, sourceItem)) {",
    breaks: "I11a — found live on the Human's ethnicity lore, which the choice block had already named"
  },
  {
    file: FW,
    name: "I9 a race's specialist-skill card calls its carrier a background",
    from: "  if (type === \"race\") return \"the race\";",
    to: "  if (type === \"race\") return \"the background\";",
    breaks: "I11c — the wording that was true of eight backgrounds and false for the first race to use it"
  },
  {
    file: FM,
    name: "I6 the movement prompt stops being read off effects",
    from: "    ...Array.from(actor?.appliedEffects ?? actor?.effects ?? []).filter((e) => !e?.disabled)",
    to: "    ...[]",
    breaks: "I15 — a transferred heritage effect is one of the two carriers, exactly as the terrain flag is"
  },
  {
    file: FMW,
    name: "I7 the push card drops the prompts it was handed",
    from: "  const notes = (prompts ?? [])",
    to: "  const notes = ([])",
    breaks: "I16 — collected, passed, and thrown away one line before it would have been shown"
  },

  /* ── the rulings of 15 September 2026 ──────────────────────────── */
  {
    file: FEATS,
    name: "J1 the 1st-level lock stops exempting the GM",
    from: "  if (isGM) return \"\";",
    to: "  if (false) return \"\";",
    breaks: "J3 — race, heritage and background all exempt the GM, and this was ruled to match them"
  },
  {
    file: FEATS,
    name: "J2 the lock becomes a trap: a choice never made is refused too",
    from: "  if (!alreadyChosen) return \"\";",
    to: "  if (false) return \"\";",
    breaks: "J4 — a Human who levelled without pressing Use would be left with no ability modifiers at all"
  },
  {
    file: FEATS,
    name: "J3 the lock bites at 1st level as well",
    from: "  if (!(lvl > 1)) return \"\";",
    to: "  if (!(lvl > 0)) return \"\";",
    breaks: "J1 — the choice is MADE at 1st level; locking it there locks it before it exists"
  },
  {
    file: FW,
    name: "J4 Versatile asks first and checks afterwards",
    from: "      if (refusal) {\n        ui.notifications.warn(refusal);\n        return;\n      }",
    to: "      if (refusal) { /* checked after the dialog */ }",
    breaks: "J6 — a gate that runs after the questions is one the player has already answered"
  },
  {
    file: FW,
    name: "J4a the shared chooser computes the refusal and asks anyway",
    from: "    if (refusal) {\n      ui.notifications.warn(refusal);\n      return null;\n    }",
    to: "    if (refusal) { void refusal; }",
    breaks: "J7a — the same 'gate that does not gate' shape J6a was tightened for, one layer down"
  },
  {
    file: FW,
    name: "J4b a cantrip chooser quietly opts out of the lock",
    from: '        flagKey: "gulFyrSpell",\n        firstLevelChoice: true,',
    to: '        flagKey: "gulFyrSpell",',
    breaks: "J7d — a heritage's own spell would become re-pickable at any level"
  },
  {
    file: FW,
    name: "J4c the lock spreads to every caller of the shared chooser",
    from: "  firstLevelChoice = false,",
    to: "  firstLevelChoice = true,",
    breaks: "J7e — a feat taken at 5th level would be refused the choice it was taken for"
  },
  {
    // ADDED AT 3.552.8, with the racial choosers. The list-shaped check
    // this replaced could not see this: Menora is not one of the three
    // names the ruling before it happened to spell out.
    file: FW,
    name: "J4d a RACIAL chooser quietly opts out of the lock",
    from: '        firstLevelChoice: true,\n        extraFlags: { warpDiscount: 1 },',
    to: '        extraFlags: { warpDiscount: 1 },',
    breaks: "J7d/J7f — Graham's 15 Sep ruling named Menora, Urloch and Tirvni"
  },
  {
    file: FW,
    name: "J4e a feat chooser takes the 1st-level lock it must not have",
    from: '        flagKey: "etherealTrick",',
    to: '        flagKey: "etherealTrick",\n        firstLevelChoice: true,',
    breaks: "J7e — Ethereal Trick is a feat, and a feat is chosen when it is taken"
  },
  {
    file: FW,
    name: "J5 Shadow Stance stops consulting its own traits",
    from: "      if (!traitGate(actor, item.system, item.name)) return;",
    to: "      if (false) return;",
    breaks: "J17 — Open (be your first action) and Stance (wait a round) both go unenforced again"
  },
  {
    file: FW,
    name: "J6 the stance is entered but never recorded",
    from: "      await recordTraitUsage(actor, item.system);",
    to: "",
    breaks: "J18 — nothing holds the next Stance for a round if the last one was never written down"
  },

  {
    file: COND,
    name: "A1 an axis leaves the engine and every rule scoped on it alone falls through the floor",
    from: '  "checkTypes", "subjects", "actions", "traits", "traditions", "sourceTypes",',
    to: '  "checkTypes", "subjects", "traits", "traditions", "sourceTypes",',
    breaks: "A2 — 21 of the 57 pack conditionals are scoped on `actions` and nothing else; " +
      "losing the axis drops them silently, which is the failure the cited-but-missing verify-races.mjs was for"
  }
];

/* ────────────────────────────────────────────────────────────────── *
 * P: THE PACKS. Binary LevelDB, so these are read, mutated, restored
 * and re-read outside guardFiles — a corrupted pack is not something to
 * find out about later.
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
      process.stderr.write(`mutate-chapter2: FAILED TO RESTORE ${pack}/${name} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  {
    name: "P1 Sorini goes back to granting nothing",
    pack: "heritages", item: "Sorini",
    mutate: (doc) => { doc.system.racialAbilities = ""; },
    breaks: "G4 — the heritage printed a scent and handed over nothing at all"
  },
  {
    name: "P2 Forbidden Magic loses its beneficial-save flag",
    pack: "abilities", item: "Forbidden Magic",
    mutate: (doc) => { delete doc.flags["trg-prime"].beneficialTraditionSave; },
    breaks: "G1 — the clause the Ascendan prints stops belonging to it"
  },
  {
    name: "P3 Gnome Resistance loses its spell trigger",
    pack: "abilities", item: "Gnome Resistance",
    mutate: (doc) => { delete doc.flags["trg-prime"].saveReaction.spellOnly; },
    breaks: "G13 — it prints 'when targeted by a spell'"
  },
  {
    name: "P4 Silvarni loses the terrain flag",
    pack: "heritages", item: "Silvarni",
    mutate: (doc) => { delete doc.flags["trg-prime"].ignoresDifficultTerrain; },
    breaks: "G7 — the heritage that prints the rule stops reaching it"
  },
  {
    name: "P11 Wash Away Sin's damage drifts back to d6",
    pack: "spells", item: "Wash Away Sin",
    mutate: (doc) => { doc.system.damage.formula = "1d6"; },
    breaks: "J9 — Graham ruled d8 on both sides on 15 Sep 2026"
  },
  {
    // RE-AIMED 3.613.0: the warp is armed now (block 35's B5), with the one key
    // both sides read. The defect is a drift back to the pair 3.531.0 shipped.
    name: "P12 the +2 PP warp drifts back to the 3.531.0 pair of keys",
    pack: "spells", item: "Wash Away Sin",
    mutate: (doc) => { doc.system.warps[0].mods = { healDice: "1d8", damageDice: "1d8" }; },
    breaks: "J12 — one key, damageDice, which the heal falls back to"
  },
  {
    name: "P12a the cone goes back to catching allies only",
    pack: "spells", item: "Wash Away Sin",
    mutate: (doc) => { doc.system.areaTargeting = "allies"; },
    breaks: "J12a — the damage would have nobody to reach but the party it just healed"
  },
  {
    name: "P12b the damage stops declaring its opposed-aura scope",
    pack: "spells", item: "Wash Away Sin",
    mutate: (doc) => { doc.system.damageScope = ""; },
    breaks: "J12b — a wider cone with no scope burns everyone standing in it, allies included"
  },
  {
    name: "P12c the heal row widens with the cone",
    pack: "spells", item: "Wash Away Sin",
    mutate: (doc) => { doc.system.effects[0].target = "targets"; },
    breaks: "J12c — the spell would heal the creatures it is there to hurt"
  },
  {
    name: "P13 Shadow Stance loses its traits line again",
    pack: "abilities", item: "Shadow Stance",
    mutate: (doc) => { doc.system.traits = ""; },
    breaks: "J14 — the empty field that made Open and Stance unreachable"
  },
  {
    name: "P9 the Human loses their ethnicity-lore choice",
    pack: "races", item: "Human",
    mutate: (doc) => { delete doc.flags["trg-prime"].specialistChoice; },
    breaks: "I1 — the one race whose printed specialist skill is a choice"
  },
  {
    name: "P10 Storgar loses its forced-movement prompt",
    pack: "heritages", item: "Storgar",
    mutate: (doc) => { delete doc.flags["trg-prime"].involuntaryMovementNote; },
    breaks: "I12 — R6's text prompt, back to a featNote nobody reads"
  },
  {
    name: "P5 a heritage stops declaring which race it belongs to",
    pack: "heritages", item: "Thengar",
    mutate: (doc) => { doc.system.sourceRace = ""; },
    breaks: "H2 — a blank sourceRace passes the picker filter for every race"
  },
  {
    name: "P6 a racial ability's printed number drifts",
    pack: "abilities", item: "Hardy",
    mutate: (doc) => { doc.flags["trg-prime"].conditionals[0].value = 1; },
    breaks: "B2 — Hardy prints +2 against poison"
  },
  {
    name: "P7 a race loses its specialist skills",
    pack: "races", item: "Dwarf",
    mutate: (doc) => { doc.system.specialistSkills = ""; },
    breaks: "F1 — the Dwarf prints Dwarven Lore and Stone Lore"
  },
  {
    name: "P8 a race loses its core languages",
    pack: "races", item: "Elf",
    mutate: (doc) => { doc.system.coreLanguages = ""; },
    breaks: "E6 — every race prints core languages"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const SOURCES = [COND, LANG, RPP, SA, PF, TG, BS, FW, CASTING, PICK, GRANTS, FEATS, FM, FMW, CHECK];
const guard = guardFiles(SOURCES);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter2: verify already fails on an unmodified tree.\n");
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
  const outcome = await withPackField(m.pack, m.item, m.mutate, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-chapter2: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-chapter2: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
