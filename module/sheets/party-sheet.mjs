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
  return [...effective].map((id) => {
    const label = CONDITIONS[id]?.label ?? id;
    const value = actor.getConditionValue?.(id);
    // A valued condition without its number is half the information —
    // "Weakened" and "Weakened 3" are different problems.
    return CONDITIONS[id]?.valued && value ? `${label} ${value}` : label;
  }).sort((a, b) => a.localeCompare(b));
}

export class TRGPartySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["trg-prime", "sheet", "actor", "party"],
    position: { width: 760, height: 720, top: 90, left: 110 },
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
      beginSession: TRGPartySheet.beginSession
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
        { id: "roster", icon: "fa-solid fa-users", label: "Roster" },
        { id: "loot", icon: "fa-solid fa-sack-dollar", label: "Loot" },
        // ENCOUNTERS AND REWARDS (3.619.0; Chapter 12, Graham's R2, R6, R8).
        { id: "rewards", icon: "fa-solid fa-trophy", label: "Rewards" }
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
    const members = roster.map((entry) => memberSummary(entry.actor, entry.uuid, conditionLabels, {
      status: entry.status,
      // Graham's ruling: an NPC member's statistics only for a GM or an
      // Observer of that NPC. A player character is always shown.
      restricted: entry.status === MEMBER_STATUS.OK && !canSeeMemberDetails(entry.actor, game.user)
    }));

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

    return {
      ...context,
      actor,
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
    await awardPartyXP(this.actor, context.summary.total, "the encounter");
  }

  static async awardAccomplishment(event, target) {
    event.preventDefault();
    const award = ACCOMPLISHMENT_AWARDS.find((entry) => entry.key === target.dataset.award);
    if (award) await awardPartyXP(this.actor, award.xp, `a ${award.label} accomplishment`);
  }

  static async awardCustomXP(event) {
    event.preventDefault();
    const input = this.element?.querySelector("[data-custom-xp]");
    const amount = Math.floor(Number(input?.value) || 0);
    if (amount > 0) await awardPartyXP(this.actor, amount, "the GM's award");
  }

  static async beginSession(event) {
    event.preventDefault();
    await beginSession(this.actor);
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
