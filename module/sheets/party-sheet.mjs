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
  normaliseCoin, normaliseMembers, removeMember, COIN_DENOMINATIONS
} from "../party.mjs";
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
      selectTab: TRGPartySheet.selectTab,
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
    form: { template: "systems/trg-prime/templates/actor/party-sheet.hbs" }
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

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system ?? {};
    const isGM = game.user?.isGM === true;

    // The roster, resolved now. `fromUuid` is async, so this is the one
    // place the sheet awaits anything.
    const uuids = normaliseMembers(system.members);
    const members = [];
    for (const uuid of uuids) {
      let member = null;
      try { member = await fromUuid(uuid); } catch { member = null; }
      members.push(memberSummary(member, uuid, conditionLabels));
    }

    const loot = lootSummary(Array.from(actor.items ?? []));
    const currency = normaliseCoin(system.currency);

    // Which of MY characters a take would go to. A player with one
    // character never sees a chooser; a GM, or a player with several,
    // picks. Built here because the template must not do lookups.
    const destinations = game.actors
      .filter((a) => ["character", "npc"].includes(a.type) && a.isOwner)
      .map((a) => ({ uuid: a.uuid, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...context,
      actor,
      system,
      isGM,
      members,
      memberCount: members.filter((m) => !m.missing).length,
      hasMembers: members.length > 0,
      loot,
      currency,
      coinKeys: COIN_DENOMINATIONS,
      currencyGP: coinValueInGP(currency),
      destinations,
      hasDestination: destinations.length > 0,
      rewards: await rewardsContext(actor),
      tabs: this._prepareTabs("primary"),
      tabList: Object.values(this._prepareTabs("primary"))
    };
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

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Tab switching, kept identical to the actor sheet's so the two
   * behave the same way under the same CSS.
   */
  static selectTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (!tab) return;
    const group = target.dataset.group ?? "primary";
    const elements = this.element?.querySelectorAll(`[data-group="${group}"][data-tab]`);
    if (!elements?.length) throw new Error(`TRG Prime | No elements for tab group "${group}"`);

    let button = false;
    let panel = false;
    for (const el of elements) {
      const selected = el.dataset.tab === tab;
      el.classList.toggle("active", selected);
      if (el.matches('[role="tab"]')) {
        el.setAttribute("aria-selected", String(selected));
        el.tabIndex = selected ? 0 : -1;
        if (selected) button = true;
      }
      if (el.classList.contains("sheet-tab-panel")) {
        el.setAttribute("aria-hidden", String(!selected));
        if (selected) panel = true;
      }
    }
    // LOUD, exactly as the actor sheet's own selectTab is. A tab button
    // whose panel is missing (or misnamed) otherwise just does nothing
    // when clicked, which is the hardest kind of bug to report.
    if (!button || !panel) {
      throw new Error(`TRG Prime | No matching tab button and panel for "${group}"/"${tab}"`);
    }
    this.tabGroups[group] = tab;
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

export { PARTY_TYPE };
