/**
 * Create — the Foundry side: the multi-day crafting project on the actor, the
 * setup dialog (with the requirement gate), and the manager for working days,
 * re-checking, and finishing. One active project at a time. The Create check
 * itself runs through action-workflow.mjs, which hands the degree and margin
 * here.
 */
import {
  ACCOMPLISHED_ARTISAN_RANKS,
  craftingFeatGate,
  createTypeGateView,
  craftingWorkModifiers,
  featlessHerbDC,
  inventedFormulaMaterials,
  inventiveCrafterAllowed
} from "./crafting-feats.mjs";
import {
  CONSUMABLE_ITEM_TYPES,
  ITEM_TYPES,
  consumableDCModifier,
  createPerDay,
  effectiveItemLevel,
  fumbleRuinsAtOnce
} from "./create-crafting.mjs";
import { CREATE_KITS, createKitShortfall } from "./tools-requirement.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "createProject";

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** The current project (any status), or null. */
export function createProjectStatus(actor) {
  return actor?.getFlag?.(SYSTEM_ID, FLAG) ?? null;
}

/** A project that's still being worked (not complete/failed), or null. */
export function activeCreateProject(actor) {
  const p = createProjectStatus(actor);
  return p && (p.status === "progressing" || p.status === "doomed") ? p : null;
}

async function setProject(actor, project) {
  await actor.setFlag(SYSTEM_ID, FLAG, project);
}

export async function clearCreateProject(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, FLAG) === undefined) return;
  await actor.unsetFlag(SYSTEM_ID, FLAG);
}

/** The item types the given skill can Create (Core Table). */
export function itemTypesForSkill(skillKey) {
  return Object.entries(ITEM_TYPES)
    .filter(([, cfg]) => cfg.skills.includes(skillKey))
    .map(([key, cfg]) => ({ key, ...cfg }));
}

/**
 * Setup dialog: item details + the requirement confirmations. Begin stays
 * disabled until every requirement is confirmed (block on all, per Graham).
 * Returns { itemName, itemTypeKey, itemLevel, itemValue, batchQty,
 * inventingFormula } or null.
 *
 * @param {string} skillKey The skill Create was invoked through.
 */
export async function promptCreateSetup(skillKey, { featNames = [], specialties = [], items = [], onlyTypes = null, route = null } = {}) {
  const { DialogV2 } = foundry.applications.api;
  // ONLY THE FEAT'S TYPES, for a character let in by a feat rather than a
  // specialty (3.577.1; see `featGovernedCreateTypes`). An alchemist with
  // no Crafting specialty may make elixirs through Crafting, not horseshoes.
  // A MODULE'S ROAD (3.673.0, C8) opens its own types through its skill.
  const types = (route
    ? Object.entries(ITEM_TYPES).filter(([key]) => route.itemTypes.includes(key)).map(([key, cfg]) => ({ key, ...cfg }))
    : itemTypesForSkill(skillKey))
    .filter((t) => !Array.isArray(onlyTypes) || onlyTypes.includes(t.key));
  if (!types.length) return null;

  const typeOptions = types
    .map((t) => `<option value="${t.key}">${esc(t.label)}${t.feat ? ` (needs ${esc(t.featLabel ?? t.feat)})` : ""}</option>`)
    .join("");

  // WHAT THE CHARACTER'S FEATS ANSWER FOR THEM (3.361.0). The requirement
  // ticks below were a self-declaration and nothing else; the ones this
  // system can now check are checked, and the tick that remains is the one
  // whose requirement is a prose alternation.
  //
  // THE SPECIALTIES ARE THE CHARACTER'S REAL ONES (3.362.0) — the ones the
  // Skill Specialties manager holds and the Create action already gates on,
  // not a second list kept per feat copy. See crafting-feats.mjs for the
  // parallel store that used to be here and what it cost.
  const inventive = inventiveCrafterAllowed(featNames);
  // THE GATE, CALLED (3.362.0). It existed from 3.361.0, was tested by
  // eleven checks and six mutations, and was imported by NOTHING — so a
  // scroll project began with no feat and no complaint. A rule with no
  // caller is not automation; it is a well-tested opinion.
  const gates = Object.fromEntries(types.map((t) => [
    t.key, craftingFeatGate({ itemTypeKey: t.key, requiredFeat: t.feat, featNames, skillKey })
  ]));
  // AND THE KIT, for the types whose kit the book names (3.577.0, Graham's
  // R4): alchemist's tools, a herbalism kit, a scribe's kit. Checked from
  // the character's own items, so the "I have the tools" tick is hidden
  // for those types and a missing kit blocks Begin with its reason.
  const kits = Object.fromEntries(types.map((t) => [
    t.key, { checked: Boolean(CREATE_KITS[t.key]), shortfall: createKitShortfall({ itemTypeKey: t.key, items }) }
  ]));
  const specialtyOptions = specialties.length
    ? `<label style="display:block;margin:4px 0">Crafting specialty<br>`
      + `<select name="specialty" style="width:100%">`
      + `<option value="">Not one of my specialties</option>`
      + specialties.map((sp) => `<option value="${esc(sp)}">${esc(sp)}</option>`).join("")
      + `</select></label>`
    : "";

  const req = (name, label) =>
    `<label style="display:flex;gap:8px;align-items:flex-start;margin:2px 0"><input type="checkbox" class="req" name="${name}" style="margin:2px 0 0"><span>${label}</span></label>`;

  const value = await DialogV2.wait({
    window: { title: "Create — set up the project", icon: "fa-solid fa-hammer" },
    classes: ["trg-prime"],
    position: { width: 480 },
    content: `<div class="trg-prime trg-check-dialog">
      <div style="max-height:56vh;overflow-y:auto;padding-right:4px">
        <label style="display:block;margin:2px 0">Item name<br><input type="text" name="itemName" style="width:100%"></label>
        <label style="display:block;margin:4px 0">Item type<br><select name="itemType" style="width:100%">${typeOptions}</select></label>
        ${specialtyOptions}
        <div style="display:flex;gap:10px;margin:4px 0">
          <label style="flex:1">Item level<br><input type="number" name="itemLevel" value="1" min="0" style="width:100%"></label>
          <label style="flex:1">Price (gp)<br><input type="number" name="itemValue" value="0" min="0" style="width:100%"></label>
        </div>
        <div style="display:flex;gap:10px;align-items:end;margin:4px 0">
          <label style="flex:1">Batch quantity (consumables)<br><input type="number" name="batchQty" value="1" min="1" style="width:100%"></label>
          <label style="flex:1;display:flex;gap:6px;align-items:center"${inventive ? "" : ' title="Needs the Inventive Crafter feat" style="flex:1;display:flex;gap:6px;align-items:center;opacity:.5"'}><input type="checkbox" name="inventingFormula" style="margin:0"${inventive ? "" : " disabled"}> Inventing a new formula (DC +5)${inventive ? "" : " — needs Inventive Crafter"}</label>
        </div>
        <p class="hint" style="margin:8px 0 2px"><strong>Requirements</strong> — confirm all to begin:</p>
        ${inventive ? "" : req("reqFormula", "I have the formula for this item")}
        <span data-req-tools>${req("reqTools", "I have the tools (and a workshop, if the item needs one)")}</span>
        <span data-req-feat>${req("reqFeat", "I have the specialty or feat this item type requires")}</span>
        ${req("reqMaterials", "I've supplied raw materials worth at least half the Price<span data-materials></span>")}
        ${route ? `<p class="hint" style="margin:6px 0 2px"><strong>${esc(route.label)}</strong>${route.dcStep ? ` — DC +${route.dcStep}` : ""}:</p>${route.ticks.map((t, i) => req(`reqRoute${i}`, esc(t))).join("")}` : ""}
      </div>
    </div>`,
    buttons: [
      {
        action: "begin",
        label: "Begin",
        icon: "fa-solid fa-hammer",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const val = (n) => root?.querySelector?.(`[name="${n}"]`)?.value;
          return {
            itemName: (val("itemName") || "").trim() || "the item",
            itemTypeKey: val("itemType"),
            itemLevel: Math.max(0, Math.trunc(Number(val("itemLevel")) || 0)),
            itemValue: Math.max(0, Math.trunc(Number(val("itemValue")) || 0)),
            batchQty: Math.max(1, Math.trunc(Number(val("batchQty")) || 1)),
            specialty: root?.querySelector?.('[name="specialty"]')?.value || "",
            inventingFormula: Boolean(root?.querySelector?.('[name="inventingFormula"]')?.checked),
            // THE ROAD TAKEN (3.673.0, C8), kept on the project for the
            // following days' checks.
            routeKey: route?.key ?? "",
            routeLabel: route?.label ?? "",
            routeDC: route?.dcStep ?? 0
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;
      const beginBtn = root.querySelector?.('button[data-action="begin"]');
      const typeSel = root.querySelector?.('[name="itemType"]');
      const featWrap = root.querySelector?.("[data-req-feat]");
      const featBox = featWrap?.querySelector?.("input.req");
      const notice = document.createElement("p");
      notice.className = "hint";
      notice.style.cssText = "margin:4px 0 0;color:#8b2f2f";
      featWrap?.after?.(notice);

      // WHICH OF THE THREE THIS TYPE IS — refused, asked about, or nobody's
      // business — is decided by `createTypeGateView`, not here. See its
      // note: a decision made inside a render callback is a decision no
      // harness can drive.
      const priceIn = root.querySelector?.('[name="itemValue"]');
      const materials = root.querySelector?.("[data-materials]");
      // THE FIGURE, NAMED (3.363.0). "You must supply raw materials equal
      // to half the cost of the item" is the rule for every project, and
      // `inventedFormulaMaterials` — written for Inventive Crafter, which
      // restates it — was called by nothing. A tick that says "at least
      // half the Price" makes the player do the arithmetic and gives them
      // nothing to check it against; the number is right here.
      const syncMaterials = () => {
        const gp = inventedFormulaMaterials(priceIn?.value);
        if (materials) materials.textContent = gp > 0 ? ` — ${gp} gp` : "";
      };
      priceIn?.addEventListener?.("input", syncMaterials);
      syncMaterials();

      const toolsWrap = root.querySelector?.("[data-req-tools]");
      const toolsBox = toolsWrap?.querySelector?.("input.req");
      const sync = () => {
        const view = createTypeGateView(gates[typeSel?.value], kits[typeSel?.value]);
        if (featWrap) featWrap.style.display = view.showTick ? "" : "none";
        if (featBox) featBox.disabled = !view.showTick;
        if (toolsWrap) toolsWrap.style.display = view.showToolsTick ? "" : "none";
        if (toolsBox) toolsBox.disabled = !view.showToolsTick;
        notice.textContent = view.notice;
        // RED ONLY WHEN IT REFUSES. A featless herb's "DC +5" is
        // information, not a refusal (3.577.1).
        notice.style.color = view.blocked ? "#8b2f2f" : "";
        const reqs = Array.from(root.querySelectorAll?.("input.req") ?? [])
          .filter((c) => !c.disabled && c.offsetParent !== null);
        if (beginBtn) beginBtn.disabled = view.blocked || !reqs.every((c) => c.checked);
      };
      Array.from(root.querySelectorAll?.("input.req") ?? [])
        .forEach((c) => c.addEventListener("change", sync));
      typeSel?.addEventListener?.("change", sync);
      sync();
    }
  });

  if (!value || value === "cancel" || typeof value !== "object") return null;
  return value;
}

/**
 * What the batch size did to the check DC, for the project card.
 *
 * SAID OUT LOUD BECAUSE IT WAS SILENT AND WRONG (3.363.0). The batch
 * quantity was collected, stored and printed here from the day Create
 * landed, while `consumableDCModifier` — the Core Table that turns it
 * into a DC — was called by nothing. Everything visible said the number
 * mattered. Now that it does, the card names it: a modifier a player can
 * see is one they can argue with, and one they will notice going missing.
 */
function batchDCNote(project) {
  if (!project?.isConsumable) return "";
  const mod = consumableDCModifier(project.batchQty);
  if (!mod) return ` · batch of ${project.batchQty} (no DC change)`;
  return ` · batch of ${project.batchQty} (DC ${mod > 0 ? "+" : ""}${mod})`;
}

function completionOf(progress, value) {
  return value > 0 && progress >= value;
}

/**
 * Apply a rolled degree to a project (start or a fresh check). Rolls the 1d6
 * doom clock on a Fumble. Returns the project.
 */
async function applyDegree(actor, project, { degreeKey, margin, ranks }) {
  // ACCOMPLISHED ARTISAN and MASTERFUL CRAFTER (Chapter 5), both scoped to
  // the project's crafting specialty and both read HERE, once, where a
  // day's work is priced — rather than at the two call sites that ask for
  // a day. The project remembers its specialty, so a character who takes
  // either feat mid-project gets it from the next day's work, which is the
  // same way every other feat in this system starts applying.
  const featNames = Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat").map((i) => i.name);
  const mods = craftingWorkModifiers({
    featNames,
    ranks,
    inSpecialty: Boolean(project.specialty)
  });
  // A HERB WITHOUT THE FEAT (3.577.1, Graham's R5), recorded for the
  // project card; the DC itself is added where the check is rolled, from
  // the same function, so the two cannot disagree.
  project.featlessHerbDC = featlessHerbDC({ itemTypeKey: project.itemTypeKey, featNames });
  const { perDay, outcome } = createPerDay(
    degreeKey, mods.ranks, project.itemLevel, margin, { workMultiplier: mods.multiplier }
  );
  project.artisan = mods.artisan;
  project.masterful = mods.masterful;
  project.effectiveRanks = mods.ranks;
  project.ranks = Math.max(0, Math.trunc(Number(ranks) || 0));
  project.degree = degreeKey;
  project.outcome = outcome;
  project.margin = Math.trunc(Number(margin) || 0);
  project.perDay = perDay;

  if (outcome === "fumble" && fumbleRuinsAtOnce(project.itemTypeKey)) {
    // "FAILING BY 10 OR MORE SHOULD RUIN THE HERB" (Graham's R5): no
    // hidden clock — the dose and its materials are gone today.
    project.status = "failed";
    project.ruined = true;
    project.daysWorked += 1;
  } else if (outcome === "fumble") {
    const roll = await new Roll("1d6").evaluate();
    project.status = "doomed";
    project.doomedDaysRemaining = roll.total;
    project.daysWorked += 1;
  } else {
    // Success/Partial accrue this day's work; Failure is a wasted day (0).
    project.progress += perDay;
    project.daysWorked += 1;
    project.status = completionOf(project.progress, project.itemValue) ? "complete" : "progressing";
  }
  await setProject(actor, project);
  return project;
}

/** Begin a new project from the day-one check. */
export async function startCreateProject(actor, { setup, skillKey, ranks, degreeKey, margin }) {
  const type = ITEM_TYPES[setup.itemTypeKey] ?? ITEM_TYPES.mundane;
  const project = {
    itemName: setup.itemName,
    itemTypeKey: setup.itemTypeKey,
    itemTypeLabel: type.label,
    isConsumable: CONSUMABLE_ITEM_TYPES.includes(setup.itemTypeKey),
    skillKey,
    skillLabel: actor.system?.skills?.[skillKey]?.label ?? skillKey,
    itemLevel: setup.itemLevel,
    effectiveLevel: effectiveItemLevel(setup.itemLevel),
    itemValue: setup.itemValue,
    batchQty: setup.batchQty,
    inventingFormula: setup.inventingFormula,
    specialty: setup.specialty || "",
    ...(setup.routeKey ? { routeKey: setup.routeKey, routeLabel: setup.routeLabel, routeDC: Math.max(0, Math.trunc(Number(setup.routeDC) || 0)) } : {}),
    progress: 0,
    daysWorked: 0,
    status: "progressing"
  };
  return applyDegree(actor, project, { degreeKey, margin, ranks });
}

/** Make another Create check on an existing project (the "check again next day" option). */
export async function recheckCreateProject(actor, { ranks, degreeKey, margin }) {
  const project = activeCreateProject(actor);
  if (!project) return null;
  return applyDegree(actor, project, { degreeKey, margin, ranks });
}

/**
 * Work one more day at the current rate — no new check. Success/Partial accrue
 * their per-day value; a doomed project ticks down its 1d6 clock and fails
 * when it runs out; a failed-check day has nothing to accrue (re-check instead).
 */
export async function workAnotherDay(actor) {
  const project = activeCreateProject(actor);
  if (!project) return null;

  if (project.status === "doomed") {
    project.doomedDaysRemaining -= 1;
    project.daysWorked += 1;
    if (project.doomedDaysRemaining <= 0) project.status = "failed";
  } else if (project.perDay > 0) {
    project.progress += project.perDay;
    project.daysWorked += 1;
    if (completionOf(project.progress, project.itemValue)) project.status = "complete";
  } else {
    // Last check was a Failure (0/day): a plain day of work makes no progress.
    ui.notifications?.info?.("That last check made no progress — make another Create check to try again.");
    return project;
  }
  await setProject(actor, project);
  return project;
}

export async function abandonCreateProject(actor) {
  const project = createProjectStatus(actor);
  await clearCreateProject(actor);
  return project;
}

/** The manager: the project's progress, with Work Another Day / Abandon. */
export async function openCreateManager(actor) {
  if (!actor) return;
  const { DialogV2 } = foundry.applications.api;
  const p = createProjectStatus(actor);

  if (!p) {
    await DialogV2.wait({
      window: { title: "Create — project", icon: "fa-solid fa-hammer" },
      classes: ["trg-prime"],
      position: { width: 420 },
      content: `<div class="trg-prime trg-check-dialog"><p><em>No crafting project. Roll Create from a crafting skill to begin one.</em></p></div>`,
      buttons: [{ action: "close", label: "Close", icon: "fa-solid fa-xmark", default: true }],
      rejectClose: false
    });
    return;
  }

  const pct = p.itemValue > 0 ? Math.min(100, Math.floor((p.progress / p.itemValue) * 100)) : 0;
  let statusLine;
  if (p.status === "complete") statusLine = `<strong style="color:#2a7">Complete — ${esc(p.itemName)} is finished.</strong>`;
  else if (p.status === "failed" && p.ruined) statusLine = `<strong style="color:#b00">Ruined — failed by 10 or more, and the herb and its materials are lost.</strong>`;
  else if (p.status === "failed") statusLine = `<strong style="color:#b00">Failed — the project collapsed and the raw materials are ruined.</strong>`;
  else if (p.status === "doomed") statusLine = `<strong style="color:#b00">Doomed — you don't yet realise it, but this will fail in ${p.doomedDaysRemaining} more day(s) of work.</strong>`;
  else statusLine = `Last check: <strong>${esc(p.outcome)}</strong> — ${p.perDay} gp/day.`;

  const content = `<div class="trg-prime trg-check-dialog">
    <p style="margin:0 0 2px"><strong>${esc(actor.name)}</strong> — crafting <strong>${esc(p.itemName)}</strong> (${esc(p.itemTypeLabel)}, level ${p.itemLevel}${p.isConsumable ? `, batch ${p.batchQty}` : ""})</p>
    <p class="hint" style="font-size:.82em;margin:0">${esc(p.skillLabel)}, ${p.ranks} ranks${p.specialty ? ` · ${esc(p.specialty)}` : ""}${p.artisan ? ` (+${ACCOMPLISHED_ARTISAN_RANKS} Accomplished Artisan)` : ""}${p.masterful ? " · work doubled (Masterful Crafter)" : ""}${p.inventingFormula ? " · inventing a formula (DC +5)" : ""}${p.featlessHerbDC ? ` · Very Hard without Alchemical Crafting (DC +${p.featlessHerbDC})` : ""}${batchDCNote(p)}. Progress = ranks × level × success modifier per day.</p>
    <p style="margin:6px 0 0">Progress: <strong>${p.progress} / ${p.itemValue} gp</strong> (${pct}%) · Days worked: <strong>${p.daysWorked}</strong></p>
    <p style="margin:4px 0 0">${statusLine}</p>
  </div>`;

  const buttons = [];
  if (p.status === "progressing" && p.perDay > 0) {
    buttons.push({ action: "work", label: `Work another day (+${p.perDay} gp)`, icon: "fa-solid fa-hammer", default: true });
  } else if (p.status === "doomed") {
    buttons.push({ action: "work", label: `Work another day (${p.doomedDaysRemaining} until it fails)`, icon: "fa-solid fa-hammer", default: true });
  }
  buttons.push({ action: "abandon", label: p.status === "complete" || p.status === "failed" ? "Clear" : "Abandon project", icon: "fa-solid fa-trash" });
  buttons.push({ action: "close", label: "Close", icon: "fa-solid fa-xmark" });

  const result = await DialogV2.wait({
    window: { title: "Create — project", icon: "fa-solid fa-hammer" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content,
    buttons,
    rejectClose: false
  });

  if (result === "work") {
    await workAnotherDay(actor);
    return openCreateManager(actor);
  }
  if (result === "abandon") {
    await abandonCreateProject(actor);
    ui.notifications.info(`${actor.name}'s crafting project cleared.`);
  }
}
