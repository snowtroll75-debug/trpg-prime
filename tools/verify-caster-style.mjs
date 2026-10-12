#!/usr/bin/env node
/**
 * verify-caster-style — can a feat make you an instinctive caster?
 *
 * NEW at 3.547.0, beside the rule.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * Graham, 10 Sep 2026: Enigma "is not working as described."
 *
 * Enigma promises four things. Measured on a level-12 Wizard holding the
 * feat, exactly one of them happened:
 *
 *   "an additional 2 PP per level"        WORKED  (base 36 vs 12)
 *   "You are an Instinctive caster"       casterStyle was `learned`
 *   "do not have to memorise your spells" memorisationStyle was `book`
 *   the whole repertoire                  unreachable
 *
 * THE CAUSE WAS A COMMENT, NOT A CALCULATION. `documents/actor.mjs`
 * said the style was "fixed by the class ... because no rule lets a
 * character change style within a class", and Enigma — already in the
 * pack when that sentence was written — is such a rule. The line under
 * the comment read the class and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * D3 IS THE CHECK THAT WOULD HAVE CAUGHT IT, and it is not about
 * Enigma. It walks the FEATS PACK and asserts that every feat whose
 * printed text claims a caster style actually declares one — the
 * text-versus-mechanism question that this whole class of defect lives
 * in. Naming Enigma alone would have let the next such archetype ship
 * inert exactly the same way.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  declaredCasterStyle, resolveCasterStyle, resolveMemorisationStyle,
  isInstinctiveCaster, CASTER_STYLES
} from "../module/magic/caster-style.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

async function readPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const out = [];
  // ONLY THE DOCUMENTS. The pack also stores embedded ActiveEffects under
  // an `!items.effects!` prefix, and they carry a `name` too — counting
  // them made a probe report 312 "duplicate" feats that do not exist.
  for await (const [key, v] of db.iterator()) {
    if (!key.startsWith("!items!")) continue;
    if (v?.name) out.push(v);
  }
  await db.close();
  return out;
}

const WIZARD = [{ type: "class", name: "Wizard", system: { casterStyle: "learned" } }];
const ENIGMA = { type: "feat", name: "Enigma", system: { casterStyle: "instinctive" } };

/* ── D: THE DECLARATION ───────────────────────────────────────────── */

equal("D1 A FEAT MAY DECLARE THE STYLE",
  declaredCasterStyle([...WIZARD, ENIGMA]), "instinctive",
  "Enigma: \"You are an Instinctive caster\" — before 3.547.0 nothing read this");

equal("D1b AND A SHEET WITHOUT ONE DECLARES NOTHING",
  declaredCasterStyle(WIZARD), null,
  "WITHOUT THIS, D1 passes on a function that answers \"instinctive\" for everyone");

equal("D1c A CLASS IS NOT AN OVERRIDE",
  declaredCasterStyle([{ type: "class", name: "Bard", system: { casterStyle: "instinctive" } }]),
  null,
  "the class's style is the baseline and arrives through progression; reading it here too "
  + "would let the baseline race itself depending on item order");

equal("D1d AND A NONSENSE VALUE IS IGNORED",
  declaredCasterStyle([{ type: "feat", system: { casterStyle: "vibes" } }]), null,
  `only ${CASTER_STYLES.join("/")} are styles`);

/* ── R: WHAT THE CHARACTER ENDS UP WITH ───────────────────────────── */

equal("R1 THE WIZARD WITH ENIGMA CASTS INSTINCTIVELY",
  resolveCasterStyle("learned", [...WIZARD, ENIGMA]), "instinctive",
  "the defect itself: this answered \"learned\"");

equal("R1b THE WIZARD WITHOUT IT STILL CASTS LEARNED",
  resolveCasterStyle("learned", WIZARD), "learned",
  "WITHOUT THIS, R1 passes on an override that fires for every caster in the game");

equal("R2 AND MEMORISES NOTHING",
  resolveMemorisationStyle("book", "instinctive"), "",
  "\"do not have to memorise your spells during daily preparation\" — derived from the "
  + "style rather than stored twice, because two fields that must agree will disagree");

equal("R2b WHILE AN ORDINARY WIZARD KEEPS THE SPELLBOOK",
  resolveMemorisationStyle("book", "learned"), "book");
equal("R2c AND A CLERIC KEEPS THE LIST",
  resolveMemorisationStyle("list", "learned"), "list",
  "the two learned shapes must stay distinguishable");

ok("R3 THE PREDICATE AGREES WITH THE RESOLVER",
  isInstinctiveCaster(resolveCasterStyle("learned", [...WIZARD, ENIGMA]))
  && !isInstinctiveCaster(resolveCasterStyle("learned", WIZARD)),
  "the Magic tab, the memorisation workflow and the repertoire card all ask this one "
  + "question, and must not be able to disagree about it");

/* ── P: THE PACK ──────────────────────────────────────────────────── */

const feats = await readPack("feats");
const enigma = feats.find((f) => f.name === "Enigma");

ok("P1 THERE IS EXACTLY ONE ENIGMA",
  feats.filter((f) => f.name === "Enigma").length === 1,
  "a duplicate would mean a data fix reached only one of them");

equal("P2 AND IT DECLARES THE STYLE ITS TEXT CLAIMS",
  String(enigma?.system?.casterStyle ?? ""), "instinctive",
  "the data half of this repair — see tools/data-fixes.json#enigma-instinctive-caster");

/* P3 IS THE GENERAL FORM OF THE DEFECT.
 *
 * Any feat whose printed text says it makes you an instinctive caster
 * must declare it, or it is inert in exactly the way Enigma was. This is
 * the check that catches the NEXT one rather than this one. */
/* THE FIRST PATTERN WAS `/instinctive caster/i` AND IT WAS WRONG.
 *
 * It flagged Magical Discovery, whose text reads "IF you are an
 * instinctive caster, you may learn an additional spell" — a feat that
 * READS the style, not one that grants it. A check cannot tell a
 * declaration from a condition by looking for the noun, so it looks for
 * the sentence Enigma actually uses and excludes the conditional. */
const CLAIMS_INSTINCTIVE = /(?<!\bif\s)you are an instinctive caster/i;
const claimants = feats.filter((f) =>
  CLAIMS_INSTINCTIVE.test(String(f.system?.description ?? "")));
const silent = claimants
  .filter((f) => String(f.system?.casterStyle ?? "").trim().toLowerCase() !== "instinctive")
  .map((f) => f.name);

ok("P3 EVERY FEAT CLAIMING TO MAKE YOU INSTINCTIVE DECLARES IT",
  silent.length === 0,
  `these say it in their text and declare nothing: ${JSON.stringify(silent)}`);

ok("P3b AND AT LEAST ONE FEAT MAKES THE CLAIM",
  claimants.length > 0,
  "WITHOUT THIS, P3 passes by finding nothing — the empty-search failure this harness "
  + "has recorded more than once");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-caster-style: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-caster-style: OK — ${checks} checks. A feat can make you an `
  + `instinctive caster, and one that says so in its text has to declare it.\n`);
