/**
 * PERILS — Chapter 12, pages 397–400 (3.620.0, block 38; Graham's R17,
 * "your recommendation").
 *
 * "Perils are a type of hazard … traps, environmental hazards and echoes."
 *
 * WHAT A PERIL IS HERE. Graham's ruling of 16 September 2026 stands: "a trap
 * is whatever the GM builds" — an NPC actor. R17 gives that NPC a PERIL
 * section on its GM tab (`system.gm.peril`), holding the stat block's lines
 * that an NPC had no field for: Detection, Disable, the successes needed,
 * Action Type, Trigger, Routine, Reset. A peril is an NPC with the section
 * switched on, or one tagged with the `trap` trait (the tag Trap Finder has
 * always read).
 *
 *   DETECTION   "secretly roll an appropriate detection check against the
 *               peril's Stealth DC for each PC" — or, where the peril
 *               specifies a minimum skill rank, "roll only if a character
 *               is actively engaged in searching … and possesses the
 *               required skill rank or higher". The skill is the GM's
 *               ("usually related to the type of peril"), Perception by
 *               default.
 *   DISABLING   the peril's listed skill (Thievery, Nature or Survival,
 *               Occultism or Religion), or Dispel for a magical one — "a
 *               fumble or blunder on any attempt to disable a peril
 *               triggers it, including when attempting to counteract";
 *               a critical counts as two successes, a heroic as three.
 *   SMASHING    "follows the rules for damaging objects": broken, it "can
 *               no longer be activated, though it remains repairable";
 *               destroyed, "it cannot be repaired". Chapter 6's thresholds
 *               (0 HP; a negative half of its HP). It never dies.
 *   XP          "as for a creature of the same level" — its Effective Level
 *               on the Party sheet's encounter (rewards.mjs).
 *
 * Pure. No Foundry.
 */

import { hasCreatureTrait } from "./creature-traits.mjs";
import { disableProgress } from "./thievery.mjs";
import { itemStatus } from "./items.mjs";
import { levelDC } from "./dice/resolution.mjs";
import { parseSpellDuration } from "./magic/effect-duration.mjs";
import { SKILLS, slugifyKey } from "./config.mjs";
import { perilEffectSpec, perilEffectSummary } from "./peril-effect.mjs";

/** The skills a peril may name for disabling it (page 397). */
const PERIL_DISABLE_SKILLS = Object.freeze(["thievery", "nature", "survival", "occultism", "religion"]);

/** Counteracting a magical peril with Dispel "functions similarly". */
const PERIL_COUNTERACT_SKILL = "powerManipulation";

/**
 * The states a peril can be in. SUPPRESSED and RESOLVED arrived with the
 * haunts (3.629.0; Pillars of Faith, Chapter 8): "a successful Disable check
 * normally suppresses the haunt rather than permanently resolving it", and
 * "a haunt that has been permanently resolved does not Reset".
 */
const PERIL_STATES = Object.freeze(["armed", "triggered", "disabled", "suppressed", "resolved", "broken", "destroyed"]);

/** The states in which a peril does nothing — no trigger, no routine, no further attempt. */
const PERIL_INACTIVE = Object.freeze(["disabled", "suppressed", "resolved", "broken", "destroyed"]);

const whole = (value, floor = 0) => Math.max(floor, Math.floor(Number(value) || 0));

/**
 * The stored Peril section, cleaned up.
 *
 * @param {object} raw `system.gm.peril`
 */
export function normalisePeril(raw = {}) {
  const skills = String(raw?.disableSkills ?? "")
    .split(/[,;/]|\bor\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => PERIL_DISABLE_SKILLS.includes(s));
  return {
    enabled: Boolean(raw?.enabled),
    detectionSkill: String(raw?.detectionSkill ?? "").trim() || "perception",
    detectionDC: whole(raw?.detectionDC),
    minRank: whole(raw?.minRank),
    disableDC: whole(raw?.disableDC),
    disableSkills: [...new Set(skills)],
    // "Three successes are required" in a pasted Disable line counts too.
    successes: Math.max(1, whole(raw?.successes, 1), perilSuccessesIn(raw?.disable)),
    progress: whole(raw?.progress),
    state: PERIL_STATES.includes(raw?.state) ? raw.state : "armed",
    actionType: String(raw?.actionType ?? ""),
    trigger: String(raw?.trigger ?? ""),
    routine: String(raw?.routine ?? ""),
    reset: String(raw?.reset ?? ""),
    // HAUNTS (3.629.0; Pillars of Faith, Chapter 8, Graham's design of 8
    // October 2026). Every field is optional and a peril that sets none of
    // them behaves exactly as it did at 3.620.0.
    //   detection / disable  the stat block's own lines, read by
    //                        perilCheckEntries: several skills, each with
    //                        its own DC ("Religion DC 18 … or Occultism DC 20")
    //   onDisable            "suppressed": a finished Disable suppresses
    //   suppressFor          how long ("24 hours"); blank is until its Reset
    //   suppressedUntil      world time the suppression ends; null, at Reset
    //   counteractLevel/DC   0 = the peril's level and Level DC
    //   anchor / resolution  text; Resolve ends it for good
    //   effectText / effect  what Trigger rolls and applies (peril-effect.mjs)
    //   disableBonuses       situational bonuses offered on a disabling check
    //   spiritPresence       Spirit Sense reveals it at detection
    //   automation           a module's registered peril automation
    detection: String(raw?.detection ?? "").trim(),
    disable: String(raw?.disable ?? "").trim(),
    onDisable: raw?.onDisable === "suppressed" ? "suppressed" : "disabled",
    suppressFor: String(raw?.suppressFor ?? "").trim(),
    suppressedUntil: raw?.suppressedUntil === null || raw?.suppressedUntil === undefined || raw?.suppressedUntil === ""
      || !Number.isFinite(Number(raw?.suppressedUntil)) ? null : Number(raw.suppressedUntil),
    counteractLevel: whole(raw?.counteractLevel),
    counteractDC: whole(raw?.counteractDC),
    anchor: String(raw?.anchor ?? ""),
    resolution: String(raw?.resolution ?? ""),
    effectText: String(raw?.effectText ?? ""),
    effect: raw?.effect && typeof raw.effect === "object" && !Array.isArray(raw.effect) ? raw.effect : null,
    disableBonuses: perilBonusList(raw?.disableBonuses),
    spiritPresence: Boolean(raw?.spiritPresence),
    automation: String(raw?.automation ?? "").trim()
  };
}

/** Bonus types a Disable bonus may name; anything else is circumstance. */
const BONUS_WORDS = Object.freeze(["circumstance", "status", "item", "untyped"]);

/**
 * Situational Disable bonuses: an array of `{value, type, label}`, or the
 * sheet's text — "+2 circumstance: speaking a remembered name; +2
 * circumstance: examined the ledger".
 */
function perilBonusList(raw) {
  const rows = Array.isArray(raw) ? raw : String(raw ?? "").split(";").map((part) => {
    const m = /^\s*([+-]?\d+)\s*(?:([a-z]+)\b)?\s*[:—-]?\s*(.*)$/i.exec(part);
    if (!m) return null;
    const word = String(m[2] ?? "").toLowerCase();
    return { value: Number(m[1]), type: BONUS_WORDS.includes(word) ? word : "circumstance", label: (BONUS_WORDS.includes(word) ? m[3] : `${m[2] ?? ""} ${m[3]}`).trim() };
  });
  return rows.filter((b) => b && Number(b.value))
    .map((b) => ({ value: Math.trunc(Number(b.value)), type: BONUS_WORDS.includes(String(b.type ?? "").toLowerCase()) ? String(b.type).toLowerCase() : "circumstance", label: String(b.label ?? "").trim() || "Situational" }));
}

/**
 * Is this actor a peril? An NPC with the Peril section on, or tagged `trap`.
 *
 * @param {{type?: string, system?: object}} actor
 */
export function isPeril(actor) {
  if (String(actor?.type ?? "") !== "npc") return false;
  if (actor?.system?.gm?.peril?.enabled) return true;
  return hasCreatureTrait(actor?.system ?? {}, "trap");
}

/**
 * May this character find it? See DETECTION above.
 *
 * @param {{minRank: number, searching: boolean, ranks: number}} state
 * @returns {{eligible: boolean, reason: string}}
 */
export function perilDetectionEligible({ minRank = 0, searching = false, ranks = 0 } = {}) {
  const needed = whole(minRank);
  if (!needed) return { eligible: true, reason: "" };
  if (!searching) return { eligible: false, reason: `only found while Searching (Perception ${needed} ranks)` };
  if (whole(ranks) < needed) return { eligible: false, reason: `needs Perception ${needed} ranks to find` };
  return { eligible: true, reason: "" };
}

/**
 * May this skill disable this peril, and at what DC? A peril that lists no
 * skill takes Thievery's Disable Device, the book's default. Dispel always
 * may: "counteracting … functions similarly" — against the Counteract DC of
 * a peril that suppresses (a haunt), the Disable DC of any other.
 *
 * A HAUNT LISTS ANY SKILL, each with its own DC (3.629.0): the Bell That
 * Calls No One takes "Religion DC 18 … or Occultism DC 20", the Last
 * Watchman Diplomacy, the Choir Performance, the Reliquary Spirit Lore — a
 * specialist skill, matched by name ("specialist:spiritLore").
 *
 * @param {object} peril `system.gm.peril`
 * @param {string} skillKey a skill key, "powerManipulation", or "specialist:<slug>"
 * @param {{level?: number}} [about] the peril's level, for its Counteract DC
 * @returns {{ok: boolean, reason: string, dc: number|null}}
 */
export function perilDisableSkillAllowed(peril, skillKey, { level = 0 } = {}) {
  const p = normalisePeril(peril);
  const skill = String(skillKey ?? "");
  if (skill === PERIL_COUNTERACT_SKILL) {
    return { ok: true, reason: "", dc: perilCounteractable(p) ? perilCounteract(p, level).dc : (p.disableDC || null) };
  }
  const entries = perilDisableEntries(p);
  const hit = bestEntryFor(entries, skill);
  if (hit) return { ok: true, reason: "", dc: hit.dc || p.disableDC || null };
  const names = [...new Set(entries.map((e) => e.label))];
  return { ok: false, reason: `this peril is disabled with ${names.join(" or ")}`, dc: null };
}

/* ------------------------------------------------------------------ */
/* The stat block's Detection and Disable lines (3.629.0)               */
/* ------------------------------------------------------------------ */

/** Skill names the book prints that are not a skill's own label. */
const SKILL_ALIASES = Object.freeze({ performance: "perform", "power manipulation": "powerManipulation" });

/** Every core skill's label, longest first so "Sense Motive" wins over nothing shorter. */
const SKILL_NAMES = Object.freeze(Object.entries(SKILLS)
  .map(([key, def]) => [String(def?.label ?? key).toLowerCase(), key])
  .concat(Object.entries(SKILL_ALIASES))
  .sort((a, b) => b[0].length - a[0].length));

const WORD_NUMBERS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });

/**
 * The skills named in one stretch of a stat block line, in order: core
 * skills by label, and any "<Word> Lore" as a specialist skill.
 */
function skillsNamedIn(text) {
  const found = [];
  let rest = ` ${String(text ?? "")} `;
  const lore = /\b([A-Z][A-Za-z'-]*(?:\s[A-Z][A-Za-z'-]*)?\sLore)\b/g;
  for (const m of rest.matchAll(lore)) found.push({ at: m.index, skill: `lore:${slugifyKey(m[1])}`, label: m[1] });
  rest = rest.replace(lore, (m) => " ".repeat(m.length));
  const lowerRest = rest.toLowerCase();
  for (const [name, key] of SKILL_NAMES) {
    const re = new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "g");
    let m;
    while ((m = re.exec(lowerRest)) !== null) {
      const at = m.index + m[1].length;
      if (found.some((f) => at >= f.at && at < f.at + f.label.length)) continue;
      found.push({ at, skill: key, label: SKILLS[key]?.label ?? key });
    }
  }
  return found.sort((a, b) => a.at - b.at).map(({ skill, label }) => ({ skill, label }));
}

/**
 * A Detection or Disable line as `[{skill, label, dc, minRank}]`.
 *
 * Each "DC n" closes a group: the skills named since the last one share
 * it ("Nature, Occultism or Spirit Lore DC 20"), and a ", Rank n" straight
 * after it is that group's minimum rank. Prose between ("to recite the
 * chapel's funerary response or") names no skill and is passed over.
 *
 * @param {string} text
 */
function perilCheckEntries(text) {
  const source = String(text ?? "");
  const out = [];
  const re = /\bDC\s*(\d+)(\s*,\s*Rank\s*(\d+))?/gi;
  let from = 0;
  let m;
  while ((m = re.exec(source)) !== null) {
    const segment = source.slice(from, m.index);
    // Only the clause the DC closes: back to the last sentence or semicolon.
    const clause = segment.split(/[.;]/).pop() ?? segment;
    const named = skillsNamedIn(clause);
    for (const n of named) {
      out.push({ ...n, dc: Number(m[1]), minRank: m[3] ? Number(m[3]) : 0 });
    }
    from = m.index + m[0].length;
  }
  return out;
}

/** The successes a Disable line says it needs ("Three successes are required"), or 0. */
function perilSuccessesIn(text) {
  const m = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+successes\s+(?:are\s+)?(?:required|needed)/i.exec(String(text ?? ""));
  if (!m) return 0;
  return Number(m[1]) || WORD_NUMBERS[m[1].toLowerCase()] || 0;
}

/** Detection as entries: the printed line, or the single legacy skill and DC. */
export function perilDetectionEntries(peril) {
  const p = normalisePeril(peril);
  const parsed = p.detection ? perilCheckEntries(p.detection) : [];
  if (parsed.length) return parsed;
  return [{ skill: p.detectionSkill, label: SKILLS[p.detectionSkill]?.label ?? p.detectionSkill, dc: p.detectionDC, minRank: p.minRank }];
}

/** Disable as entries: the printed line, or the legacy skills at the Disable DC. */
function perilDisableEntries(peril) {
  const p = normalisePeril(peril);
  const parsed = p.disable ? perilCheckEntries(p.disable) : [];
  if (parsed.length) return parsed;
  const skills = p.disableSkills.length ? p.disableSkills : ["thievery"];
  return skills.map((skill) => ({ skill, label: SKILLS[skill]?.label ?? skill, dc: p.disableDC, minRank: 0 }));
}

/**
 * Does a rolled skill answer an entry? A core skill by key; a specialist
 * skill ("specialist:spiritLore") by the slug of the Lore the line named.
 * A duplicate slug from `uniqueKey` ("spiritLore2") still answers.
 */
export function perilEntryMatches(entry, skillKey) {
  const key = String(skillKey ?? "");
  if (!entry) return false;
  if (key.startsWith("specialist:")) {
    const slug = key.slice("specialist:".length);
    return entry.skill.startsWith("lore:") && (slug === entry.skill.slice(5) || new RegExp(`^${entry.skill.slice(5)}\\d*$`).test(slug));
  }
  return entry.skill === key || entry.skill.toLowerCase() === key.toLowerCase();
}

/** The easiest entry a skill answers, or null. */
function bestEntryFor(entries, skillKey) {
  return entries.filter((e) => perilEntryMatches(e, skillKey)).sort((a, b) => a.dc - b.dc)[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Suppression, Counteract, Resolution (3.629.0)                        */
/* ------------------------------------------------------------------ */

/**
 * Is this peril one a Counteract suppresses? A haunt is ("haunts are
 * supernatural effects and can normally be Counteracted"); so is any peril
 * giving a Counteract level or DC of its own.
 */
export function perilCounteractable(peril) {
  const p = normalisePeril(peril);
  return p.onDisable === "suppressed" || p.counteractLevel > 0 || p.counteractDC > 0;
}

/**
 * "If no Counteract entry is given: Counteract Level: the haunt's Level.
 * Counteract DC: the haunt's Level DC."
 */
export function perilCounteract(peril, level = 0) {
  const p = normalisePeril(peril);
  const lvl = p.counteractLevel || whole(level);
  return { level: lvl, dc: p.counteractDC || levelDC(lvl) };
}

/** Seconds of suppression its Disable gives, or null for "until its next Reset". */
function perilSuppressSeconds(peril) {
  const text = normalisePeril(peril).suppressFor;
  if (!text || /reset/i.test(text)) return null;
  const parsed = parseSpellDuration(text);
  return parsed?.seconds ? parsed.seconds : null;
}

/** Has a suppression's clock run out? Never for one that lasts until Reset. */
export function perilRearmDue(peril, now) {
  const p = normalisePeril(peril);
  return p.state === "suppressed" && p.suppressedUntil !== null && Number(now) >= p.suppressedUntil;
}

/**
 * May the peril act — trigger, or use a routine action? "A suppressed haunt
 * remains present but cannot trigger, use reactions, perform its Routine,
 * make attacks, or produce its supernatural effects." A suppression whose
 * clock has run out is armed again (the caller writes it).
 *
 * @returns {{ok: boolean, reason: string, rearm: boolean}}
 */
export function perilCanAct(peril, now = 0) {
  const p = normalisePeril(peril);
  if (perilRearmDue(p, now)) return { ok: true, reason: "", rearm: true };
  const why = {
    disabled: "it is disabled",
    suppressed: p.suppressedUntil === null ? "it is suppressed until its Reset" : "it is suppressed",
    resolved: "it has been resolved and will not return",
    broken: "it is broken",
    destroyed: "it is destroyed"
  };
  if (PERIL_INACTIVE.includes(p.state)) return { ok: false, reason: why[p.state], rearm: false };
  return { ok: true, reason: "", rearm: false };
}

/**
 * The state a Trigger leaves: a simple peril "follows its Reset entry" (so
 * "Reset Immediately" leaves it armed); a complex one stays triggered —
 * manifested — while its Routine runs.
 */
export function perilStateAfterTrigger(peril) {
  const p = normalisePeril(peril);
  if (p.actionType !== "complex" && /^\s*immediately\b/i.test(p.reset)) return "armed";
  return "triggered";
}

/**
 * Can a Strike reach it? "Unless its stat block provides DB, HP … it cannot
 * be directly damaged." An NPC's HP maximum is derived (a Medium one starts
 * at 30), so a haunt says so: the Peril section's "no physical body". A
 * peril whose maximum is 0 has none either.
 */
export function perilHasNoBody(actor) {
  if (!isPeril(actor)) return false;
  if (actor?.system?.gm?.peril?.noBody === true) return true;
  return !(Number(actor?.system?.resources?.hp?.max ?? 0) > 0);
}

/**
 * One disabling attempt against a peril: the successes it banks, and
 * whether it disables or triggers the peril.
 *
 * "A fumble or blunder on a disabling check will trigger the peril." A
 * peril already disabled, suppressed, resolved, broken or destroyed takes
 * nothing further.
 *
 * SUPPRESSION (3.629.0). A peril whose Disable suppresses (a haunt) is
 * suppressed when the last success lands, for its own `suppressFor` — or,
 * on a Counteract, for the counteracting effect's duration — and until its
 * next Reset when there is none. A Counteract is one check: "a successful
 * Counteract normally suppresses", no successes to bank.
 *
 * @param {object} peril `system.gm.peril`
 * @param {string} degree
 * @param {{now?: number, mode?: "disable"|"counteract", seconds?: number|null}} [how]
 * @returns {{progress: number, required: number, earned: number, done: boolean, triggered: boolean, state: string, suppressedUntil: number|null}}
 */
export function perilAfterAttempt(peril, degree, { now = 0, mode = "disable", seconds, force = false } = {}) {
  const p = normalisePeril(peril);
  if (PERIL_INACTIVE.includes(p.state)) {
    return { progress: p.progress, required: p.successes, earned: 0, done: p.state === "disabled" || p.state === "suppressed", triggered: false, state: p.state, suppressedUntil: p.suppressedUntil };
  }
  const key = String(degree ?? "");
  if (key === "fumble" || key === "blunder") {
    return { progress: p.progress, required: p.successes, earned: 0, done: false, triggered: true, state: "triggered", suppressedUntil: p.suppressedUntil };
  }
  const counteract = mode === "counteract" && perilCounteractable(p);
  const step = counteract
    ? { banked: p.progress, required: p.successes, earned: 0, done: force || ["heroic", "critical", "success"].includes(key) }
    : disableProgress(p.progress, p.successes, key);
  const suppresses = counteract || p.onDisable === "suppressed";
  const span = seconds !== undefined ? seconds : perilSuppressSeconds(p);
  return {
    progress: step.done && suppresses ? 0 : step.banked,
    required: step.required,
    earned: step.earned,
    done: step.done,
    triggered: false,
    state: step.done ? (suppresses ? "suppressed" : "disabled") : p.state,
    suppressedUntil: step.done && suppresses ? (Number(span) > 0 ? Number(now) + Number(span) : null) : p.suppressedUntil
  };
}

/**
 * What damage leaves a peril: Chapter 6's object states (itemStatus).
 *
 * @returns {"armed"|"broken"|"destroyed"} the damage state (armed while it has HP)
 */
export function perilDamageState(hp, max) {
  const status = itemStatus(hp, max);
  if (status === "broken" || status === "destroyed") return status;
  return "armed";
}

/** "24 hours", "90 minutes", "2 days" — a span of game time as a GM reads it (3.629.1). */
function spanText(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (s >= 172800 && s % 86400 === 0) return plural(s / 86400, "day");
  if (s >= 3600 && s % 3600 === 0) return plural(s / 3600, "hour");
  if (s >= 3600) return `${plural(Math.floor(s / 3600), "hour")} ${plural(Math.ceil((s % 3600) / 60), "minute")}`;
  return plural(Math.max(1, Math.ceil(s / 60)), "minute");
}

/**
 * What the sheet shows under the Peril section (3.629.0): how the printed
 * Detection and Disable lines were read, what Trigger will apply, and how
 * long a suppression has left — so a GM sees the reading before the table
 * does.
 *
 * @param {{system?: object}} actor
 * @param {number} now world time
 * @returns {{entries: string, effect: string, suppressed: string}}
 */
export function perilSheetView(actor, now = 0) {
  const p = normalisePeril(actor?.system?.gm?.peril);
  const level = whole(actor?.system?.identity?.level);
  const say = (list) => list.map((e) => `${e.label} DC ${e.dc}${e.minRank ? ` (rank ${e.minRank})` : ""}`).join(", ");
  const parts = [];
  if (p.detection) parts.push(`Detection read as: ${say(perilDetectionEntries(p)) || "nothing — check the line"}.`);
  if (p.disable) parts.push(`Disable read as: ${say(perilDisableEntries(p)) || "nothing — check the line"}${p.successes > 1 ? `; ${p.successes} successes` : ""}.`);
  if (perilCounteractable(p)) { const c = perilCounteract(p, level); parts.push(`Counteract: level ${c.level}, DC ${c.dc}.`); }
  const spec = perilEffectSpec(p.effect, p.effectText);
  let suppressed = "";
  if (p.state === "suppressed") {
    suppressed = p.suppressedUntil === null ? "Suppressed until its next Reset." : (Number(now) >= p.suppressedUntil
      ? "Suppression has run out — it re-arms when game time next moves, or when it would act."
      : `Suppressed for another ${spanText(p.suppressedUntil - Number(now))} of game time.`);
  }
  return { entries: parts.join(" "), effect: spec ? perilEffectSummary(spec, { dc: spec.dc ?? levelDC(level) }) : "", suppressed };
}
