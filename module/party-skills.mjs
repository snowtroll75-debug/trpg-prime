/**
 * THE PARTY SKILLS PAGE AND THE GROUP CHECK (3.712.0, Party Sheet V2
 * Stage 5).
 *
 * NO NEW ARITHMETIC. A member's skill modifier is the prepared
 * `system.skills.<key>.total`: the number the character sheet prints beside
 * the skill, built by the actor's own preparation (ranks, the attribute,
 * class, racial, item, status and other bonuses, conditions). Clicking it
 * runs the member's own skill roll, the character sheet's `rollSkill`. A
 * Group Check rolls each member through `TRGCheck.roll` with no modifiers of
 * its own, so the roll takes the member's own rows (`withCheckModifiers`)
 * and the automatic conditionals, as every other skill check does.
 *
 * NO GROUP RULE IS INVENTED. Neither the rulebook nor the automation has a
 * rule for a group's success (searched 23 Nov 2026: no group-check rule, only
 * Aid Another, which is its own action). So a Group Check reports each
 * member's result and how many reached each degree, and says nothing about
 * whether "the group" succeeded.
 */

import { SKILLS } from "./config.mjs";
import { DIFFICULTIES, DIFFICULTY_BY_KEY } from "./dice/resolution.mjs";

const str = (value) => String(value ?? "").trim();

/** The columns: the core skills, in the order the rules list them. */
export function skillColumns() {
  return Object.entries(SKILLS).map(([key, def]) => ({ key, label: def.label, ability: def.ability }));
}

/**
 * One member's cell for one skill.
 *
 *   ok           the member has the skill; `value` is its prepared total
 *                (0 is a real modifier, and shows as +0)
 *   hidden       this user may not see the member's statistics (Graham's
 *                NPC ruling, Stage 1): no number is given out
 *   unavailable  the member has no such skill in its data (a creature built
 *                without the skill list, or a skill its data lacks)
 */
export function skillCell(actor, key, { restricted = false } = {}) {
  if (restricted) return { key, state: "hidden", value: null };
  const skill = actor?.system?.skills?.[key];
  const total = Number(skill?.total);
  if (!skill || !Number.isFinite(total)) return { key, state: "unavailable", value: null };
  return { key, state: "ok", value: total };
}

/**
 * The matrix: members in rows, skills in columns, the best visible value in
 * each column marked (every member who shares it, so a tie is not hidden).
 *
 * @param {Array<{uuid: string, name: string, img?: string, actor: object, restricted?: boolean, canRoll?: boolean}>} members
 * @param {{sort?: "asc"|"desc"}} [options]
 */
export function skillMatrix(members = [], { sort = "asc" } = {}) {
  const columns = skillColumns();
  const rows = members.map((m) => ({
    uuid: m.uuid,
    name: str(m.name) || "(unnamed)",
    img: m.img ?? null,
    restricted: Boolean(m.restricted),
    canRoll: Boolean(m.canRoll) && !m.restricted,
    cells: columns.map((c) => skillCell(m.actor, c.key, { restricted: m.restricted }))
  }));
  for (const [i, column] of columns.entries()) {
    const values = rows.map((r) => r.cells[i]).filter((cell) => cell.state === "ok").map((cell) => cell.value);
    column.best = values.length ? Math.max(...values) : null;
    for (const row of rows) {
      const cell = row.cells[i];
      cell.best = cell.state === "ok" && values.length > 1 && cell.value === column.best;
      cell.text = cell.state === "ok" ? (cell.value >= 0 ? `+${cell.value}` : String(cell.value)) : cell.state === "hidden" ? "?" : "—";
      cell.rollable = row.canRoll && cell.state === "ok";
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) * (sort === "desc" ? -1 : 1));
  return { columns, rows, sort };
}

/** Does a skill column pass the page's filter text? Label or key, any case. */
export function matchesSkillFilter(column, text = "") {
  const needle = str(text).toLowerCase();
  return !needle || str(column?.label).toLowerCase().includes(needle) || str(column?.key).toLowerCase().includes(needle);
}

/* ------------------------------------------------------------------ */
/* The Group Check                                                     */
/* ------------------------------------------------------------------ */

/**
 * What a Group Check asks for, cleaned and checked. Every choice is one
 * the ordinary check already offers: the skill, a DC (none is allowed, as
 * on any check), the difficulty ladder and the chat visibility.
 */
export function planGroupCheck({ skill, members = [], dc = null, difficulty = "medium", rollMode = "" } = {}) {
  const key = str(skill);
  if (!SKILLS[key]) return { ok: false, reason: "choose a skill" };
  const seen = new Set();
  const actors = members.filter((a) => a?.uuid && !seen.has(a.uuid) && seen.add(a.uuid));
  if (!actors.length) return { ok: false, reason: "choose at least one member" };
  const rawDC = str(dc);
  const n = rawDC === "" ? null : Math.floor(Number(rawDC));
  if (rawDC !== "" && !Number.isFinite(n)) return { ok: false, reason: "the DC must be a number" };
  const level = DIFFICULTY_BY_KEY[difficulty] ? difficulty : "medium";
  return { ok: true, skill: key, label: SKILLS[key].label, actors, dc: n, difficulty: level, rollMode: str(rollMode) };
}

/**
 * The summary: each member's total and degree, and how many reached each
 * degree. No collective result: the rules give none.
 *
 * @param {Array<{name: string, total: number|null, degree: {key: string, label: string}|null, skipped?: string}>} results
 */
export function groupCheckSummary(results = [], { dc = null, difficulty = "medium" } = {}) {
  const lines = results.map((r) => ({
    name: str(r.name),
    total: Number.isFinite(Number(r.total)) && r.total !== null ? Number(r.total) : null,
    degree: r.degree?.label ?? null,
    degreeKey: r.degree?.key ?? null,
    skipped: r.skipped ?? null
  }));
  const counts = new Map();
  for (const line of lines) if (line.degree) counts.set(line.degree, (counts.get(line.degree) ?? 0) + 1);
  const level = DIFFICULTY_BY_KEY[difficulty];
  return {
    lines,
    counts: [...counts].map(([label, count]) => ({ label, count })),
    // The DC as set, and what each roll was checked against (3.712.1, found
    // live: "DC 15 (Hard (DC +2))" left the 17 to arithmetic).
    dcText: dc === null ? "No DC set" : `DC ${dc}${level && difficulty !== "medium" && !level.auto ? `, ${level.label}: ${dc + Number(level.modifier ?? 0)}` : level?.auto ? `, ${level.label}` : ""}`,
    rolled: lines.filter((l) => l.total !== null).length
  };
}

/** The Group Check card. Escaped: names are typed by people. */
export function groupCheckCard({ partyName, label, summary }) {
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rows = summary.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.total === null ? "—" : l.total}</td><td>${l.skipped ? esc(l.skipped) : esc(l.degree ?? "")}</td></tr>`).join("");
  const counts = summary.counts.length
    ? `<p style="margin:2px 0">${summary.counts.map((c) => `${c.count} ${esc(c.label)}`).join(" · ")}</p>`
    : "";
  return `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
    + `<span class="check-actor">${esc(partyName)}</span><h3>Group Check: ${esc(label)}</h3></div></header>`
    + `<p class="hint" style="margin:2px 0">${esc(summary.dcText)}. Each member rolled their own check; the rules set no group result.</p>`
    + `<table class="party-loot-table"><thead><tr><th>Member</th><th>Total</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`
    + counts + `</div>`;
}

/**
 * Roll a Group Check: each chosen member's own skill check, one after
 * another, then the summary card in the same visibility.
 *
 * @param {object} plan from planGroupCheck
 * @param {object} deps
 * @param {(config: object) => Promise<object>} deps.roll       TRGCheck.roll
 * @param {(content: string, rollMode: string) => Promise<any>} deps.post
 * @param {string} deps.partyName
 * @param {boolean} [deps.offerConditionals]
 */
export async function rollGroupCheck(plan, deps) {
  const results = [];
  for (const actor of plan.actors) {
    if (!actor?.system?.skills?.[plan.skill]) {
      results.push({ name: actor?.name, total: null, degree: null, skipped: "has no such skill" });
      continue;
    }
    try {
      // NO MODIFIERS OF ITS OWN: TRGCheck.roll gives a skill check the
      // member's own rows, and applies the automatic conditionals.
      const check = await deps.roll({
        actor,
        label: `${plan.label} Check`,
        subtitle: `Group Check — ${deps.partyName}`,
        type: "skill",
        subject: plan.skill,
        dc: plan.dc,
        difficulty: plan.difficulty,
        rollMode: plan.rollMode || undefined,
        offerConditionals: deps.offerConditionals !== false,
        toMessage: true
      });
      results.push({ name: actor.name, total: check?.outcome?.total ?? null, degree: check?.outcome?.degree ?? null });
    } catch (error) {
      console.error("TRG Prime | group check", error);
      results.push({ name: actor.name, total: null, degree: null, skipped: "the roll failed" });
    }
  }
  const summary = groupCheckSummary(results, plan);
  await deps.post(groupCheckCard({ partyName: deps.partyName, label: plan.label, summary }), plan.rollMode);
  return { results, summary };
}

/** The difficulty choices, as the check dialog offers them. */
export function difficultyOptions(selected = "medium") {
  return DIFFICULTIES.map((d) => ({ key: d.key, label: d.label, selected: d.key === selected }));
}
