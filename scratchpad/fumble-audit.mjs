import { FUMBLE_TABLES } from "../module/data/fumble-tables.mjs";
import { extractConditionTags, extractTextDuration, extractSelfDamage } from "../module/effect-parser.mjs";
import { durationClauses, scopedConditionDurations, followOnClauses } from "../module/combat/critical-durations.mjs";
import { saveRider, apFlatCheckEscape, powerPointDrain } from "../module/combat/critical-riders.mjs";

const ASKS = [
  ["drop weapon",        /\bdrop (?:it|the weapon)\b/i],
  ["weapon broken",      /\b(?:it is broken|weapon is broken|weapon breaks|string has snapped)\b/i],
  ["reroll vs ally",     /\breroll (?:this )?(?:the )?attack\b|\bcritically hit (?:an ally|yourself)\b|\bcritical(?: Injury)? to yourself\b/i],
  ["trigger reactions",  /\btriggers? reactions\b/i],
  ["no reactions",       /\bno Reactions\b/i],
  ["forced movement",    /\bmove \d+' in a random direction\b|\blands harmlessly \d+'\b|\bdrops harmlessly\b/i],
  ["save at level DC",   /\bSaving throw with a DC equal to your Level DC\b/i],
  ["type-split damage",  /\bFor Piercing or Slashing weapons\b/i],
  ["until healed",       /\buntil healed\b/i],
  ["until interact",     /\buntil you spend \d+ Interact actions\b/i],
  ["linked duration",    /\buntil the (?:bleed|recurring)[\w ]* (?:stops?|ends?)\b/i],
  ["ignores DR",         /\bignoring (?:DR ?&? ?)?[Rr]esistance\b/i]
];

for (const [table, rows] of Object.entries(FUMBLE_TABLES)) {
  console.log(`\n######## ${table}`);
  for (const r of rows) {
    const tags = extractConditionTags(r.effect).map(t => `${t.key}${t.value === null ? "" : ":" + t.value}`);
    const dur = extractTextDuration(r.effect);
    const self = extractSelfDamage(r.effect);
    const clauses = durationClauses(r.effect).map(c => c.duration.kind + (c.duration.to ? ":" + c.duration.to : ""));
    const asks = ASKS.filter(([, re]) => re.test(r.effect)).map(([n]) => n);
    const scoped = scopedConditionDurations(r.effect).filter(s => s.duration).map(s => `${s.key}=${s.duration.kind}`);
    console.log(`${String(r.min).padStart(3)}-${String(r.max).padEnd(3)} tags=[${tags}] dur=${dur.autoExpires ? "1r" : "-"} self=${self ? self.type : "-"} clauses=[${clauses}] scoped=[${scoped}]${asks.length ? "  ASKS: " + asks.join(", ") : ""}`);
  }
}
