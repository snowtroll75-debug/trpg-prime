/**
 * The Foundry half of breath memory (3.631.0). See breath-memory.mjs.
 *
 *   recordBreath         after a declared breath is rolled: the record on the
 *                        breather, and the at-once riders (Shadow, Slowing)
 *   registerBreathHooks  the next-turn riders (Clinging, Scorching) when the
 *                        breather's next turn begins; the record then drops
 */
import { BREATH_FLAG, breathRecord, breathRiders, halfDiceFormula, nextTurnRiderDue, damagedTargets } from "./breath-memory.mjs";
import { isActingGM } from "./acting-gm.mjs";

const SYSTEM_ID = "trg-prime";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const clock = () => ({ round: game.combat?.started ? Number(game.combat.round ?? 0) : null, worldTime: Number(game.time?.worldTime ?? 0) });

async function card(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

async function resolveActors(targets) {
  const out = [];
  for (const t of targets) {
    const doc = await fromUuid(t.uuid).catch(() => null);
    const actor = doc?.actor ?? doc;
    if (actor?.system) out.push({ actor, target: t });
  }
  return out;
}

/** The breath's record, and the riders that fire the moment it lands. */
export async function recordBreath(actor, item, use, results = []) {
  if (!use?.breath || !actor) return null;
  const record = breathRecord({ name: item.name, formula: use.spec?.damage?.formula, type: use.spec?.damage?.type }, results, clock());
  await actor.setFlag(SYSTEM_ID, BREATH_FLAG, record);

  const riders = breathRiders(Array.from(actor.items ?? []));
  const damaged = damagedTargets(record);
  if (!riders.length || !damaged.length) return record;
  const { perilEffectSpec, perilEffectOutcome } = await import("./peril-effect.mjs");
  const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
  const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
  const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
  const { conditionLabel } = await import("./conditions/condition-rules.mjs");
  const ck = clock();

  for (const { item: riderItem, rider } of riders) {
    if (rider.kind === "byBreathDegree") {
      const spec = perilEffectSpec({ outcomes: rider.outcomes ?? {}, conditions: rider.conditions ?? {} }, "");
      const lines = [line(`<em>Riding on ${record.ability}: each target damaged by the breath, by its own save.</em>`)];
      for (const { actor: target, target: t } of await resolveActors(damaged)) {
        const outcome = perilEffectOutcome(spec, t.degree, { combatRound: ck.round, worldTime: ck.worldTime });
        const tags = outcome.tags.map((tag) => ({ ...tag, label: conditionLabel(tag.key) }));
        const parts = [`${target.name}: breath save <strong>${t.degree}</strong>${outcome.text ? ` — ${outcome.text}` : " — unaffected."}`];
        if (tags.length) {
          const applied = await relayConditionTags(target, tags, {}, () => applyConditionTags(target, tags, {}));
          parts.push(`Applied: ${formatAppliedTags(applied ?? [])}.`);
        }
        lines.push(line(parts.join(" ")));
      }
      await card(actor, riderItem.name, lines);
    } else if (rider.kind === "save") {
      const spec = perilEffectSpec({ save: rider.save ?? "fortitude", basic: false, scope: "targets", outcomes: rider.outcomes ?? {}, conditions: rider.conditions ?? {} }, "");
      const actors = (await resolveActors(damaged)).map((x) => x.actor);
      const lines = [line(`<em>Riding on ${record.ability}: each target damaged by the breath saves.</em>`), ...await runDeclaredAreaEffect(actor, spec, { title: riderItem.name, targets: actors })];
      await card(actor, riderItem.name, lines);
    }
  }
  return record;
}

/** When the breather's next turn begins: Clinging / Scorching Breath. */
async function runNextTurnRiders(actor) {
  const record = actor.getFlag?.(SYSTEM_ID, BREATH_FLAG);
  if (!record) return;
  const ck = clock();
  const due = nextTurnRiderDue(record, ck);
  const riders = breathRiders(Array.from(actor.items ?? [])).filter((r) => r.rider.kind === "nextTurnDamage");
  if (due && riders.length) {
    const { perilEffectSpec } = await import("./peril-effect.mjs");
    const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
    const actors = (await resolveActors(damagedTargets(record))).map((x) => x.actor);
    for (const { item, rider } of riders) {
      const formula = halfDiceFormula(record.formula, Number(rider.fraction) || 0.5);
      if (!formula || !actors.length) continue;
      const spec = perilEffectSpec({ save: rider.save ?? "fortitude", basic: true, scope: "targets", damage: { formula, type: rider.type ?? record.type } }, "");
      const lines = [line(`<em>${record.ability} clings: half its dice again (${formula} ${spec.damage.type}), a basic ${spec.save} save for each target it damaged last turn.</em>`), ...await runDeclaredAreaEffect(actor, spec, { title: item.name, targets: actors })];
      await card(actor, item.name, lines);
    }
  }
  // Last turn's breath is spent either way — a record older than that is stale.
  if (due || !nextTurnRiderDue(record, ck)) await actor.unsetFlag(SYSTEM_ID, BREATH_FLAG);
}

export function registerBreathHooks() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!isActingGM()) return;
    if (!("turn" in changed) && !("round" in changed)) return;
    const actor = combat.combatant?.actor;
    if (!actor) return;
    await runNextTurnRiders(actor);
  });
}
