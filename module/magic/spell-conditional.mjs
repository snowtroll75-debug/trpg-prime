/**
 * ADVANTAGE, SCOPED TO SOMETHING — as a spell effect.
 *
 * NEW at 3.497.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SHAPE FOUR SPELLS WERE ALL WAITING FOR.
 *
 *   SPIRIT OF THE HUNT (PP 1)   advantage on Search (Perception)
 *       +2 PP: also on Track (Survival)
 *   COURAGE (PP 6)              advantage on saves against Fear
 *   FLAWLESS LIES (PP 8)        advantage on Bluff (Deception)
 *   CANCEL MAGIC (PP 2)         advantage on saves against one chosen
 *                               tradition; +2 PP: a second one
 *
 * All four shipped as prose — three as a `note` and one carrying nothing
 * at all — and all four say the same mechanical thing: advantage, narrowed
 * to a named slice of the character's rolls.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTHING NEW HAD TO BE INVENTED, and that is the point of this module.
 *
 * `module/conditionals.mjs` already holds exactly this rule — "a bonus
 * that is PERMANENT but SCOPED" — with eight scope axes, a dialog that
 * offers what it cannot settle and pre-ticks what it can, and a
 * collector that reads BOTH items and `actor.appliedEffects`. That second
 * home is what makes a spell able to grant one: an ActiveEffect carrying
 * `flags["trg-prime"].conditionals` is picked up at every check with no
 * further plumbing.
 *
 * So this module does one job: turn a declared spell row into entries
 * that module will accept, and refuse — loudly, at cast time — anything
 * it would have dropped in silence at roll time.
 *
 * THE VALIDATION RUNS THROUGH `normaliseConditional` ITSELF rather than a
 * second copy of its rules. A row that passes here is a row that will
 * survive collection, because the same function decided both. The
 * alternative is two validators that agree until somebody edits one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO WARP SHAPES, BOTH GENERIC ON PURPOSE.
 *
 *   `extraConditionals` — a COUNT of further grants unlocked from the
 *     row's own `warpGrants` list, in order. Spirit Of The Hunt's Track
 *     warp is the first user; the mechanism is not named after it.
 *
 *   `extraTraditions` — a COUNT of additional traditions a caster may
 *     name. Cancel Magic's is the first, and its own sentence ("select
 *     ONE of the four magical traditions") is why the traditions are
 *     asked for rather than authored.
 *
 * A spell-specific boolean per warp was the obvious alternative and was
 * rejected: `huntTrack: true` in the shared warp aggregate is a key that
 * means nothing to any other spell and cannot be reused by the next one.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** The four traditions a caster may name. */
export const TRADITIONS = Object.freeze(["arcane", "divinity", "ethereal", "verdant"]);

/*
 * `bonusType` IS WHAT A SPELL EFFECT ROW SPELLS IT; `type` IS WHAT A
 * CONDITIONAL SPELLS IT. Found live at 3.504.0, 6 Sep 2026.
 *
 * Every other spell effect family — `bonus`, `heldBonus` — names a bonus
 * type in `bonusType`, so the seven conditionals authored in that release
 * did too. `normaliseConditional` reads `raw.type` and defaults to
 * "circumstance", so all seven silently became circumstance bonuses: five
 * of them print STATUS, which is a different stacking rule, on a card
 * that showed the right number and the wrong kind. Nothing failed; the
 * bonuses simply stacked with the wrong things.
 *
 * The alias lives HERE, in the spell→conditional adapter, rather than in
 * `conditionals.mjs`, because an item's conditionals have always spelled
 * it `type` and there is no reason to teach that file a second name. An
 * explicit `type` still wins, so a row may spell either.
 */
function withBonusType(grant) {
  if (!grant || typeof grant !== "object") return grant;
  if (grant.type !== undefined || grant.bonusType === undefined) return grant;
  return { ...grant, type: grant.bonusType };
}

/**
 * A conditional-granting row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @param {(entry: object, source: object, index: number) => object|null} validate
 *   `normaliseConditional`, injected so this module stays pure and the
 *   check harness can prove the same function decides both ends
 */
export function normaliseSpellConditional(raw, validate) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "conditional") return null;
  if (typeof validate !== "function") return null;

  const label = text(raw.label) || "Spell";
  const source = { id: "spell", name: label, kind: "effect" };

  // GRANTS ARE VALIDATED BY THE COLLECTOR'S OWN FUNCTION. Anything it
  // would drop is dropped here instead, where a check can see it.
  const grants = (Array.isArray(raw.grants) ? raw.grants : [])
    .map((g, i) => validate(withBonusType(g), source, i))
    .filter(Boolean);
  const warpGrants = (Array.isArray(raw.warpGrants) ? raw.warpGrants : [])
    .map((g, i) => validate(withBonusType(g), source, 100 + i))
    .filter(Boolean);

  // A ROW THAT GRANTS NOTHING IS NOT A SPELL. Refused rather than
  // applied as an empty effect, which is the shape a note already was.
  if (!grants.length && !warpGrants.length && !raw.traditions) return null;

  return {
    label,
    grants,
    warpGrants,
    // HOW MANY TRADITIONS THE CASTER NAMES, or 0 for a spell that names
    // none. Declared rather than inferred from the presence of a prompt,
    // so a data row says what it wants and the workflow obeys it.
    traditions: Math.max(0, int(raw.traditions)),
    // What a named tradition grants, once the caster has chosen. Only
    // meaningful when `traditions` is non-zero.
    traditionGrant: raw.traditionGrant && typeof raw.traditionGrant === "object"
      ? { ...raw.traditionGrant }
      : null
  };
}

/**
 * The grants this casting actually confers, warps folded in.
 *
 * @param {object} spec a `normaliseSpellConditional` result
 * @param {object} warpMods the aggregated warp mods
 */
/**
 * The grants this casting actually confers, with a warped value folded in.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (3.504.0). `grantsFor` reads `extraConditionals` and
 * nothing else, so a conditional's NUMBER could not be warped — and the
 * PP 2 bonus batch is full of spells whose "+1 PP: increase the bonus by
 * +1" warps are ALREADY LIVE on `bonusValue`/`bonusMax`. Authoring Jump,
 * Spot, Heightened Awareness and Prescience as conditionals without this
 * would have made five working warps inert: the 3.499.1 phantom-key
 * defect recreated from the other direction, by a release whose whole
 * point was to make spells do what they print.
 *
 * `warpValue` IS INJECTED, the shape `normaliseSpellConditional` already
 * uses for its validator: `warpedBonusValue` lives in spell-warp.mjs
 * where the cap arithmetic belongs, and this file stays pure and
 * driveable without importing it.
 *
 * ONLY A MODIFIER HAS A NUMBER. An advantage grant has nothing to raise,
 * so it passes through untouched rather than growing a meaningless
 * `value`.
 *
 * @param {object} spec the normalised row
 * @param {object} warpMods the aggregated warp mods
 * @param {(base: number, added: number, cap: number|null) => number} warpValue
 */
export function warpedGrants(spec, warpMods = {}, warpValue = null) {
  const granted = grantsFor(spec, warpMods);
  const added = Math.max(0, int(warpMods?.bonusValue));
  if (!added || typeof warpValue !== "function") return granted;
  return granted.map((g) => (String(g?.kind) !== "modifier"
    ? g
    : { ...g, value: warpValue(Number(g.value) || 0, added, warpMods?.bonusMax ?? null) }));
}

export function grantsFor(spec, warpMods = {}) {
  const extra = Math.max(0, int(warpMods?.extraConditionals));
  // SLICED, NOT REPEATED. `extraConditionals: 2` unlocks the first two
  // declared alternates; a caster cannot buy the same one twice, because
  // the list is what is on offer rather than a multiplier.
  return [...spec.grants, ...spec.warpGrants.slice(0, extra)];
}

/** How many traditions this casting may name, warps folded in. */
export function traditionCount(spec, warpMods = {}) {
  if (!spec?.traditions) return 0;
  return spec.traditions + Math.max(0, int(warpMods?.extraTraditions));
}

/**
 * The conditional a chosen tradition becomes.
 *
 * ONE ENTRY PER TRADITION rather than one entry listing them all. The
 * `traditions` axis is an any-of list, so a single entry would work — but
 * the dialog shows one row per entry, and a caster who warded against two
 * traditions should see two rows saying which. The scope wording is what
 * a player reads when deciding whether the row applies.
 */
export function traditionConditional(spec, tradition, index, validate) {
  const named = text(tradition).toLowerCase();
  if (!TRADITIONS.includes(named)) return null;
  const base = spec?.traditionGrant ?? {};
  return validate({
    ...base,
    kind: text(base.kind) || "advantage",
    scope: `saving throws against ${named} magic`,
    when: { ...(base.when ?? {}), checkTypes: ["save"], traditions: [named] },
    auto: true
  }, { id: "spell", name: spec?.label ?? "Spell", kind: "effect" }, 200 + index);
}

/** What the card says when the advantage lands. */
export function conditionalLine(targetName, grants) {
  // THE CARD SAID "ADVANTAGE" FOR A +4. Found live at 3.504.0, 6 Sep
  // 2026, on Jump's own card: "Keldran Greytrail: advantage on High Jump
  // and Long Jump", for a grant that is a +4 status modifier and confers
  // no advantage at all.
  //
  // The sentence was written when every conditional in the pack WAS an
  // advantage, and stayed true for exactly as long as that was so. Seven
  // modifier conditionals later it was telling the table the wrong rule
  // on every card — and the check that covered it asserted only that the
  // SCOPE TEXT appeared in the sentence, which it still did.
  //
  // So the verb is derived from the grant now, and a row that grants both
  // says both rather than picking one.
  const rows = Array.isArray(grants) ? grants.filter((g) => g?.scope) : [];
  if (!rows.length) return `<strong>${targetName}</strong>: advantage on the scoped rolls.`;

  const clauses = [];
  const mods = rows.filter((g) => String(g.kind) === "modifier");
  const others = rows.filter((g) => String(g.kind) !== "modifier");
  for (const g of mods) {
    const n = Number(g.value) || 0;
    const type = g.type ? ` ${g.type}` : "";
    clauses.push(`${n >= 0 ? "+" : ""}${n}${type} to ${g.scope}`);
  }
  // AND DISADVANTAGE IS NOT ADVANTAGE (3.609.1, F6): Twisted Fate is the
  // first conditional to hand a creature disadvantage, and its card said
  // "advantage on all checks".
  const ahead = others.filter((g) => String(g.kind) !== "disadvantage");
  const behind = others.filter((g) => String(g.kind) === "disadvantage");
  if (ahead.length) clauses.push(`advantage on ${ahead.map((g) => g.scope).join("; ")}`);
  if (behind.length) clauses.push(`disadvantage on ${behind.map((g) => g.scope).join("; ")}`);
  return `<strong>${targetName}</strong>: ${clauses.join("; ")}.`;
}

/** What the card says when a tradition was warded against. */
export function traditionLine(targetName, traditions) {
  const named = traditions.map((t) => `<strong>${t}</strong>`).join(" and ");
  return `${targetName} makes saving throws against ${named} magic with advantage.`;
}

/**
 * What the card says when the warp bought more than was chosen.
 *
 * SAID OUT LOUD, the rule Gravity Weapon's shortfall line records: a
 * caster who paid 2 PP for a second tradition and named one has no other
 * way to find out.
 */
export function traditionShortfallLine(spec, wanted, chosen) {
  if (chosen >= wanted) return null;
  return `<em>${spec.label} was paid for ${wanted} traditions and `
    + `${chosen === 0 ? "none was" : `only ${chosen} was`} named.</em>`;
}

/**
 * The clause this family hands to the table.
 *
 * WHY IT IS SAID AT ALL: a conditional is offered in the roll dialog,
 * and a player who never opens one — a save forced by a spell, a check
 * rolled from a chat card — should still know the bonus is theirs. The
 * entries that CAN be settled by the check itself arrive pre-ticked,
 * which is most of these; this line is for the rest.
 *
 * AND IT SAID "THE ADVANTAGE" TOO. Found live at 3.505.0, 6 Sep 2026,
 * one line below the sentence 3.505.0 was released to fix: Jump's card
 * read "+4 status to High Jump and Long Jump" and then, immediately
 * beneath it, "The advantage is offered on the rolls it covers".
 *
 * I fixed the grant sentence and walked past the sentence under it. The
 * word is neutral now, so no third spelling of this can go wrong.
 */
export function conditionalRemainderLine() {
  return "<em>This is offered on the rolls it covers, ticked in advance where the "
    + "check itself settles the scope. Where a roll is made outside a dialog, apply it by hand.</em>";
}
