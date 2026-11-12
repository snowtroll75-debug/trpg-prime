#!/usr/bin/env node
/**
 * mutate-ea-block3b-core — the mutation half of verify-ea-block3b-core.
 * NEW at 3.681.0. Each mutation breaks one reading or one wire of the
 * reaction seams; verify-ea-block3b-core must fail on every one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = m("module-api.mjs"), APW = m("module-api-workflow.mjs"), RX = m("reactions", "reactions.mjs"), RW = m("reactions", "reactions-workflow.mjs"),
  ASK = m("reactions", "reaction-ask-workflow.mjs"), GD = m("combat", "granted-defences.mjs"), CT = m("creature-traits.mjs"), DMG = m("combat", "damage.mjs"),
  DW = m("combat", "damage-workflow.mjs"), DY = m("combat", "dying-workflow.mjs"), CHK = m("dice", "check.mjs"), CARD = m("dice", "check-card-interactions.mjs"),
  ATK = m("combat", "attack-workflow.mjs"), RR = m("combat", "attack-reroll-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs"), SE = m("magic", "spell-effects.mjs"),
  ACT = m("combat", "action-workflow.mjs"), SRS = m("magic", "save-reaction-spells-workflow.mjs"),
  BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");

const MUTATIONS = [
  // R — the registries
  { name: "a check reaction with neither half is kept", file: API, from: "  if (!k || (!before && !after)) { problem(`registerCheckReaction", to: "  if (!k) { problem(`registerCheckReaction", breaks: "R1" },
  { name: "a damage reaction without a function is kept", file: API, from: "  if (!k || typeof offer !== \"function\") { problem(`registerDamageReaction", to: "  if (!k) { problem(`registerDamageReaction", breaks: "R4" },
  { name: "a step is not found by its name", file: API, from: "  return registry.reactionSteps.get(registryKey(name)) ?? null;", to: "  return registry.reactionSteps.get(String(name)) ?? null;", breaks: "R6" },
  { name: "a refused critical reaction says nothing", file: API, from: "  if (!k || (!before && !after)) { problem(`registerCriticalReaction: \"${key}\" needs a key and an offer(ctx) function (or { before, after })`); return false; }", to: "  if (!k || (!before && !after)) { return false; }", breaks: "R7" },
  // P — the readings
  { name: "Q26: a Partial succeeds", file: RX, from: "    succeeded: [\"heroic\", \"critical\", \"success\"].includes(key),", to: "    succeeded: [\"heroic\", \"critical\", \"success\", \"partial\"].includes(key),", breaks: "P1/C11" },
  { name: "Q26: a Partial fails", file: RX, from: "    failed: [\"failure\", \"fumble\", \"blunder\"].includes(key)", to: "    failed: [\"partial\", \"failure\", \"fumble\", \"blunder\"].includes(key)", breaks: "P1/C11" },
  { name: "a spell attack's casting check is not an attack", file: RX, from: "  if (as === \"attack\") return \"attack\";", to: "", breaks: "P2/C5" },
  { name: "a casting check is met as a skill check", file: RX, from: "  return [\"attack\", \"save\", \"skill\"].includes(type) ? type : \"\";", to: "  return [\"attack\", \"save\", \"skill\", \"spellcraft\"].includes(type) ? type : \"\";", breaks: "P2/C4/C14" },
  { name: "a deadly critical's advantage is overwritten", file: RX, from: "  return bias === \"advantage\" ? \"normal\" : \"disadvantage\";", to: "  return \"disadvantage\";", breaks: "P3/K2" },
  { name: "Q27: the first roll's Conviction die is kept", file: RX, from: "  return Array.from(modifiers ?? []).filter((m) => !/^Conviction \\(\\+1d6/.test(String(m?.label ?? \"\")));", to: "  return Array.from(modifiers ?? []);", breaks: "P4/C6" },
  { name: "an exploded die is never seen", file: RX, from: "  return Boolean(dice?.chosen?.exploded);", to: "  return false;", breaks: "P5/C12" },
  // C — check reactions
  { name: "the advantage overwrites the bias", file: RW, from: "        check.bias = resolveBias(check.bias, [\"advantage\"], BIAS);", to: "        check.bias = \"advantage\";", breaks: "C2" },
  { name: "before is asked twice a check", file: RW, from: "  check.checkReactionsBeforeAsked = true;", to: "", breaks: "C3" },
  { name: "before is asked of a reroll already asked", file: RW, from: "  if (check.checkReactionsBeforeAsked) {\n    const carried", to: "  if (false) {\n    const carried", breaks: "C4" },
  { name: "the second result is not locked", file: RW, from: "  await check.reroll();\n  lockCheck(check, by);", to: "  await check.reroll();", breaks: "C7/C10" },
  { name: "the lock leaves Conviction open", file: RW, from: "  check.convictionDecided = true;\n", to: "", breaks: "C7" },
  { name: "the lock leaves Lucky Break open", file: RW, from: "  check.saveReactionResolved = true;\n  check.fumbleRerolled = true;", to: "  check.fumbleRerolled = true;", breaks: "C7" },
  { name: "a second reaction rerolls again", file: RW, from: "    return { check: next, rerolled: true, lines };", to: "    check = next;", breaks: "C8" },
  { name: "a locked result is offered again", file: RW, from: "check.presetDice || check.locked || !specs.length) return { check, rerolled: false, lines };", to: "check.presetDice || !specs.length) return { check, rerolled: false, lines };", breaks: "C10" },
  { name: "a Partial is offered to everyone", file: RW, from: "  if (!succeeded && !failed) return { check, rerolled: false, lines };", to: "", breaks: "C11" },
  { name: "the attack's own reroll is ignored", file: RW, from: "    if (typeof verdict?.reroll === \"function\") {", to: "    if (false) {", breaks: "C13" },
  { name: "the attack's reroll is not locked", file: RW, from: "      next = await verdict.reroll(check);\n      lockCheck(next, spec.key);", to: "      next = await verdict.reroll(check);", breaks: "C13" },
  { name: "a throwing offer stops the asking", file: RW, from: "      console.error(`TRG Prime | check reaction \"${spec.key}\" (after)`, error);\n      continue;", to: "      throw error;", breaks: "C15" },
  { name: "the card is not told the second result stands", file: RW, from: "      `${String(out.label ?? \"\").trim() || spec.key}: rerolled (${first?.total ?? \"?\"} → ${next.outcome?.total ?? \"?\"}); the second result stands and cannot be modified or rerolled.`]", to: "      \"\"]", breaks: "C9" },
  // G — granted defences
  { name: "actorDefences does not read the grants", file: CT, from: "  const granted = grantedDefencesOf(actorSystem?.parent ?? null);", to: "  const granted = grantedDefencesOf(null);", breaks: "G3/D2" },
  { name: "an immunity to all is not added", file: CT, from: "...granted.immunities, ...(granted.immuneAll ? [ALL_DAMAGE] : [])]);", to: "...granted.immunities]);", breaks: "G7" },
  { name: "the pipeline does not know immunity to all", file: DMG, from: "  if (has(immunities, type) || allImmune || coldfire?.immune", to: "  if (has(immunities, type) || coldfire?.immune", breaks: "G7" },
  { name: "a one-blow grant is never cleared", file: GD, from: "  const kept = list.filter((g) => g.castKey);\n  if (kept.length) grants.set(key, kept); else grants.delete(key);", to: "", breaks: "G6" },
  { name: "a one-blow clear ends a cast grant", file: GD, from: "  const kept = list.filter((g) => g.castKey);", to: "  const kept = [];", breaks: "G9" },
  { name: "a one-blow grant never lapses", file: GD, from: "(g.castKey ? castStack.includes(g.castKey) : now - g.at < INSTANCE_LIFETIME_MS)", to: "(g.castKey ? castStack.includes(g.castKey) : true)", breaks: "G8" },
  { name: "an inner cast's end ends the outer", file: GD, from: "  const at = castStack.lastIndexOf(key);\n  if (at >= 0) castStack.splice(at, 1);", to: "  castStack.length = 0;", breaks: "G10" },
  { name: "a cast grant is tied to no cast", file: GD, from: "  const wanted = scope === \"cast\" ?", to: "  const wanted = false ?", breaks: "G9" },
  { name: "asked every packet of a cast", file: GD, from: "  if (askedInCast.has(entry)) return true;", to: "", breaks: "G13/D4" },
  { name: "outside a cast, asked once for ever", file: GD, from: "  if (!castKey) return false;\n  const entry", to: "  const entry", breaks: "G15" },
  // D — damage reactions
  { name: "the types are not lower-cased", file: RW, from: "    types: Array.from(event.types ?? []).map((t) => String(t ?? \"\").trim().toLowerCase()).filter(Boolean),", to: "    types: Array.from(event.types ?? []),", breaks: "D1" },
  { name: "an answer is not granted", file: RW, from: "      const granted = grantDefence(target, {", to: "      const granted = false && grantDefence(target, {", breaks: "D2" },
  { name: "the last blow's grant is kept", file: RW, from: "  if (askOnceThisCast(target, scopeKey)) return [];\n  clearInstanceGrants(target);", to: "  if (askOnceThisCast(target, scopeKey)) return [];", breaks: "D3" },
  { name: "a cast answer is held as one blow's", file: RW, from: "        scope: out.scope === \"cast\" ? \"cast\" : \"instance\", label: said(out)", to: "        scope: \"instance\", label: said(out)", breaks: "D4" },
  // K — cast and critical reactions
  { name: "a stopped cast is not stopped", file: RW, from: "      if (out?.stop) return { stop: true, lines };", to: "", breaks: "K1" },
  { name: "a cast reaction is not told the caster's token", file: RW, from: "  const full = { ...ctx, token: ctx.token ?? await tokenOf(ctx.actor) };", to: "  const full = { ...ctx, token: null };", breaks: "K1" },
  { name: "a critical's disadvantage is ignored", file: RW, from: "      if (out?.disadvantage) bias = biasWithDisadvantage(bias);", to: "", breaks: "K2" },
  // A — the ask
  { name: "Q34: the question waits ten seconds", file: ASK, from: "const ANSWER_WAIT_MS = 30000;", to: "const ANSWER_WAIT_MS = 10000;", breaks: "A2" },
  { name: "a yes is not acknowledged", file: ASK, from: "          game.socket.emit(SOCKET, { action: ACCEPTED, requestId: data.requestId, userId: data.userId, answererId: game.user.id, answer });\n", to: "", breaks: "A3" },
  { name: "the asker gives up after the 30 seconds whatever", file: ASK, from: "      clearTimeout(entry.timer);\n      entry.timer = setTimeout(() => {", to: "      entry.timer = setTimeout(() => {", breaks: "A4" },
  { name: "a no still runs the step", file: ASK, from: "const declined = (answer) => !answer || answer === \"no\";", to: "const declined = (answer) => !answer;", breaks: "A5" },
  { name: "the socket is never listened to", file: BOOT, from: "  registerReactionAsk();", to: "", breaks: "A7" },
  // W — the wiring
  { name: "before the dice is never asked", file: CHK, from: "      const said = await checkReactionsBefore(check, BIAS);", to: "      const said = [];", breaks: "W1" },
  { name: "after the result is never asked of a save", file: CHK, from: "    if (check.actor && !check.flat && check.outcome?.degree?.key && [\"save\", \"skill\"].includes(check.type)) {\n      const { checkReactionsAfter }", to: "    if (false) {\n      const { checkReactionsAfter }", breaks: "W3/W4" },
  { name: "a check forgets what a reaction calls it", file: CHK, from: "    this.reactionAs = String(config.reactionAs ?? \"\");", to: "    this.reactionAs = \"\";", breaks: "W5" },
  { name: "the card forgets the lock", file: CHK, from: "              locked: Boolean(this.locked),", to: "", breaks: "W6" },
  { name: "a held bonus modifies a locked result", file: CARD, from: "  // A RESULT A REACTION LOCKED (3.681.0) is not modified further.\n  if (raw.locked) return;", to: "", breaks: "W6" },
  { name: "a weapon attack is never asked after the hit", file: ATK, from: "    const answered = await checkReactionsAfter(check, { type: \"attack\", succeeded: outcome.hits, failed: !outcome.hits, target: targetActor });", to: "    const answered = { rerolled: false, lines: [] };", breaks: "W7" },
  { name: "a rerolled attack keeps the first outcome", file: ATK, from: "      check = answered.check;\n      outcome = outcomeOf(check);", to: "      check = answered.check;", breaks: "W7" },
  { name: "Alter the Thread's reroll is offered Prophetic Warning again", file: ATK, from: "allowConviction: false, conditionalChoices: check.conditionalChoices ?? [], checkReactionsBeforeAsked: true, reactionAdvantages", to: "allowConviction: false, conditionalChoices: check.conditionalChoices ?? [], reactionAdvantages", breaks: "W9" },
  { name: "a spell attack is never asked after the hit", file: CAST, from: "    const answered = await checkReactionsAfter(check, {\n      type: \"attack\", succeeded: outcome.hits", to: "    const answered = { rerolled: false, lines: [] }; void ({\n      type: \"attack\", succeeded: outcome.hits", breaks: "W10" },
  { name: "a spell attack's casting check is not an attack", file: CAST, from: "    castContext.reactionAs = \"attack\";", to: "", breaks: "W11" },
  { name: "a stopped cast still lands", file: CAST, from: "    if (reacted.stop) { degree = \"failure\"; castDisrupted = true; }", to: "    if (reacted.stop) { castDisrupted = true; }", breaks: "W12" },
  // Found in review
  { name: "a reroll loses the reaction's advantage", file: RW, from: "      check.bias = resolveBias(check.bias, [\"advantage\"], BIAS);\n      for (const label of carried)", to: "      for (const label of carried)", breaks: "C5c" },
  { name: "a reroll asks again", file: RW, from: "    return [];\n  }\n  const specs = registeredCheckReactions().filter((s) => s.before);", to: "  }\n  const specs = registeredCheckReactions().filter((s) => s.before);", breaks: "C5c" },
  { name: "the advantage given is not recorded", file: RW, from: "        check.reactionAdvantages.push(label);", to: "", breaks: "C5b" },
  { name: "a check drops the carried advantages", file: CHK, from: "    this.reactionAdvantages = Array.isArray(config.reactionAdvantages) ? config.reactionAdvantages.map(String) : [];", to: "    this.reactionAdvantages = [];", breaks: "W28" },
  { name: "Alter the Thread's reroll drops them", file: ATK, from: "check = await TRGCheck.roll({ ...attackCheckConfig, allowConviction: false, conditionalChoices: check.conditionalChoices ?? [], checkReactionsBeforeAsked: true, reactionAdvantages: check.reactionAdvantages ?? [], reactionModifiers: check.reactionModifiers ?? [] });", to: "check = await TRGCheck.roll({ ...attackCheckConfig, allowConviction: false, conditionalChoices: check.conditionalChoices ?? [], checkReactionsBeforeAsked: true, reactionModifiers: check.reactionModifiers ?? [] });", breaks: "W28" },
  { name: "the weapon card overwrites the reaction's lines again", file: ATK, from: "  check.extraDetailLines = [...reactionDetailLines.map((said) => line(said)), ...lines];", to: "  check.extraDetailLines = lines;", breaks: "W29" },
  { name: "the reroll line is not kept for the card", file: ATK, from: "      reactionDetailLines.push(...(check.extraDetailLines ?? []).slice(-1));", to: "", breaks: "W29" },
  { name: "a rerolled attack reuses the first roll's fumble confirmation", file: ATK, from: "      // belongs to dice no longer read.\n      fumbleConfirmedEarly = null;", to: "      // belongs to dice no longer read.", breaks: "W30" },
  { name: "a strike is no scope", file: ATK, from: "    return await resolveWeaponDamageInScope(actor, weapon, options ?? {});\n  } finally {\n    endCastScope(scope);", to: "    return await resolveWeaponDamageInScope(actor, weapon, options ?? {});\n  } finally {\n    void scope;", breaks: "W31" },
  { name: "the missile storm asks nobody", file: m("magic", "missile-storm-workflow.mjs"), from: "    lines.push(...reacted);", to: "", breaks: "W32" },
  { name: "the storm is not told its spell", file: CAST, from: "          areaTargets ?? [],\n          { spell, caster: actor }\n        );", to: "          areaTargets ?? []\n        );", breaks: "W32" },
  { name: "a triggered strike asks nobody", file: SE, from: "              for (const said of await damageReactionsBefore(victim, {", to: "              for (const said of await (async () => [])(victim, {", breaks: "W32" },
  { name: "a disrupted cast is not told apart", file: CAST, from: "ritual: Boolean(ritual), highMagic: hmCast.highMagic, disrupted: castDisrupted,\n    // AND WHAT A SOURCEBOOK", to: "ritual: Boolean(ritual), highMagic: hmCast.highMagic,\n    // AND WHAT A SOURCEBOOK", breaks: "W33" },
  { name: "Rage does not refuse a would-be cast", file: CAST, from: "  if (rageBarsCasting(actor)) return `${actor.name} cannot cast spells while raging.`;", to: "", breaks: "W34" },
  { name: "the module API has no castRefusal", file: APW, from: "      castRefusal: async (...args) => (await import(\"./magic/cast-workflow.mjs\")).castRefusalReason(...args),", to: "", breaks: "W34" },
  { name: "the warp paid for is not handed back", file: CAST, from: "  outcome.warpPP = Number(warpPP ?? 0) + Number(manipulationPP ?? 0);", to: "  outcome.warpPP = Number(warpPP ?? 0);", breaks: "W35" },
  { name: "the system data does not point back to its actor (review)", file: m("documents", "actor.mjs"), from: "      Object.defineProperty(this.system, \"parent\", { value: this, enumerable: false, configurable: true, writable: true });", to: "", breaks: "W36" },
  { name: "the parent is enumerable, and walked by every copy", file: m("documents", "actor.mjs"), from: "{ value: this, enumerable: false, configurable: true, writable: true }", to: "{ value: this, enumerable: true, configurable: true, writable: true }", breaks: "W36" },
  { name: "a storm asks nobody (review)", file: m("magic", "storm-workflow.mjs"), from: "        lines.push(...await spellDamageReactionsFor(actor, mode.type,", to: "        lines.push(...await (async () => [])(actor, mode.type,", breaks: "W37" },
  { name: "a hazard asks nobody (review)", file: m("magic", "hazard-terrain-workflow.mjs"), from: "        await spellDamageReactionsFor(mover, spec.damageType,", to: "        await (async () => [])(mover, spec.damageType,", breaks: "W37" },
  { name: "a spell-damage site's question is not a spell's", file: RW, from: "    kind: \"spell\", types: [String(type ?? \"\").trim().toLowerCase()].filter(Boolean), magical: true,", to: "    kind: \"other\", types: [String(type ?? \"\").trim().toLowerCase()].filter(Boolean), magical: false,", breaks: "W40" },
  { name: "the question's scope is read once the answer is back (review)", file: RW, from: "        scope: out.scope === \"cast\" ? \"cast\" : \"instance\", label: said(out), castKey: scopeKey", to: "        scope: out.scope === \"cast\" ? \"cast\" : \"instance\", label: said(out)", breaks: "D (scope)" },
  { name: "a closed scope still holds a grant", file: GD, from: "  const castKey = wanted && castStack.includes(wanted) ? wanted : null;", to: "  const castKey = wanted;", breaks: "G19" },
  { name: "the held scope is ignored", file: GD, from: "(heldScope === undefined ? currentCastScope() : heldScope)", to: "currentCastScope()", breaks: "G16" },
  { name: "askOnce ignores the scope it is given", file: GD, from: "export function askOnceThisCast(actor, castKey = currentCastScope()) {", to: "export function askOnceThisCast(actor, _castKey = null, castKey = currentCastScope()) {", breaks: "G17" },
  { name: "a disrupting Dispel reads the reactor's target (review)", file: ACT, from: "  const targetActor = presetDispel ? null : firstTargetActor();", to: "  const targetActor = firstTargetActor();", breaks: "W38" },
  { name: "the before-lines are not kept apart", file: CHK, from: "      check.reactionBeforeLines = said;", to: "", breaks: "W39" },
  { name: "the weapon card drops the before-lines (review)", file: ATK, from: "  const reactionDetailLines = [...reactionBeforeLines];", to: "  const reactionDetailLines = [];", breaks: "W29" },
  { name: "a disconnected answerer holds the roll", file: ASK, from: "      if (entry.answererId !== user?.id) continue;", to: "      continue;", breaks: "A8" },
  { name: "a partial cast is offered for disrupting", file: CAST, from: "  if ([\"heroic\", \"critical\", \"success\"].includes(degree)) {\n    const { castReactionsFor }", to: "  if ([\"heroic\", \"critical\", \"success\", \"partial\"].includes(degree)) {\n    const { castReactionsFor }", breaks: "W12" },
  { name: "the late warps are not counted", file: CAST, from: "      pp: Number(totalPP ?? 0) + Number(manipulationPP ?? 0),", to: "      pp: Number(totalPP ?? 0),", breaks: "W13" },
  { name: "a cast's scope never ends", file: CAST, from: "  } finally {\n    endCastScope(scope);\n  }", to: "  } finally {\n  }", breaks: "W14" },
  { name: "the struck creature is never asked at a critical", file: ATK, from: "    const reacted = await criticalReactionsFor({ attacker: actor, target: targetActor, weapon: weapon ?? null, bias, severity: severity ?? \"minor\" });", to: "    const reacted = { bias, lines: [] };", breaks: "W15" },
  { name: "a weapon's damage asks after the precision gate", file: ATK, from: "  const damageReactionLines = targetActor\n    ? await", to: "  const damageReactionLines = false\n    ? await", breaks: "W16" },
  { name: "a spell attack's damage is never asked", file: CAST, from: "  for (const said of await spellDamageReactions(targetActor, spell, actor, [damageType])) lines.push(line(said));\n", to: "", breaks: "W17" },
  { name: "a spell's damage is not magical", file: CAST, from: "    kind: \"spell\", types: types.filter(Boolean), magical: true, spellName: spell?.name ?? \"\",", to: "    kind: \"spell\", types: types.filter(Boolean), magical: false, spellName: spell?.name ?? \"\",", breaks: "W17" },
  { name: "a missile's damage is never asked", file: SE, from: "      for (const said of await damageReactionsBefore(target, { kind: \"spell\", types: [type], magical: true })) lines?.push?.(line(said));", to: "", breaks: "W18" },
  { name: "typed damage is never asked", file: DW, from: "    reactionLines.push(...await damageReactionsBefore(targetActor, {", to: "    reactionLines.push(...[], ...await (async () => [])({", breaks: "W19" },
  { name: "typed damage forgets the grant once met", file: DW, from: "    clearInstanceGrants(targetActor);\n  }\n  if (packet.healsInstead !== undefined) {", to: "  }\n  if (packet.healsInstead !== undefined) {", breaks: "W19" },
  { name: "a copied system loses its creature", file: DW, from: "    ? { ...targetActor.system, parent: targetActor, combat:", to: "    ? { ...targetActor.system, combat:", breaks: "W20" },
  { name: "the HP write keeps a one-blow grant", file: DY, from: "    clearInstanceGrants(actor);\n  }", to: "  }", breaks: "W21" },
  { name: "the Dispel dialog ignores the incoming spell", file: ACT, from: "        ...(presetDispel\n          ? { level:", to: "        ...(false\n          ? { level:", breaks: "W24" },
  { name: "the API offers no askReactor", file: APW, from: "      askReactor: async (...args) =>", to: "      askReactorX: async (...args) =>", breaks: "W25" },
  { name: "Conviction is spent past the round's limit", file: APW, from: "        if (!getConvictionState(actor).ok) return false;\n        await markConvictionSpent(actor);", to: "        await markConvictionSpent(actor);", breaks: "W26" },
  { name: "castAsReaction is not exported", file: SRS, from: "export async function castAsReaction(caster, spell, targetTokenIds = []) {", to: "async function castAsReaction(caster, spell, targetTokenIds = []) {", breaks: "W27" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.680.1\"", breaks: "Z" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block3b-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block3b-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-ea-block3b-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block3b-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
