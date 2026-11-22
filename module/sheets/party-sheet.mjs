/**
 * The Party sheet.
 *
 * Two tabs, per Graham's brief (12 Aug 2026): a ROSTER the GM curates by
 * dropping actors on it, showing each member's name, race, class, level,
 * HP, PP and conditions; and a LOOT pile of gear and coin that players
 * can take from.
 *
 * A SEPARATE SHEET CLASS, not a mode of TRGActorSheet. The actor sheet is
 * five thousand lines of rolls, spells, encumbrance and proficiency, and
 * a party has none of those — it has no HP, no attributes, and rolls
 * nothing. Threading a fifth actor type through all of that would mean a
 * hundred `{{#unless isParty}}` guards, each one a place for a party to
 * crash on a field it does not have.
 *
 * NOTHING ABOUT A MEMBER IS STORED HERE. Every number on the roster is
 * read from the member actor at render time (see party.mjs). The party
 * stores only the list of who is on it.
 */

import {
  PARTY_TYPE, addMember, canJoinRoster, lootSummary, memberSummary,
  normaliseCoin, normaliseMembers, planLootDrop, refusePartyLootDrag, removeMember, COIN_DENOMINATIONS
} from "../party.mjs";
import {
  MEMBER_STATUS, activeMembers, canSeeMemberDetails, resolvePartyRoster, watchKeysFor
} from "../party-members.mjs";
import { RenderCoalescer, partyLiveSync } from "../party-live-sync.mjs";
import {
  combatRecord, initiativeState, memberTokens, nextToken, partyInitiativeIds, partySummary,
  sceneTokenRecords, stepResource, STEPPED_RESOURCES
} from "../party-dashboard.mjs";
import { landSpeed, openTravelDialog } from "../travel-dialog.mjs";
import { openRestDialog } from "../rest/rest-workflow.mjs";
import {
  chooseXPAward, confirmXPAward, partyParticipants, partyScopeNote, runOnce, toolbarFor, xpAwardPreview
} from "../party-actions.mjs";
import { applyDamage } from "../combat/dying-workflow.mjs";
import { convictionEnabled } from "../conviction.mjs";
import { requestTakeCoin, requestTakeItem } from "../party-socket.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { coinValueInGP } from "../items.mjs";
import {
  addEncounterCreatures, awardPartyXP, beginSession, rewardsContext, setEncounterCount
} from "../party-rewards-workflow.mjs";
import { ACCOMPLISHMENT_AWARDS } from "../rewards.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SYSTEM_ID = "trg-prime";

/** The condition labels active on a member, for the roster row. */
function conditionLabels(actor) {
  const effective = actor?.conditions?.effective;
  if (!effective) return [];
  const granted = actor.conditions?.granted;
  return [...effective].map((id) => {
    const label = CONDITIONS[id]?.label ?? id;
    const value = actor.getConditionValue?.(id);
    // A valued condition without its number is half the information —
    // "Weakened" and "Weakened 3" are different problems.
    return {
      id,
      label: CONDITIONS[id]?.valued && value ? `${label} ${value}` : label,
      // GRANTED BY ANOTHER (Unconscious brings Blinded): shown, but it goes
      // when its source goes, so the dashboard offers no remove on it.
      granted: Boolean(granted?.has?.(id))
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The member's other active effects (3.709.0): spells, items, auras, and
 * not the condition effects, which are already shown as conditions.
 */
function activeEffectsOf(actor) {
  const list = Array.from(actor?.appliedEffects ?? []);
  return list
    .filter((effect) => !effect.disabled && !Array.from(effect.statuses ?? []).some((id) => CONDITIONS[id]))
    .map((effect) => ({ id: effect.id, name: effect.name, img: effect.img }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** May this user open the member's own sheet? Foundry's own test for it. */
function canOpenSheet(actor, user) {
  if (!actor) return false;
  if (user?.isGM) return true;
  try { return actor.testUserPermission(user, "LIMITED"); } catch { return false; }
}

export class TRGPartySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["trg-prime", "sheet", "actor", "party"],
    position: { width: 820, height: 760, top: 90, left: 110 },
    window: { icon: "fa-solid fa-users", resizable: true },
    form: { closeOnSubmit: false, submitOnChange: true },
    actions: {
      removeMember: TRGPartySheet.removeMember,
      openMember: TRGPartySheet.openMember,
      takeItem: TRGPartySheet.takeItem,
      takeCoin: TRGPartySheet.takeCoin,
      deleteLoot: TRGPartySheet.deleteLoot,
      editImage: TRGPartySheet.editImage,
      addSelectedTokens: TRGPartySheet.addSelectedTokens,
      removeEncounterCreature: TRGPartySheet.removeEncounterCreature,
      clearEncounter: TRGPartySheet.clearEncounter,
      awardEncounterXP: TRGPartySheet.awardEncounterXP,
      awardAccomplishment: TRGPartySheet.awardAccomplishment,
      awardCustomXP: TRGPartySheet.awardCustomXP,
      beginSession: TRGPartySheet.beginSession,
      // THE OVERVIEW (3.709.0, Stage 2).
      findToken: TRGPartySheet.findToken,
      selectToken: TRGPartySheet.selectToken,
      rollMemberInitiative: TRGPartySheet.rollMemberInitiative,
      rollPartyInitiative: TRGPartySheet.rollPartyInitiative,
      applyMemberDamage: TRGPartySheet.applyMemberDamage,
      stepMemberResource: TRGPartySheet.stepMemberResource,
      removeMemberCondition: TRGPartySheet.removeMemberCondition,
      addMemberCondition: TRGPartySheet.addMemberCondition,
      // THE PARTY ACTIONS (3.710.0, Stage 3).
      partyRest: TRGPartySheet.partyRest,
      partyTravel: TRGPartySheet.partyTravel,
      partyAwardXP: TRGPartySheet.partyAwardXP
    },
    // Actors and items are both dropped on this sheet — actors onto the
    // roster, items into the loot.
    dragDrop: [{ dragSelector: ".loot-row", dropSelector: null }]
  };

  static PARTS = {
    form: {
      template: "systems/trg-prime/templates/actor/party-sheet.hbs",
      // Each tab panel scrolls on its own; a live re-render (a member's HP
      // changing) keeps the GM where they were in it (3.708.0).
      scrollable: ['section[data-tab="roster"]', 'section[data-tab="loot"]', 'section[data-tab="rewards"]']
    }
  };

  static TABS = {
    primary: {
      initial: "roster",
      tabs: [
        // STAGE 2 (3.709.0): the roster becomes the Overview, the loot the
        // Inventory and the rewards the Encounter. The ids are unchanged, so
        // an open tab, a drop on "rewards" and every saved state carry over.
        // Skills and Notes join when they are built (Stage 5; Graham,
        // 22 Nov 2026: no placeholder tabs).
        { id: "roster", icon: "fa-solid fa-users", label: "Overview" },
        { id: "loot", icon: "fa-solid fa-sack-dollar", label: "Inventory" },
        // ENCOUNTERS AND REWARDS (3.619.0; Chapter 12, Graham's R2, R6, R8).
        { id: "rewards", icon: "fa-solid fa-trophy", label: "Encounter" }
      ]
    }
  };

  /**
   * THE REWARDS TAB IS THE GM'S (3.708.0; Graham, 22 Nov 2026). It lists
   * the encounter's adversaries, their Effective Levels, the budget and the
   * XP, so for a player the tab is not offered and its context is not
   * built. The award buttons were already refused to a player in the
   * workflow itself (party-rewards-workflow.mjs).
   */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (!config || group !== "primary" || game.user?.isGM) return config;
    return { ...config, tabs: config.tabs.filter((tab) => tab.id !== "rewards") };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system ?? {};
    const isGM = game.user?.isGM === true;

    // THE ROSTER, RESOLVED ONCE FOR EVERY PANEL (3.708.0). One batch
    // through party-members.mjs; the Rewards tab is handed the same
    // actors rather than looking them up again.
    const roster = await resolvePartyRoster(actor);
    const conviction = convictionEnabled();
    const tokens = sceneTokenRecords();
    const combat = combatRecord();
    const members = roster.map((entry) => {
      const summary = memberSummary(entry.actor, entry.uuid, conditionLabels, {
        status: entry.status,
        // Graham's ruling: an NPC member's statistics only for a GM or an
        // Observer of that NPC. A player character is always shown.
        restricted: entry.status === MEMBER_STATUS.OK && !canSeeMemberDetails(entry.actor, game.user),
        readSpeed: landSpeed,
        readEffects: activeEffectsOf,
        conviction
      });
      if (summary.missing) return summary;
      return { ...summary, controls: this.#memberControls(entry.actor, summary, { tokens, combat, isGM }) };
    });

    const loot = lootSummary(Array.from(actor.items ?? []));
    const currency = normaliseCoin(system.currency);

    // Which of MY characters a take would go to. A player with one
    // character never sees a chooser; a GM, or a player with several,
    // picks. Built here because the template must not do lookups.
    const destinations = game.actors
      .filter((a) => ["character", "npc"].includes(a.type) && a.isOwner)
      .map((a) => ({ uuid: a.uuid, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rewards = isGM ? await rewardsContext(actor, { members: activeMembers(roster) }) : null;

    // What this render read from, for the live updates (_onRender).
    this.#watchKeys = watchKeysFor([...roster, ...(rewards?.watchEntries ?? [])]);

    const summary = partySummary({ rows: members, coinGP: coinValueInGP(currency) });
    const partyInitiative = combat
      ? partyInitiativeIds(combat, activeMembers(roster)).length
      : 0;

    return {
      ...context,
      actor,
      summary,
      toolbar: {
        // Which party actions this user is offered (party-actions.mjs).
        // Group Check has its place in that list and is not drawn until
        // it is built (Stage 5).
        show: Object.fromEntries(toolbarFor({ isGM }).map((a) => [a.id, true])),
        hasCombat: Boolean(combat),
        partyInitiative,
        initiativeHint: !combat
          ? "No combat is active."
          : partyInitiative
            ? `Roll initiative for ${partyInitiative} member${partyInitiative === 1 ? "" : "s"} you control.`
            : "No member you control is waiting to roll in this combat."
      },
      // Only what the template prints. The whole `system` object carried
      // the encounter and the GM's notes into a player's context.
      isGM,
      members,
      memberCount: members.filter((m) => !m.missing).length,
      hasMembers: members.length > 0,
      hasUnresolved: members.some((m) => m.missing),
      loot,
      currency,
      coinKeys: COIN_DENOMINATIONS,
      currencyGP: coinValueInGP(currency),
      destinations,
      hasDestination: destinations.length > 0,
      rewards,
      tabs: this._prepareTabs("primary"),
      tabList: Object.values(this._prepareTabs("primary"))
    };
  }

  /* ---------------------------------------------------------------- */
  /* Live updates (3.708.0)                                           */
  /* ---------------------------------------------------------------- */

  /** The document UUIDs the last render read from. */
  #watchKeys = new Set();

  /** Coalesces a burst of member changes into one render. */
  #coalescer = new RenderCoalescer({
    render: () => this.render(),
    isRendered: () => this.rendered,
    isBusy: () => {
      // Typing in one of this sheet's fields: a render would replace it.
      const active = globalThis.document?.activeElement;
      return Boolean(this.element && active && this.element.contains(active)
        && active.matches?.("input, textarea, select") && !active.disabled);
    },
    whenIdle: (callback) => {
      this.element?.addEventListener("focusout", () => setTimeout(callback, 0), { once: true });
    }
  });

  /** Called by the shared registry when a member (or an adversary) changes. */
  onPartyDocumentChanged() {
    this.#coalescer.request();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // After every render, so a member added, removed or deleted is picked
    // up without bookkeeping of its own. The registry replaces this sheet's
    // previous set; it never accumulates.
    partyLiveSync().watch(this, this.#watchKeys);
  }

  _onClose(options) {
    super._onClose(options);
    this.#coalescer.cancel();
    partyLiveSync().unwatch(this);
  }

  /* ---------------------------------------------------------------- */
  /* The Overview's member controls (3.709.0, Stage 2)                */
  /* ---------------------------------------------------------------- */

  /**
   * Which controls a member row offers this user, and why one is off.
   * Built at render; every handler checks again when pressed, since the
   * canvas and the combat may have moved on since.
   */
  #memberControls(member, summary, { tokens, combat, isGM }) {
    const found = memberTokens(member, tokens);
    const owned = found.tokens.filter((t) => isGM || t.isOwner);
    const init = initiativeState(combat, member);
    const many = found.tokens.length > 1 ? ` (${found.tokens.length} on this scene; press again for the next)` : "";
    const copies = found.unlinkedCopies
      ? ` ${found.unlinkedCopies} unlinked cop${found.unlinkedCopies === 1 ? "y" : "ies"} of this actor ${found.unlinkedCopies === 1 ? "is a" : "are"} separate creature${found.unlinkedCopies === 1 ? "" : "s"} and ${found.unlinkedCopies === 1 ? "is" : "are"} not chosen.`
      : "";
    const initHint = {
      none: "No combat is active.",
      absent: "Not in the current combat.",
      rolled: `Initiative ${init.value} — already rolled.`,
      several: `${init.count} of this actor's combatants need a roll — use the Combat Tracker.`,
      notYours: "You do not control this combatant.",
      ready: "Roll initiative in the current combat."
    }[init.state];
    return {
      canOpen: canOpenSheet(member, game.user),
      find: { enabled: found.tokens.length > 0, hint: found.tokens.length ? `Find on this scene${many}.${copies}` : `No token for ${member.name} on this scene.${copies}` },
      select: { enabled: owned.length > 0, hint: owned.length ? `Select${many}.` : (found.tokens.length ? "You do not control this token." : `No token for ${member.name} on this scene.`) },
      initiative: { enabled: init.state === "ready", state: init.state, value: init.value ?? null, hint: initHint },
      // GM-authorised (Graham, 22 Nov 2026): the damage dialog, resource
      // steppers and condition controls, none of them for a gated row.
      gm: isGM && !summary.restricted
    };
  }

  /**
   * A PLAYER'S CONTROLS STAY USABLE (3.709.0, found live). Foundry v14's
   * DocumentSheetV2 disables EVERY form control on a sheet the user cannot
   * edit, and a player has Observer on a party, never Owner. So, since the
   * party sheet first ran on v14, a player could not switch tabs or press
   * Take Item or Take Coin: the buttons rendered and did nothing.
   *
   * After Foundry's pass, the controls marked `data-player-ok` in the
   * template are enabled again: the tabs, Take, Open, Find, Select and Roll
   * Initiative, each of which checks its own permission when pressed (the
   * relay for Take, ownership for Select and initiative). One the template
   * itself disabled (no token to find, nothing to roll) stays disabled.
   * Every field that writes the party (coin, the threat level) stays off.
   */
  _toggleDisabled(disabled) {
    const offAlready = new Set(Array.from(this.element?.querySelectorAll("[data-player-ok]") ?? []).filter((el) => el.disabled));
    super._toggleDisabled(disabled);
    if (!disabled) return;
    for (const el of this.element?.querySelectorAll("[data-player-ok]") ?? []) {
      if (!offAlready.has(el)) el.disabled = false;
    }
  }

  /** The member a control belongs to, resolved now (not from the template). */
  async #memberFrom(target) {
    const uuid = target.closest("[data-uuid]")?.dataset?.uuid;
    if (!uuid || !normaliseMembers(this.actor.system.members).includes(uuid)) return null;
    try { return await fromUuid(uuid); } catch { return null; }
  }

  /** The last token Find went to, per member, so a second press goes to the next. */
  #lastToken = new Map();

  static async findToken(event, target) {
    event.preventDefault();
    const member = await this.#memberFrom(target);
    if (!member) return;
    const { tokens } = memberTokens(member, sceneTokenRecords());
    const pick = nextToken(tokens, this.#lastToken.get(member.uuid));
    if (!pick) {
      ui.notifications?.warn(`${member.name} has no token on this scene that you can see.`);
      return;
    }
    this.#lastToken.set(member.uuid, pick.id);
    const { x, y } = pick.token.center;
    await canvas.animatePan({ x, y });
    canvas.ping?.(pick.token.center);
  }

  static async selectToken(event, target) {
    event.preventDefault();
    const member = await this.#memberFrom(target);
    if (!member) return;
    const { tokens } = memberTokens(member, sceneTokenRecords());
    const owned = tokens.filter((t) => game.user.isGM || t.isOwner);
    if (!owned.length) {
      ui.notifications?.warn(tokens.length ? `You do not control ${member.name}'s token.` : `${member.name} has no token on this scene.`);
      return;
    }
    // The token Find last went to, if it is one this user controls;
    // otherwise the first, in the same fixed order.
    const last = this.#lastToken.get(member.uuid);
    const pick = owned.find((t) => t.id === last) ?? owned[0];
    this.#lastToken.set(member.uuid, pick.id);
    pick.token.control({ releaseOthers: true });
    const { x, y } = pick.token.center;
    await canvas.animatePan({ x, y });
  }

  static async rollMemberInitiative(event, target) {
    event.preventDefault();
    const member = await this.#memberFrom(target);
    const combat = combatRecord();
    if (!member || !combat) return;
    const state = initiativeState(combat, member);
    if (state.state !== "ready") {
      ui.notifications?.warn(`${member.name}: ${state.state === "rolled" ? "initiative is already rolled" : "there is no roll to make here"}.`);
      return;
    }
    // The system's own roll: ownership, Zealous Battlecry, Reactive Stance
    // and the modules' initiative hooks all run there.
    await combat.combat.rollInitiative([state.id]);
  }

  static async rollPartyInitiative(event) {
    event.preventDefault();
    const combat = combatRecord();
    if (!combat) {
      ui.notifications?.warn("No combat is active.");
      return;
    }
    const roster = await resolvePartyRoster(this.actor);
    const ids = partyInitiativeIds(combat, activeMembers(roster));
    if (!ids.length) {
      ui.notifications?.info("No member you control is waiting to roll initiative.");
      return;
    }
    await combat.combat.rollInitiative(ids);
  }

  /** The existing Apply Damage dialog (DR, resistances, criticals, dying). GM only. */
  static async applyMemberDamage(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const member = await this.#memberFrom(target);
    if (member) await applyDamage(member);
  }

  /** One press of a resource stepper: the sheet field's own update. GM only. */
  static async stepMemberResource(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const member = await this.#memberFrom(target);
    const key = target.dataset.resource;
    if (!member || !STEPPED_RESOURCES.includes(key)) return;
    const step = stepResource({
      key, value: member.system?.resources?.[key]?.value, max: member.system?.resources?.[key]?.max,
      delta: Number(target.dataset.delta)
    });
    if (step) await member.update({ [step.path]: step.value });
  }

  /** Remove a directly applied condition, through the actor's own toggle. GM only. */
  static async removeMemberCondition(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const member = await this.#memberFrom(target);
    const id = target.dataset.condition;
    if (!member || !id || !CONDITIONS[id]) return;
    if (member.conditions?.granted?.has?.(id)) {
      ui.notifications?.warn(`${CONDITIONS[id].label} on ${member.name} comes from another condition; remove that one.`);
      return;
    }
    await member.toggleStatusEffect(id, { active: false });
  }

  /** Add a condition, chosen from the system's list, through the actor's own toggle. GM only. */
  static async addMemberCondition(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const member = await this.#memberFrom(target);
    if (!member) return;
    const options = Object.entries(CONDITIONS)
      .filter(([id]) => !member.conditions?.effective?.has?.(id))
      .sort(([, a], [, b]) => String(a.label).localeCompare(String(b.label)))
      .map(([id, c]) => `<option value="${id}">${c.label}${c.valued ? " (valued)" : ""}</option>`).join("");
    const id = await DialogV2.wait({
      window: { title: `${member.name}: Add a Condition`, icon: "fa-solid fa-circle-plus" },
      classes: ["trg-prime"],
      position: { width: 340 },
      content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">
        <label>Condition</label><select name="condition">${options}</select></div>
        <p class="hint">Applied by the system's own condition toggle: immunity is respected, and a valued condition asks for its value.</p></div>`,
      buttons: [
        { action: "confirm", label: "Apply", icon: "fa-solid fa-check", default: true,
          callback: (e, button) => button.form.elements.condition.value },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!id || id === "cancel" || !CONDITIONS[id]) return;
    await member.toggleStatusEffect(id, { active: true });
  }

  /* ---------------------------------------------------------------- */
  /* Drops                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * An ACTOR dropped on this sheet joins the roster; an ITEM goes into
   * the loot. Both are GM-only: the roster is the GM's to curate, and a
   * player who could drop items in could also use the party as a
   * bottomless bag by dropping and re-taking.
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

    // ON THE REWARDS TAB, AN ACTOR IS AN ADVERSARY (3.619.0, R2): it joins
    // the encounter, not the roster.
    if (data?.type === "Actor" && this.tabGroups?.primary === "rewards") {
      if (!game.user.isGM) return;
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.type === PARTY_TYPE) return;
      await addEncounterCreatures(this.actor, [actor.uuid]);
      return;
    }

    if (data?.type === "Actor") {
      if (!game.user.isGM) {
        ui.notifications?.warn("Only the GM can change the party roster.");
        return;
      }
      const actor = await fromUuid(data.uuid);
      if (!actor) return;
      if (actor.id === this.actor.id) {
        ui.notifications?.warn("A party cannot be a member of itself.");
        return;
      }
      if (!canJoinRoster(actor)) {
        ui.notifications?.warn(
          `${actor.name} is a ${actor.type} — only characters and NPCs can join a party roster.`
        );
        return;
      }
      const members = addMember(this.actor.system.members, actor.uuid);
      if (members.length === normaliseMembers(this.actor.system.members).length) {
        ui.notifications?.info(`${actor.name} is already on this roster.`);
        return;
      }
      await this.actor.update({ "system.members": members });
      return;
    }

    if (data?.type === "Item" && !game.user.isGM) {
      ui.notifications?.warn("Only the GM can add to the party loot.");
      return;
    }
    return super._onDrop(event);
  }

  /**
   * AN ITEM DROPPED IN (3.708.0). Checked by `planLootDrop` (party.mjs)
   * before anything is created: the GM only, a type the loot holds, and a
   * quantity of at least one, read from the item itself. A spell or a feat
   * used to land as a hidden embedded item; it is now refused, with the
   * reason.
   */
  async _onDropItem(event, item) {
    const plan = planLootDrop({ item, isGM: game.user?.isGM === true, partyUuid: this.actor.uuid });
    if (!plan.ok) {
      ui.notifications?.warn(plan.reason);
      return null;
    }
    return super._onDropItem(event, item);
  }

  /** A party holds no effects: it has nothing for one to change (3.708.0). */
  async _onDropActiveEffect() {
    ui.notifications?.warn("A party has no statistics for an effect to change. Drop it on a member instead.");
    return null;
  }

  /**
   * A loot row may be dragged by the GM only (3.708.0). Foundry v14 lets
   * anyone who can see a sheet start a drag from it, and a character
   * sheet's default drop copies the item, so a player could take loot
   * without the party losing it. Players take through the Take button.
   */
  _canDragStart(selector) {
    return game.user?.isGM === true;
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * TABS ARE FOUNDRY'S OWN (3.708.0). The sheet used to carry a copy of the
   * actor sheet's `selectTab`. It now uses ApplicationV2's `tab` action and
   * `changeTab`, which keep `tabGroups` and restore the open tab on every
   * render. Two small additions:
   *
   * - a click on the icon or label inside a tab button is a click on the
   *   button. Foundry reads `event.target`, which is the icon, and would
   *   ignore it;
   * - `aria-selected` and `aria-hidden` stay in step with the open tab, as
   *   the old handler kept them.
   */
  _onClickTab(event) {
    const button = event.target?.closest?.("[data-tab]");
    if (!button) return;
    const tab = button.dataset.tab;
    if (!tab || button.classList.contains("active") || (event.button !== 0)) return;
    this.changeTab(tab, button.dataset.group ?? "primary", { event, navElement: button.closest(".tabs") });
  }

  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    for (const el of this.element?.querySelectorAll(`[data-group="${group}"][data-tab]`) ?? []) {
      const selected = el.dataset.tab === tab;
      if (el.matches('[role="tab"]')) {
        el.setAttribute("aria-selected", String(selected));
        el.tabIndex = selected ? 0 : -1;
      }
      if (el.classList.contains("sheet-tab-panel")) el.setAttribute("aria-hidden", String(!selected));
    }
  }

  static async removeMember(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const uuid = target.closest("[data-uuid]")?.dataset?.uuid;
    if (!uuid) return;
    await this.actor.update({
      "system.members": removeMember(this.actor.system.members, uuid)
    });
  }

  static async openMember(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-uuid]")?.dataset?.uuid;
    const member = uuid ? await fromUuid(uuid) : null;
    if (!member) {
      ui.notifications?.warn("That character no longer exists — remove it from the roster.");
      return;
    }
    member.sheet.render(true);
  }

  static async deleteLoot(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const id = target.closest("[data-item-id]")?.dataset?.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (!item) return;
    await item.delete();
  }

  /** Take an item — the whole stack, or a chosen number of it. */
  static async takeItem(event, target) {
    event.preventDefault();
    const id = target.closest("[data-item-id]")?.dataset?.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (!item) return;

    const destination = await TRGPartySheet.#chooseDestination();
    if (!destination) return;

    const have = Math.max(1, Number(item.system?.quantity) || 1);
    let quantity = 1;
    if (have > 1) {
      quantity = await TRGPartySheet.#chooseQuantity(item.name, have);
      if (!quantity) return;
    } else {
      quantity = have;
    }
    await requestTakeItem({ party: this.actor, item, quantity, destination });
  }

  static async takeCoin(event) {
    event.preventDefault();
    const destination = await TRGPartySheet.#chooseDestination();
    if (!destination) return;
    const coin = await TRGPartySheet.#chooseCoin(normaliseCoin(this.actor.system.currency));
    if (!coin) return;
    await requestTakeCoin({ party: this.actor, coin, destination });
  }

  static async editImage(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.actor.img,
      callback: (path) => this.actor.update({ img: path })
    });
    return fp.browse();
  }

  /* ---------------------------------------------------------------- */
  /* Rewards (3.619.0)                                                */
  /* ---------------------------------------------------------------- */

  /** The controlled tokens' creatures join the encounter. */
  static async addSelectedTokens(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const uuids = (canvas?.tokens?.controlled ?? [])
      .map((token) => token.actor)
      .filter((actor) => actor && actor.type !== PARTY_TYPE)
      .map((actor) => actor.uuid);
    if (!uuids.length) {
      ui.notifications?.warn("Select the adversaries' tokens first.");
      return;
    }
    await addEncounterCreatures(this.actor, uuids);
  }

  static async removeEncounterCreature(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const uuid = target.closest("[data-creature-uuid]")?.dataset?.creatureUuid;
    if (uuid) await setEncounterCount(this.actor, uuid, 0);
  }

  static async clearEncounter(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await this.actor.update({ "system.encounter.creatures": [] });
  }

  static async awardEncounterXP(event) {
    event.preventDefault();
    const context = await rewardsContext(this.actor);
    await this.#awardXP(context.summary.total, "the encounter");
  }

  static async awardAccomplishment(event, target) {
    event.preventDefault();
    const award = ACCOMPLISHMENT_AWARDS.find((entry) => entry.key === target.dataset.award);
    if (award) await this.#awardXP(award.xp, `a ${award.label} accomplishment`);
  }

  static async awardCustomXP(event) {
    event.preventDefault();
    const input = this.element?.querySelector("[data-custom-xp]");
    const amount = Math.floor(Number(input?.value) || 0);
    if (amount > 0) await this.#awardXP(amount, "the GM's award");
  }

  /* ---------------------------------------------------------------- */
  /* The Party Actions (3.710.0, Stage 3)                             */
  /* ---------------------------------------------------------------- */

  /** Actions running on this client, so a second press does nothing. */
  static #running = new Set();

  /** This party's participants: each eligible member once, the rest named. */
  async #participants() {
    return partyParticipants(await resolvePartyRoster(this.actor));
  }

  /**
   * EVERY XP AWARD FROM THIS SHEET (3.710.0): the toolbar's, the Encounter
   * tab's and the accomplishments'. The members are resolved once, the GM
   * sees the split, and only on Award is `awardPartyXP` (the existing
   * Chapter 12 workflow, unchanged) given those same members.
   */
  async #awardXP(total, reason) {
    if (!game.user.isGM) {
      ui.notifications?.warn("Only the GM awards experience.");
      return null;
    }
    return runOnce(TRGPartySheet.#running, `${this.actor.uuid}:xp`, async () => {
      const { actors } = await this.#participants();
      const preview = xpAwardPreview(actors, total);
      if (!preview.ok) {
        ui.notifications?.warn(actors.length ? "There is no XP to award." : "The party has no members to award XP to.");
        return null;
      }
      if (!(await confirmXPAward(this.actor, preview, reason))) return null;
      return awardPartyXP(this.actor, preview.xp, reason, { members: actors });
    });
  }

  static async partyAwardXP(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const context = await rewardsContext(this.actor);
    const choice = await chooseXPAward({ encounterTotal: context.summary.total });
    if (choice) await this.#awardXP(choice.xp, choice.reason);
  }

  /** Rest for THIS party: the existing dialog and workflow, given its members. */
  static async partyRest(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:rest`, async () => {
      const participants = await this.#participants();
      if (!participants.actors.length) {
        ui.notifications?.warn(`${this.actor.name} has no members who can rest.`);
        return null;
      }
      return openRestDialog({
        candidates: { actors: participants.actors, scopeNote: partyScopeNote(this.actor.name, "Resting", participants) }
      });
    });
  }

  /** Travel for THIS party: the existing dialog and card, its members' land Speeds. */
  static async partyTravel(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:travel`, async () => {
      const participants = await this.#participants();
      if (!participants.actors.length) {
        ui.notifications?.warn(`${this.actor.name} has no members to travel.`);
        return null;
      }
      return openTravelDialog({
        candidates: { actors: participants.actors, scopeNote: partyScopeNote(this.actor.name, "Travelling with", participants) }
      });
    });
  }

  static async beginSession(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    // ONE AT A TIME (3.710.0): a double-click gives one point, not two.
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:session`, () => beginSession(this.actor));
  }

  /** A creature's count is typed on the Rewards tab, not submitted with the form. */
  _onChangeForm(formConfig, event) {
    // Unnamed inputs, so the form never submits them as actor fields.
    const input = event?.target;
    if (input?.dataset?.encounterCount !== undefined) {
      const uuid = input.closest("[data-creature-uuid]")?.dataset?.creatureUuid;
      if (uuid && game.user.isGM) setEncounterCount(this.actor, uuid, input.value);
      return;
    }
    if (input?.dataset?.customXp !== undefined) return;
    return super._onChangeForm(formConfig, event);
  }

  /* ---------------------------------------------------------------- */
  /* Prompts                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Who receives it.
   *
   * A player with exactly one owned character is not asked — the answer
   * is not in doubt, and a dialog whose only purpose is to be dismissed
   * is friction. Anyone with a choice makes it.
   */
  static async #chooseDestination() {
    const owned = game.actors
      .filter((a) => ["character", "npc"].includes(a.type) && a.isOwner)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!owned.length) {
      ui.notifications?.warn("You do not own a character to give this to.");
      return null;
    }
    if (owned.length === 1) return owned[0];

    const options = owned
      .map((a) => `<option value="${a.uuid}">${a.name}</option>`).join("");
    const uuid = await DialogV2.wait({
      window: { title: "Give To", icon: "fa-solid fa-hand-holding" },
      classes: ["trg-prime"],
      position: { width: 340 },
      content: `<div class="trg-prime trg-check-dialog">
        <div class="form-group stacked"><label>Which character takes this?</label>
        <select name="dest">${options}</select></div></div>`,
      buttons: [
        {
          action: "confirm", label: "Take", icon: "fa-solid fa-check", default: true,
          callback: (e, button) => button.form.elements.dest.value
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!uuid || uuid === "cancel") return null;
    return fromUuid(uuid);
  }

  static async #chooseQuantity(name, max) {
    const value = await DialogV2.wait({
      window: { title: `Take ${name}`, icon: "fa-solid fa-hashtag" },
      classes: ["trg-prime"],
      position: { width: 320 },
      content: `<div class="trg-prime trg-check-dialog">
        <p class="hint">The party has ${max}.</p>
        <div class="form-group"><label>How many?</label>
        <input type="number" name="qty" value="${max}" min="1" max="${max}"></div></div>`,
      buttons: [
        {
          action: "confirm", label: "Take", icon: "fa-solid fa-check", default: true,
          callback: (e, button) => Number(button.form.elements.qty.value) || 0
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!value || value === "cancel") return 0;
    return Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  }

  static async #chooseCoin(pot) {
    const rows = COIN_DENOMINATIONS.map((key) => `
      <div class="form-group"><label>${key.toUpperCase()} <span class="hint">(${pot[key]} available)</span></label>
      <input type="number" name="${key}" value="0" min="0" max="${pot[key]}"></div>`).join("");
    const result = await DialogV2.wait({
      window: { title: "Take Coin", icon: "fa-solid fa-coins" },
      classes: ["trg-prime"],
      position: { width: 340 },
      content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
      buttons: [
        {
          action: "confirm", label: "Take", icon: "fa-solid fa-check", default: true,
          callback: (e, button) => {
            const out = {};
            for (const key of COIN_DENOMINATIONS) {
              out[key] = Number(button.form.elements[key].value) || 0;
            }
            return out;
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return null;
    return result;
  }
}

/**
 * Refuse a player's drag of party loot onto any actor sheet (3.708.0).
 * See `refusePartyLootDrag` in party.mjs for why. Installed once, from the
 * system's init.
 */
let lootDragGuardInstalled = false;
export function registerPartyLootDragGuard() {
  if (lootDragGuardInstalled) return;
  lootDragGuardInstalled = true;
  Hooks.on("dropActorSheetData", (actor, sheet, data) => {
    if (data?.type !== "Item" || !data.uuid) return true;
    let source = null;
    try { source = globalThis.fromUuidSync?.(data.uuid, { strict: false }) ?? null; } catch { source = null; }
    const reason = refusePartyLootDrag({
      sourceParentType: source?.parent?.type,
      targetType: actor?.type,
      isGM: game.user?.isGM === true
    });
    if (!reason) return true;
    ui.notifications?.warn(reason);
    return false;
  });
}

export { PARTY_TYPE };
