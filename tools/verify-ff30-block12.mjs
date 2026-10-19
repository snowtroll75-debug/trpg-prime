#!/usr/bin/env node
/**
 * verify-ff30-block12 — 3.642.0, Fiends & Fables 3.0 block 12 (the Guardian,
 * Light, Sea and Shade Dragons). R4, coldfire — Graham, 14 October 2026:
 * "Resistance and Immunity should only come into play if the target has both
 * fire and cold. Weakness should apply if the target has either (although
 * only apply once (not both))."
 */
let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const D = await import(new URL("../module/combat/damage.mjs", import.meta.url));
const hit = (o = {}, type = "coldfire") => D.resolveDamagePacket({ amount: 100, type, sourceTraits: ["arcane", "cold", "fire"], ...o }).taken;
const both = (k) => ({ [k]: ["cold", "fire"] });

equal("C1 the rule: immune needs both; resisted needs both (an immunity covers its element); weak needs either",
  [hit(both("immunities")), hit({ immunities: ["fire"] }), hit(both("resistances")), hit({ resistances: ["cold"] }), hit({ immunities: ["cold"], resistances: ["fire"] }), hit({ weaknesses: ["fire"] }), hit({ weaknesses: ["cold"], resistances: ["cold", "fire"] })],
  [0, 100, 50, 100, 50, 150, 75]);
equal("C2 immune to fire alone takes it all, even through the fire trait; immune to both takes none",
  [hit({ immunities: ["fire"], immuneTraits: ["fire"] }), hit({ ...both("immunities"), immuneTraits: ["cold", "fire"] })], [100, 0]);
equal("C3 resistant to one takes it all, even through the trait; to both, half; fire immunity and cold resistance, half",
  [hit({ resistances: ["fire"], resistanceTraits: ["fire"] }), hit({ ...both("resistances"), resistanceTraits: ["cold", "fire"] }), hit({ immunities: ["fire"], resistances: ["cold"] })], [100, 50, 50]);
equal("C4 weak to either, +50%; weak to both, +50% once — not twice", [hit({ weaknesses: ["cold"] }), hit({ ...both("weaknesses"), weaknessTraits: ["cold", "fire"] })], [150, 150]);
equal("C5 plain fire is unchanged, its fire trait included", [hit({ immunities: ["fire"] }, "fire"), hit({ resistances: ["fire"] }, "fire"), hit({ weaknesses: ["fire"] }, "fire"), hit({ immuneTraits: ["fire"] }, "fire")], [0, 50, 150, 0]);
equal("C6 the card says why", [D.resolveDamagePacket({ amount: 100, type: "coldfire", ...both("immunities") }).steps.at(-1), D.resolveDamagePacket({ amount: 100, type: "coldfire", ...both("resistances") }).steps.at(-1), D.resolveDamagePacket({ amount: 100, type: "coldfire", weaknesses: ["fire"] }).steps.at(-1)],
  ["immune to cold and fire — no damage", "resistance to cold and fire halves -> 50", "weakness to cold or fire +50% -> 150"]);

const EXPECTED = 7;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block12: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block12: ${checks} checks — all green.`);
