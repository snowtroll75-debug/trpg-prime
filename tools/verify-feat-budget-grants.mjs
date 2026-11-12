#!/usr/bin/env node
/**
 * verify-feat-budget-grants — TRG Prime 3.684.8: what a feat or archetype
 * grants spends no feat pick.
 *
 * Graham, 6 November 2026: "When the Spell Weaver Archetype feat is taken,
 * it charges a feat pick for Magical Reservoir. I have just noticed it is
 * doing the same for Agile Display. The benefits gained from an archetype
 * feat should not charge the character an additional feat. There may be
 * other feats also affected."
 *
 * The sheet's `row.bonusFeat` was true only for a grant from a FOUNDATION
 * item (class, background, race, heritage, and the chain from them). A paid
 * archetype feat's grant read as paid, and an Archetype-category ability
 * sits in the Archetype Feats table, so it was counted as a feat.
 *
 *   G1  spendsNoFeatPick, the sheet's rule as a pure function
 *   G2  featBudget with rows built from the real pack items: Gymnast → Agile
 *       Display, Assassin → Death Mark, Warden → Favoured Terrain, Aegis →
 *       Shield Focus, Alchemist → Alchemical Crafting, and Eldritch Arts'
 *       Spell Weaver → Magical Reservoir when its sources are readable
 *   G3  a paid feat, and a grant whose source has gone, still count;
 *       foundation grants spend nothing, as before
 *   G4  the wiring
 */
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const F = await import(new URL("../module/feats.mjs", import.meta.url));

// The real pack documents.
async function packDocs(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [k, v] of db.iterator()) if (!k.includes(".")) out.push(v);
  await db.close();
  return out;
}
const core = [...await packDocs("feats"), ...await packDocs("abilities")];
const EA_SOURCE = path.join(SYSTEM_ROOT, "..", "..", "snowtroll75-debug", "trg-eldritch-arts", "packs-source");
const ea = [];
for (const dir of ["ea-feats", "ea-abilities"]) {
  const at = path.join(EA_SOURCE, dir);
  if (!fs.existsSync(at)) continue;
  for (const f of fs.readdirSync(at)) if (f.endsWith(".json")) { try { ea.push(JSON.parse(fs.readFileSync(path.join(at, f), "utf8"))); } catch { /* skipped */ } }
}
const find = (docs, name, type) => docs.find((d) => d.type === type && String(d.name).toLowerCase() === name.toLowerCase()) ?? null;

// An owned copy: a fresh id, and (for a grant) its source's id, as grants-workflow writes it.
let n = 0;
function owned(doc, from = null) {
  n += 1;
  return { id: `i${n}`, name: doc.name, type: doc.type, system: { category: doc.system?.category },
    flags: from ? { "trg-prime": { grantedBy: { sourceId: from.id, sourceName: from.name } } } : {} };
}
// The sheet's tables, by type and category (actor-sheet.mjs, the item loop).
function groupsOf(items, opts) {
  const g = { racialFeats: [], archetypeFeats: [], classFeats: [], generalFeats: [] };
  for (const item of items) {
    const row = { type: item.type, bonusFeat: F.spendsNoFeatPick(item, opts), name: item.name };
    const c = item.system?.category;
    if (item.type === "feat" && c === "Racial") g.racialFeats.push(row);
    else if (item.type === "feat" && c === "Archetype") g.archetypeFeats.push(row);
    else if (item.type === "feat" && c === "Class") g.classFeats.push(row);
    else if (item.type === "feat" && c === "General") g.generalFeats.push(row);
    else if (item.type === "ability" && c === "Archetype") g.archetypeFeats.push(row);
  }
  return g;
}
const spent = (items, opts = {}) => {
  const b = F.featBudget({ groups: groupsOf(items, { ownedIds: new Set(items.map((i) => i.id)), ...opts }), level: 3 });
  return [b.racial.spent, b.class.spent, b.general.spent];
};

// ── G1: the rule ────────────────────────────────────────────────────────
{
  const archetype = { id: "a1", type: "feat", name: "Gymnast" };
  const granted = { id: "a2", type: "feat", flags: { "trg-prime": { grantedBy: { sourceId: "a1" } } } };
  const orphan = { id: "a3", type: "feat", flags: { "trg-prime": { grantedBy: { sourceId: "gone" } } } };
  const self = { id: "a4", type: "feat", flags: { "trg-prime": { grantedBy: { sourceId: "a4" } } } };
  const ownedIds = new Set(["a1", "a2", "a3", "a4", "bg"]);
  const fromBg = { id: "a5", type: "feat", flags: { "trg-prime": { grantedBy: { sourceId: "bg" } } } };
  equal("G1 spendsNoFeatPick: an ability never spends; a grant from an item on the sheet, or a foundation item, spends nothing; a bought feat, a grant whose source has gone, and a self-reference spend",
    [F.spendsNoFeatPick({ id: "x", type: "ability" }), F.spendsNoFeatPick(granted, { ownedIds }), F.spendsNoFeatPick(fromBg, { foundationIds: new Set(["bg"]) }),
      F.spendsNoFeatPick(archetype, { ownedIds }), F.spendsNoFeatPick(orphan, { ownedIds }), F.spendsNoFeatPick(self, { ownedIds }), F.spendsNoFeatPick(granted)],
    [true, true, true, false, false, false, false]);
}

// ── G2: the real pack items ─────────────────────────────────────────────
{
  const pairs = [["Gymnast", "Agile Display", "ability"], ["Assassin", "Death Mark", "ability"], ["Mastermind", "Sense Weakness", "ability"],
    ["Warden", "Favoured Terrain", "feat"], ["Aegis", "Shield Focus", "feat"], ["Alchemist", "Alchemical Crafting", "feat"]];
  const rows = pairs.map(([feat, grant, type]) => {
    const fd = find(core, feat, "feat"), gd = find(core, grant, type);
    if (!fd || !gd) return [feat, "missing"];
    const f = owned(fd); const g = owned(gd, f);
    return [feat, fd.system?.category, gd.system?.category, spent([f, g])];
  });
  equal("G2 core: each archetype feat costs its one Class pick, and what it grants costs nothing (Agile Display, Death Mark, Sense Weakness, Favoured Terrain, Shield Focus, Alchemical Crafting)",
    rows, [["Gymnast", "Archetype", "Archetype", [0, 1, 0]], ["Assassin", "Archetype", "Archetype", [0, 1, 0]], ["Mastermind", "Archetype", "Archetype", [0, 1, 0]],
      ["Warden", "Archetype", "Class", [0, 1, 0]], ["Aegis", "Archetype", "Class", [0, 1, 0]], ["Alchemist", "Archetype", "General", [0, 1, 0]]]);
  const sw = find(ea, "Spell Weaver", "feat"), mr = find(ea, "Magical Reservoir", "ability");
  if (sw && mr) {
    const f = owned(sw); const g = owned(mr, f);
    equal("G2b Eldritch Arts (read from its sources): Spell Weaver costs one pick, Magical Reservoir none", [mr.system?.category, spent([f, g])], ["Archetype", [0, 1, 0]]);
  } else ok("G2b Eldritch Arts sources not readable here — skipped", true);
}

// ── G3: what still counts ───────────────────────────────────────────────
{
  const warden = owned(find(core, "Warden", "feat"));
  const terrain = owned(find(core, "Favoured Terrain", "feat"), warden);
  const bought = owned(find(core, "Shield Focus", "feat"));
  const orphan = owned(find(core, "Alchemical Crafting", "feat"), { id: "deleted", name: "Alchemist" });
  const bg = { id: "bg1", type: "background", name: "Miner", system: {}, flags: {} };
  const fromBg = owned(find(core, "Power Attack", "feat") ?? find(core, "Toughness", "feat"), bg);
  const all = [warden, terrain, bought, orphan, bg, fromBg];
  const foundationIds = F.freeGrantSources(all, ["background"]);
  equal("G3 a bought feat counts; a grant whose source has left the sheet counts; a background's bonus feat spends nothing (Warden 1 + Shield Focus 1 Class, Alchemical Crafting 1 General)",
    spent(all, { foundationIds }), [0, 2, 1]);
  const noAbilityPick = F.featBudget({ groups: { archetypeFeats: [{ type: "ability", bonusFeat: false }, { type: "feat", bonusFeat: false }] }, level: 3 });
  const companion = F.companionFeatBudget({ groups: { classFeats: [{ type: "ability", bonusFeat: false }, { type: "feat", bonusFeat: false }] }, bonusFeats: 2 });
  equal("G3b featBudget never counts an ability row, even one marked as paid; nor does a companion's budget",
    [noAbilityPick.class.spent, companion.single?.spent], [1, 1]);
}

// ── G4: the wiring ──────────────────────────────────────────────────────
{
  const sheet = read("module", "sheets", "actor-sheet.mjs");
  ok("G4 the sheet's row.bonusFeat is spendsNoFeatPick over every item on the sheet and the foundation chain",
    /row\.bonusFeat = spendsNoFeatPick\(item, \{ ownedIds, foundationIds \}\);/.test(sheet)
    && /const ownedIds = new Set\(Array\.from\(items \?\? \[\]\)\.map\(\(i\) => i\?\.id\)\.filter\(Boolean\)\);/.test(sheet)
    && /else if \(item\.type === "ability" && category === "Archetype"\) groups\.archetypeFeats\.push\(row\);/.test(sheet));
}

if (failures.length) {
  process.stdout.write(`verify-feat-budget-grants: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-feat-budget-grants: OK — ${checks} checks.\n`);
