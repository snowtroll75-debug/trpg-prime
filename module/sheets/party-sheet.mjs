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
  PARTY_TYPE, addMember, canJoinRoster, coinIsEmpty, coinLine, isLootItem, lootSummary, memberSummary,
  normaliseCoin, normaliseMembers, planLootDrop, quantityOf, refusePartyLootDrag, removeMember,
  COIN_DENOMINATIONS, LOOT_ITEM_TYPES
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
import { requestTransfer, transferInFlight } from "../party-socket.mjs";
import {
  HOLDER_TYPES, TRANSFER_KINDS, TRANSFER_JOURNAL_FLAG, isPartyMember, itemDetail, journalFinish,
  matchesInventoryFilter, planCoinSplit, readJournal, transferRestriction
} from "../party-transfers.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { coinValueInGP } from "../items.mjs";
import {
  addEncounterCreatures, awardPartyXP, beginSession, encounterCandidates, importEncounterPicks,
  normaliseEncounter, rewardsContext, setEncounterCount
} from "../party-rewards-workflow.mjs";
import {
  difficultyOptions, matchesSkillFilter, planGroupCheck, rollGroupCheck, skillColumns, skillMatrix
} from "../party-skills.mjs";
import { TRGCheck, applyMessageMode } from "../dice/check.mjs";
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
      // THE SHARED INVENTORY AND TREASURY (3.711.0, Stage 4).
      depositItem: TRGPartySheet.depositItem,
      depositCoin: TRGPartySheet.depositCoin,
      splitCoin: TRGPartySheet.splitCoin,
      openLootItem: TRGPartySheet.openLootItem,
      resolveTransfer: TRGPartySheet.resolveTransfer,
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
      partyAwardXP: TRGPartySheet.partyAwardXP,
      // SKILLS, THE GROUP CHECK AND THE ENCOUNTER (3.712.0, Stage 5).
      sortSkills: TRGPartySheet.sortSkills,
      rollMemberSkill: TRGPartySheet.rollMemberSkill,
      groupCheck: TRGPartySheet.groupCheck,
      importCombat: TRGPartySheet.importCombat
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
      scrollable: ['section[data-tab="roster"]', 'section[data-tab="skills"]', '.party-skills-scroll', 'section[data-tab="loot"]', 'section[data-tab="rewards"]', 'section[data-tab="notes"]']
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
        // THE SKILLS PAGE (3.712.0, Stage 5).
        { id: "skills", icon: "fa-solid fa-list-check", label: "Skills" },
        { id: "loot", icon: "fa-solid fa-sack-dollar", label: "Inventory" },
        // ENCOUNTERS AND REWARDS (3.619.0; Chapter 12, Graham's R2, R6, R8).
        { id: "rewards", icon: "fa-solid fa-trophy", label: "Encounter" },
        // THE PARTY'S NOTES (3.712.0, Stage 5): system.details.notes.
        { id: "notes", icon: "fa-solid fa-book-open", label: "Notes" }
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

    // THE INVENTORY PAGE (3.711.0, Stage 4): each row with its type, its
    // details from the item's own fields, and whether this user may open it.
    const typeLabel = (type) => {
      const key = CONFIG.Item?.typeLabels?.[type] ?? `TYPES.Item.${type}`;
      const label = game.i18n?.localize?.(key);
      // An unlocalised key reads as the key itself; show the type instead.
      return label && label !== key ? label : type.charAt(0).toUpperCase() + type.slice(1);
    };
    loot.rows = loot.rows.map((row) => {
      const item = actor.items.get(row.id);
      return {
        ...row,
        uuid: item?.uuid ?? "",
        typeLabel: typeLabel(row.type),
        detail: itemDetail(item),
        canOpen: Boolean(item) && (isGM || item.testUserPermission?.(game.user, "OBSERVER") === true)
      };
    });
    const types = LOOT_ITEM_TYPES
      .filter((type) => loot.rows.some((row) => row.type === type))
      .map((type) => ({ type, label: typeLabel(type), selected: this.#filter.type === type }));

    // WHO MAY RECEIVE OR GIVE, ON THIS CLIENT (Stage 4). The default is the
    // party's own members, the ones this user owns; the GM, all of them.
    // The GM's client checks again when the transfer is carried out.
    const holders = activeMembers(roster).filter((a) => HOLDER_TYPES.includes(a.type));
    const myMembers = holders.filter((a) => isGM || a.isOwner).map((a) => ({ uuid: a.uuid, name: a.name, img: a.img }));
    const pending = isGM ? this.#pendingTransfers() : [];

    const rewards = isGM ? await rewardsContext(actor, { members: activeMembers(roster) }) : null;

    // THE SKILLS PAGE (3.712.0, Stage 5). Each member's prepared skill
    // totals; an NPC this user may not see gives no numbers (Graham's
    // Stage 1 ruling); a modifier is a button only for whoever may roll it.
    const skills = skillMatrix(roster.filter((e) => e.status === MEMBER_STATUS.OK).map((e) => ({
      uuid: e.uuid, name: e.actor.name, img: e.actor.img, actor: e.actor,
      restricted: !canSeeMemberDetails(e.actor, game.user),
      canRoll: isGM || e.actor.isOwner
    })), { sort: this.#skillSort });
    for (const column of skills.columns) column.shown = matchesSkillFilter(column, this.#skillFilter);
    for (const row of skills.rows) row.cells.forEach((cell, i) => { cell.shown = skills.columns[i].shown; });

    // THE NOTES (3.712.0, Stage 5): the party's own field, shared. Graham,
    // 23 Nov 2026: shared notes only, the GM edits and players read. Secret
    // blocks are shown to a GM only.
    const notesRaw = String(system.details?.notes ?? "");
    const notesHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(notesRaw, {
      secrets: isGM, relativeTo: actor, rollData: {}
    });

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
      inventory: {
        types,
        search: this.#filter.search,
        canTake: myMembers.length > 0,
        canDeposit: myMembers.length > 0,
        members: isGM ? myMembers : [],
        pending,
        hasPending: pending.length > 0
      },
      treasury: {
        canDeposit: myMembers.length > 0,
        canTake: !isGM && myMembers.length > 0,
        canGive: isGM && myMembers.length > 0,
        canSplit: isGM && myMembers.length > 0 && !coinIsEmpty(currency)
      },
      rewards,
      skills: { ...skills, filter: this.#skillFilter, empty: skills.rows.length === 0 },
      notes: { raw: notesRaw, html: notesHTML, editable: isGM && this.isEditable, empty: !notesRaw.trim() },
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
    isBusy: () => this.#isBusy(),
    // Wait until the field loses focus, or the Notes editor closes, and is
    // not busy again (3.712.0: focus can move inside the open editor).
    whenIdle: (callback) => {
      const wait = () => {
        const done = () => {
          this.element?.removeEventListener("focusout", done);
          this.element?.removeEventListener("close", done);
          setTimeout(() => (this.#isBusy() ? wait() : callback()), 0);
        };
        this.element?.addEventListener("focusout", done, { once: true });
        this.element?.addEventListener("close", done, { once: true });
      };
      wait();
    }
  });

  /**
   * Typing in one of this sheet's fields, or the Notes editor open (3.712.0):
   * a live render would replace it and lose what was typed.
   */
  #isBusy() {
    const root = this.element;
    if (!root) return false;
    if (root.querySelector("prose-mirror[open], prose-mirror.active")) return true;
    const active = globalThis.document?.activeElement;
    return Boolean(active && root.contains(active)
      && (active.isContentEditable || (active.matches?.("input, textarea, select") && !active.disabled)));
  }

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
    this.#wireInventoryFilter();
    this.#wireSkillFilter();
  }

  /* ---------------------------------------------------------------- */
  /* The Skills page (3.712.0, Stage 5)                               */
  /* ---------------------------------------------------------------- */

  /** The member order and the skill filter, kept across renders. */
  #skillSort = "asc";
  #skillFilter = "";

  /** The skill filter hides columns in place, as the inventory's does rows. */
  #wireSkillFilter() {
    const root = this.element;
    const input = root?.querySelector("[data-skill-filter]");
    if (!input) return;
    const columns = skillColumns();
    const apply = () => {
      this.#skillFilter = input.value ?? "";
      let shown = 0;
      for (const column of columns) {
        const visible = matchesSkillFilter(column, this.#skillFilter);
        if (visible) shown += 1;
        for (const el of root.querySelectorAll(`[data-skill-col="${column.key}"]`)) el.hidden = !visible;
      }
      const none = root.querySelector("[data-skill-none]");
      if (none) none.hidden = shown > 0;
    };
    input.addEventListener("input", apply);
    apply();
  }

  /** Member names, A–Z or Z–A. */
  static async sortSkills(event) {
    event.preventDefault();
    this.#skillSort = this.#skillSort === "asc" ? "desc" : "asc";
    return this.render();
  }

  /**
   * A MODIFIER CLICKED IS THE MEMBER'S OWN ROLL: the character sheet's
   * `rollSkill`, with its action chooser, its check dialog and everything
   * after. Nothing here adds to or works out the check.
   */
  static async rollMemberSkill(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-uuid]")?.dataset?.uuid;
    const key = target.dataset.skill;
    const member = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (!member || !key) {
      ui.notifications?.warn("That member is no longer available.");
      return null;
    }
    if (!game.user.isGM && !member.isOwner) {
      ui.notifications?.warn(`You do not control ${member.name}.`);
      return null;
    }
    const sheet = member.sheet;
    const roll = sheet?.constructor?.rollSkill;
    if (typeof roll !== "function") {
      ui.notifications?.warn(`${member.name}'s sheet has no skill roll.`);
      return null;
    }
    return roll.call(sheet, event, { dataset: { skill: key } });
  }

  /**
   * THE GROUP CHECK (3.712.0, Stage 5; the GM). The skill, the members, a DC
   * and difficulty, and the visibility, chosen in one dialog; then each
   * member's own check through TRGCheck, and a summary in the same
   * visibility. No member is changed by the check itself.
   */
  static async groupCheck(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:groupCheck`, async () => {
      const members = (await this.#participants()).actors;
      if (!members.length) {
        ui.notifications?.warn(`${this.actor.name} has no members to check.`);
        return null;
      }
      const choice = await TRGPartySheet.#chooseGroupCheck(this.actor.name, members);
      if (!choice) return null;
      const plan = planGroupCheck({ ...choice, members: members.filter((a) => choice.uuids.includes(a.uuid)) });
      if (!plan.ok) {
        ui.notifications?.warn(`Group Check: ${plan.reason}.`);
        return null;
      }
      return rollGroupCheck(plan, {
        roll: (config) => TRGCheck.roll(config),
        post: (content, rollMode) => {
          const data = { content, speaker: { alias: this.actor.name } };
          if (rollMode) applyMessageMode(data, rollMode);
          return ChatMessage.create(data);
        },
        partyName: this.actor.name,
        offerConditionals: choice.offerConditionals
      });
    });
  }

  static async #chooseGroupCheck(partyName, members) {
    const skills = skillColumns().map((c) => `<option value="${c.key}">${escape(c.label)}</option>`).join("");
    const ticks = members.map((a) => `<label class="checkbox"><input type="checkbox" name="m" value="${a.uuid}" checked> ${escape(a.name)}</label>`).join("");
    const levels = difficultyOptions().map((d) => `<option value="${d.key}"${d.selected ? " selected" : ""}>${escape(d.label)}</option>`).join("");
    const current = game.settings.get("core", "messageMode");
    const modes = Object.entries(CONFIG.ChatMessage?.modes ?? {}).map(([key, label]) =>
      `<option value="${key}"${key === current ? " selected" : ""}>${escape(game.i18n.localize(label?.label ?? label))}</option>`).join("");
    const result = await DialogV2.wait({
      window: { title: "Group Check", icon: "fa-solid fa-people-group" },
      classes: ["trg-prime"],
      position: { width: 420 },
      content: `<div class="trg-prime trg-check-dialog">
        <p class="hint">Each chosen member of ${escape(partyName)} rolls their own check, with their own modifiers. The rules set no group result: the card lists each one.</p>
        <div class="form-group"><label>Skill</label><select name="skill">${skills}</select></div>
        <div class="form-group stacked"><label>Members</label>${ticks}</div>
        <div class="form-group"><label>DC</label><input type="number" name="dc" placeholder="None" step="1"></div>
        <div class="form-group"><label>Difficulty</label><select name="difficulty">${levels}</select></div>
        <div class="form-group"><label>Visibility</label><select name="rollMode">${modes}</select></div>
        <label class="checkbox"><input type="checkbox" name="offer" checked> Ask about each member's optional bonuses</label>
      </div>`,
      buttons: [
        {
          action: "confirm", label: "Roll", icon: "fa-solid fa-dice-d20", default: true,
          callback: (e, button) => {
            const f = button.form;
            return {
              skill: f.elements.namedItem("skill")?.value,
              uuids: [...f.querySelectorAll('input[name="m"]:checked')].map((i) => i.value),
              dc: f.elements.namedItem("dc")?.value ?? "",
              difficulty: f.elements.namedItem("difficulty")?.value,
              rollMode: f.elements.namedItem("rollMode")?.value,
              offerConditionals: f.elements.namedItem("offer")?.checked === true
            };
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return null;
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* The inventory page (3.711.0, Stage 4)                            */
  /* ---------------------------------------------------------------- */

  /** The search text and type filter, kept across renders. */
  #filter = { search: "", type: "" };

  /**
   * Filtering is done in place, on the rows already drawn, so typing does
   * not re-render the sheet (and lose the cursor). The inputs are unnamed:
   * they never reach the form or the actor.
   */
  #wireInventoryFilter() {
    const root = this.element;
    const search = root?.querySelector("[data-inventory-search]");
    const type = root?.querySelector("[data-inventory-type]");
    if (!search || !type) return;
    const apply = () => {
      this.#filter = { search: search.value ?? "", type: type.value ?? "" };
      let shown = 0;
      for (const row of root.querySelectorAll(".loot-row[data-item-id]")) {
        const visible = matchesInventoryFilter({ name: row.dataset.name, type: row.dataset.type }, this.#filter);
        row.hidden = !visible;
        if (visible) shown += 1;
      }
      const none = root.querySelector("[data-inventory-none]");
      if (none) none.hidden = shown > 0;
    };
    search.addEventListener("input", apply);
    type.addEventListener("change", apply);
    apply();
  }

  /**
   * The journal's transfers that did not finish (Stage 4). One cut off by a
   * disconnect stays pending; it is shown once it is plainly not still
   * running on this client, with what it was meant to do.
   */
  #pendingTransfers() {
    if (transferInFlight(this.actor.uuid)) return [];
    const now = Date.now();
    return readJournal(this.actor).pending
      .filter((p) => p.unresolved || now - (Number(p.at) || 0) > 20000)
      .map((p) => ({
        id: p.id,
        summary: p.summary ?? p.kind,
        user: p.user ?? "",
        when: new Date(Number(p.at) || 0).toLocaleString(),
        unresolved: p.unresolved ?? ""
      }));
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

    if (data?.type === "Item") return this.#onDropItemData(event, data);
    return super._onDrop(event);
  }

  /**
   * AN ITEM DROPPED ON THE PARTY (3.711.0, Stage 4). Where it came from
   * decides what it means:
   *   - from this party, onto a member in the Inventory's member strip: the
   *     GM gives it to that member (a validated withdrawal, never a copy);
   *   - from this party, anywhere else: the GM re-sorts the list;
   *   - from a character or NPC: a DEPOSIT, which moves it (the character
   *     no longer has it). A player may deposit only from a character they
   *     own that is in the party; the GM's client checks that again;
   *   - from the sidebar or a compendium: the GM adds new loot, as before.
   */
  async #onDropItemData(event, data) {
    const item = data?.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
    if (!item) {
      ui.notifications?.warn("That item could not be found.");
      return null;
    }
    const isGM = game.user.isGM === true;
    const holder = item.parent ?? null;

    if (holder?.uuid === this.actor.uuid) {
      const strip = event.target?.closest?.("[data-drop-member]");
      if (strip && isGM) return this.#distribute(item, strip.dataset.dropMember);
      if (!isGM) return null;
      return super._onDropItem(event, item);
    }

    if (holder?.documentName === "Actor") {
      if (!isGM && !holder.isOwner) {
        ui.notifications?.warn("You can only deposit from a character you own.");
        return null;
      }
      return this.#transferOnce(async () => {
        const quantity = await TRGPartySheet.#chooseQuantity(item.name, quantityOf(item), "Deposit");
        if (!quantity) return null;
        return requestTransfer({ kind: TRANSFER_KINDS.DEPOSIT, partyUuid: this.actor.uuid, itemUuid: item.uuid, quantity });
      });
    }

    if (!isGM) {
      ui.notifications?.warn("Only the GM can add new loot. Deposit from your character instead.");
      return null;
    }
    const allowed = Hooks.call("dropActorSheetData", this.actor, this, data);
    if (allowed === false) return null;
    return this._onDropItem(event, item);
  }

  /** The GM gives a party item to a member by dragging it onto them. */
  async #distribute(item, memberUuid) {
    return this.#transferOnce(async () => {
      const member = await fromUuid(memberUuid).catch(() => null);
      if (!member) {
        ui.notifications?.warn("That member is no longer available.");
        return null;
      }
      const quantity = await TRGPartySheet.#chooseQuantity(item.name, quantityOf(item), `Give to ${member.name}`);
      if (!quantity) return null;
      return requestTransfer({
        kind: TRANSFER_KINDS.WITHDRAW, partyUuid: this.actor.uuid, itemUuid: item.uuid,
        quantity, destUuid: member.uuid, origin: "drag"
      });
    });
  }

  /**
   * ONE TRANSFER AT A TIME FROM THIS SHEET (Stage 4): the dialogs and the
   * request, together, hold the party's transfer lock, so a second click
   * or a second drop while one is open does nothing.
   */
  #transferOnce(work) {
    return runOnce(TRGPartySheet.#running, `${this.actor.uuid}:transfer`, work);
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

  /**
   * DROPS ARE HEARD FROM EVERYONE (3.711.1, found live on 3.711.0). Foundry
   * lets only those who can edit a sheet drop on it, and a player has
   * Observer on the party, so a player's drag-to-deposit was silently
   * ignored. `_onDrop` decides what each drop may do, for whom: a player's
   * actor drop is refused, a player's item drop is a deposit through the
   * GM's client, which checks it again.
   */
  _canDragDrop(selector) {
    return true;
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

  /**
   * TAKE (a player) or GIVE (the GM) an item from the party (3.711.0): to
   * one of the party's members, the whole stack or part of it. The GM may
   * choose someone outside the party, explicitly, in the same chooser.
   */
  static async takeItem(event, target) {
    event.preventDefault();
    const id = target.closest("[data-item-id]")?.dataset?.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (!item) return;
    await this.#transferOnce(async () => {
      const destination = await this.#chooseDestination(game.user.isGM ? `Give ${item.name}` : `Take ${item.name}`);
      if (!destination) return null;
      const have = quantityOf(item);
      const quantity = have > 1 ? await TRGPartySheet.#chooseQuantity(item.name, have, game.user.isGM ? "Give" : "Take") : have;
      if (!quantity) return null;
      return requestTransfer({
        kind: TRANSFER_KINDS.WITHDRAW, partyUuid: this.actor.uuid, itemUuid: item.uuid,
        quantity, destUuid: destination.actor.uuid, override: destination.override
      });
    });
  }

  /** DEPOSIT an item (3.711.0): from a member's own inventory into the party's. */
  static async depositItem(event) {
    event.preventDefault();
    await this.#transferOnce(async () => {
      const item = await this.#chooseDepositItem();
      if (!item) return null;
      const have = quantityOf(item);
      const quantity = have > 1 ? await TRGPartySheet.#chooseQuantity(item.name, have, "Deposit") : have;
      if (!quantity) return null;
      return requestTransfer({ kind: TRANSFER_KINDS.DEPOSIT, partyUuid: this.actor.uuid, itemUuid: item.uuid, quantity });
    });
  }

  /** TAKE COIN (a player) or GIVE COIN (the GM) from the treasury. */
  static async takeCoin(event) {
    event.preventDefault();
    await this.#transferOnce(async () => {
      const destination = await this.#chooseDestination(game.user.isGM ? "Give Coin" : "Take Coin");
      if (!destination) return null;
      const coin = await TRGPartySheet.#chooseCoin(normaliseCoin(this.actor.system.currency), {
        title: game.user.isGM ? `Give Coin to ${destination.actor.name}` : "Take Coin", verb: game.user.isGM ? "Give" : "Take", from: this.actor.name
      });
      if (!coin) return null;
      return requestTransfer({
        kind: TRANSFER_KINDS.COIN_TAKE, partyUuid: this.actor.uuid, coin,
        destUuid: destination.actor.uuid, override: destination.override
      });
    });
  }

  /** DEPOSIT COIN from a member's purse into the treasury. */
  static async depositCoin(event) {
    event.preventDefault();
    await this.#transferOnce(async () => {
      const source = await this.#chooseMember("Deposit Coin", "Whose coin goes into the treasury?");
      if (!source) return null;
      const coin = await TRGPartySheet.#chooseCoin(normaliseCoin(source.system?.currency), {
        title: `Deposit Coin from ${source.name}`, verb: "Deposit", from: source.name
      });
      if (!coin) return null;
      return requestTransfer({ kind: TRANSFER_KINDS.COIN_DEPOSIT, partyUuid: this.actor.uuid, coin, sourceUuid: source.uuid });
    });
  }

  /**
   * SPLIT COIN (the GM; Graham, 23 Nov 2026). The proposed shares are shown
   * before anything moves; what does not divide stays in the treasury. The
   * shares shown travel with the request, so a treasury that changed since
   * is refused rather than split differently from what the GM saw.
   */
  static async splitCoin(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await this.#transferOnce(async () => {
      const members = (await this.#participants()).actors.filter((a) => HOLDER_TYPES.includes(a.type));
      const choice = await TRGPartySheet.#chooseSplit(normaliseCoin(this.actor.system.currency), members);
      if (!choice) return null;
      return requestTransfer({
        kind: TRANSFER_KINDS.COIN_SPLIT, partyUuid: this.actor.uuid, recipients: choice.recipients, coin: choice.share
      });
    });
  }

  /**
   * THE GM DRAGS PARTY LOOT ONTO A CHARACTER'S OWN SHEET (3.711.0). That
   * used to create a copy (the default drop) and leave the party's. It is
   * now the same validated withdrawal as the Give button: the item moves.
   * Onto someone outside the party, the GM is asked first (the override).
   */
  static async distributeByDrag(item, actor) {
    const party = item?.parent;
    if (!party || party.type !== PARTY_TYPE || !actor) return null;
    return runOnce(TRGPartySheet.#running, `${party.uuid}:transfer`, async () => {
      let override = false;
      if (!isPartyMember(party, actor)) {
        const ok = await DialogV2.confirm({
          window: { title: "Outside the Party" },
          content: `<p>${escape(actor.name)} is not in ${escape(party.name)}. Give ${escape(item.name)} to them anyway?</p>`,
          rejectClose: false
        });
        if (!ok) return null;
        override = true;
      }
      const quantity = await TRGPartySheet.#chooseQuantity(item.name, quantityOf(item), `Give to ${actor.name}`);
      if (!quantity) return null;
      return requestTransfer({
        kind: TRANSFER_KINDS.WITHDRAW, partyUuid: party.uuid, itemUuid: item.uuid,
        quantity, destUuid: actor.uuid, override, origin: "drag"
      });
    });
  }

  /** Open a party item's own sheet, where this user may see it. */
  static async openLootItem(event, target) {
    event.preventDefault();
    const id = target.closest("[data-item-id]")?.dataset?.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (!item) return;
    if (!game.user.isGM && item.testUserPermission?.(game.user, "OBSERVER") !== true) {
      ui.notifications?.warn("You cannot open that item.");
      return;
    }
    item.sheet?.render(true);
  }

  /**
   * The GM marks an unfinished transfer as checked (Stage 4). Nothing is
   * moved: the GM has looked at both inventories and put them right by hand.
   */
  static async resolveTransfer(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const id = target.closest("[data-transfer-id]")?.dataset?.transferId;
    if (!id) return;
    const ok = await DialogV2.confirm({
      window: { title: "Unfinished Transfer" },
      content: "<p>Mark this transfer as checked? Nothing is moved: do this once both inventories are right.</p>",
      rejectClose: false
    });
    if (!ok) return;
    await this.actor.update({ [`flags.${SYSTEM_ID}.${TRANSFER_JOURNAL_FLAG}`]: journalFinish(readJournal(this.actor), id) });
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
  /**
   * ADD SELECTED TOKENS (3.619.0; improved 3.712.0, Stage 5). Through the
   * same import as a combat: a party member is never offered, each creature
   * is counted once per token and once only, and the GM sees the list first.
   */
  static async addSelectedTokens(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const tokens = (canvas?.tokens?.controlled ?? []).map((t) => t.document).filter(Boolean);
    if (!tokens.length) {
      ui.notifications?.warn("Select the adversaries' tokens first.");
      return;
    }
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:encounter`, () => this.#importSources(
      tokens.map((token) => ({ tokenUuid: token.uuid, token, name: token.name, hidden: token.hidden, defeated: false })),
      "Add Selected Tokens"
    ));
  }

  /**
   * IMPORT A COMBAT (3.712.0, Stage 5): the active combat, or another
   * chosen from the world's combats; its combatants, as the import list.
   * Nothing in the combat, the scene or the world is changed.
   */
  static async importCombat(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:encounter`, async () => {
      const combats = Array.from(game.combats ?? []);
      if (!combats.length) {
        ui.notifications?.warn("There is no combat to import.");
        return null;
      }
      let combat = game.combat ?? combats[0];
      if (combats.length > 1) {
        const options = combats.map((c) => `<option value="${c.id}"${c.id === combat?.id ? " selected" : ""}>${escape(c.scene?.name ?? "No scene")} — ${c.combatants.size} combatant${c.combatants.size === 1 ? "" : "s"}${c.active ? " (active)" : ""}</option>`).join("");
        const id = await DialogV2.wait({
          window: { title: "Import Combat", icon: "fa-solid fa-shield-halved" },
          classes: ["trg-prime"],
          position: { width: 380 },
          content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked"><label>Which combat?</label><select name="combat">${options}</select></div></div>`,
          buttons: [
            { action: "confirm", label: "Choose", icon: "fa-solid fa-check", default: true, callback: (e, button) => button.form.elements.namedItem("combat")?.value },
            { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
          ],
          rejectClose: false
        });
        if (!id || id === "cancel") return null;
        combat = game.combats.get(id);
      }
      if (!combat) return null;
      const sources = Array.from(combat.combatants ?? []).map((c) => ({
        tokenUuid: c.token?.uuid ?? `Combatant.${c.id}`,
        token: c.token ?? null,
        name: c.name,
        hidden: c.hidden === true || c.token?.hidden === true,
        defeated: c.isDefeated === true
      }));
      return this.#importSources(sources, "Import Combat");
    });
  }

  /** The import list, the GM's ticks, and the write. */
  async #importSources(sources, title) {
    const encounter = normaliseEncounter(this.actor.system?.encounter);
    const { rows, missing } = encounterCandidates(sources, {
      members: normaliseMembers(this.actor.system?.members), encounter,
      friendly: CONST.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1
    });
    if (!rows.length) {
      ui.notifications?.warn(missing.length ? `Nothing to import: ${missing.length} token${missing.length === 1 ? " is" : "s are"} missing.` : "Nothing to import: every token is a party member.");
      return null;
    }
    const list = rows.map((r, i) => `<label class="checkbox party-import-row"><input type="checkbox" name="r" value="${i}"${r.ticked ? " checked" : ""}${r.blocked ? " disabled" : ""}>
      ${r.img ? `<img src="${escape(r.img)}" alt="">` : ""} ${escape(r.name)}${r.hidden ? ' <i class="fa-solid fa-eye-slash" data-tooltip="Hidden"></i>' : ""}
      ${r.reasons.length ? `<span class="hint">(${escape(r.reasons.join("; "))})</span>` : ""}</label>`).join("");
    const picked = await DialogV2.wait({
      window: { title, icon: "fa-solid fa-dragon" },
      classes: ["trg-prime"],
      position: { width: 440 },
      content: `<div class="trg-prime trg-check-dialog">
        <p class="hint">Party members are left out. Defeated and friendly start unticked. A creature already imported from the same token is not counted again.</p>
        <div class="form-group stacked">${list}</div>
        ${missing.length ? `<p class="hint">Skipped, no longer on the scene: ${escape(missing.join(", "))}.</p>` : ""}</div>`,
      buttons: [
        { action: "confirm", label: "Import", icon: "fa-solid fa-check", default: true, callback: (e, button) => [...button.form.querySelectorAll('input[name="r"]:checked')].map((i) => Number(i.value)) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!Array.isArray(picked) || !picked.length) return null;
    const result = await importEncounterPicks(this.actor, picked.map((i) => rows[i]).filter(Boolean));
    ui.notifications?.info(`Encounter: ${result.added} added${result.skipped ? `, ${result.skipped} already counted` : ""}.`);
    return result;
  }

  static async removeEncounterCreature(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const uuid = target.closest("[data-creature-uuid]")?.dataset?.creatureUuid;
    if (uuid) await setEncounterCount(this.actor, uuid, 0);
  }

  /**
   * CLEAR (3.712.0: asked first). The party's list only: no actor, token or
   * combat is deleted.
   */
  static async clearEncounter(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const ok = await DialogV2.confirm({
      window: { title: "Clear Encounter" },
      content: "<p>Remove every adversary from this party's encounter list? No actor, token or combat is deleted.</p>",
      rejectClose: false
    });
    if (!ok) return;
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
    return runOnce(TRGPartySheet.#running, `${this.actor.uuid}:xp`, () => this.#awardXPNow(total, reason));
  }

  /** The preview, the confirmation and the award, already inside the party's XP lock. */
  async #awardXPNow(total, reason) {
    const { actors } = await this.#participants();
    const preview = xpAwardPreview(actors, total);
    if (!preview.ok) {
      ui.notifications?.warn(actors.length ? "There is no XP to award." : "The party has no members to award XP to.");
      return null;
    }
    if (!(await confirmXPAward(this.actor, preview, reason))) return null;
    return awardPartyXP(this.actor, preview.xp, reason, { members: actors });
  }

  /**
   * The toolbar's Award XP. The WHOLE of it, choosing included, holds the
   * party's XP lock (fixed 3.710.1, found live): a second press while the
   * chooser or the confirmation is open does nothing, rather than opening
   * a second chooser.
   */
  static async partyAwardXP(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:xp`, async () => {
      const context = await rewardsContext(this.actor);
      const choice = await chooseXPAward({ encounterTotal: context.summary.total });
      return choice ? this.#awardXPNow(choice.xp, choice.reason) : null;
    });
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

  /**
   * ONE FIELD CHANGED, ONE FIELD WRITTEN (3.712.0, Stage 5). The sheet
   * submits on change, and a whole-form submit sends every field as the
   * sheet last drew it. With the Notes editor open, live renders wait (they
   * would lose the typing), so the drawn treasury could be stale: saving the
   * notes would then write the old coin back over a transfer made meanwhile.
   * A change submits only the field that changed.
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const name = event?.type === "change" ? event.target?.name : null;
    if (!name || !foundry.utils.hasProperty(data, name)) return data;
    return foundry.utils.expandObject({ [name]: foundry.utils.getProperty(data, name) });
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
    if (input?.dataset?.inventorySearch !== undefined || input?.dataset?.inventoryType !== undefined) return;
    if (input?.dataset?.skillFilter !== undefined) return;
    return super._onChangeForm(formConfig, event);
  }

  /* ---------------------------------------------------------------- */
  /* Prompts                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * WHO RECEIVES IT (3.711.0, Stage 4). The party's members this user owns
   * (the GM: all of them). A player with one such character is not asked.
   * The GM may pick someone outside the party from a separate, labelled
   * group: that is the explicit override, and it says so on the card.
   *
   * @returns {Promise<{actor: object, override: boolean}|null>}
   */
  async #chooseDestination(title) {
    const isGM = game.user.isGM === true;
    const members = (await this.#participants()).actors
      .filter((a) => HOLDER_TYPES.includes(a.type) && (isGM || a.isOwner))
      .sort((a, b) => a.name.localeCompare(b.name));
    const outside = isGM
      ? game.actors.filter((a) => HOLDER_TYPES.includes(a.type) && !isPartyMember(this.actor, a)).sort((a, b) => a.name.localeCompare(b.name))
      : [];
    if (!members.length && !outside.length) {
      ui.notifications?.warn(isGM ? "There is no one to give this to." : `You have no character in ${this.actor.name}.`);
      return null;
    }
    if (!isGM && members.length === 1) return { actor: members[0], override: false };

    const option = (a, override) => `<option value="${a.uuid}" data-override="${override}">${escape(a.name)}</option>`;
    const options = members.map((a) => option(a, false)).join("")
      + (outside.length ? `<optgroup label="Outside the party (GM)">${outside.map((a) => option(a, true)).join("")}</optgroup>` : "");
    const picked = await DialogV2.wait({
      window: { title, icon: "fa-solid fa-hand-holding" },
      classes: ["trg-prime"],
      position: { width: 360 },
      content: `<div class="trg-prime trg-check-dialog">
        <div class="form-group stacked"><label>Which character receives it?</label>
        <select name="dest">${options}</select></div></div>`,
      buttons: [
        {
          action: "confirm", label: "Choose", icon: "fa-solid fa-check", default: true,
          callback: (e, button) => {
            const select = button.form.elements.dest;
            return { uuid: select.value, override: select.selectedOptions[0]?.dataset.override === "true" };
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!picked?.uuid) return null;
    const actor = await fromUuid(picked.uuid).catch(() => null);
    return actor ? { actor, override: picked.override && isGM } : null;
  }

  /** One of the party's members this user may act for (the GM: any). */
  async #chooseMember(title, question) {
    const isGM = game.user.isGM === true;
    const members = (await this.#participants()).actors
      .filter((a) => HOLDER_TYPES.includes(a.type) && (isGM || a.isOwner))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!members.length) {
      ui.notifications?.warn(`You have no character in ${this.actor.name}.`);
      return null;
    }
    if (members.length === 1) return members[0];
    const uuid = await DialogV2.wait({
      window: { title, icon: "fa-solid fa-user" },
      classes: ["trg-prime"],
      position: { width: 340 },
      content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked"><label>${question}</label>
        <select name="who">${members.map((a) => `<option value="${a.uuid}">${escape(a.name)}</option>`).join("")}</select></div></div>`,
      buttons: [
        { action: "confirm", label: "Choose", icon: "fa-solid fa-check", default: true, callback: (e, button) => button.form.elements.who.value },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!uuid || uuid === "cancel") return null;
    return members.find((a) => a.uuid === uuid) ?? null;
  }

  /** Which item to deposit, from the members this user may act for. */
  async #chooseDepositItem() {
    const isGM = game.user.isGM === true;
    const members = (await this.#participants()).actors
      .filter((a) => HOLDER_TYPES.includes(a.type) && (isGM || a.isOwner))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!members.length) {
      ui.notifications?.warn(`You have no character in ${this.actor.name}.`);
      return null;
    }
    const groups = members.map((a) => {
      const items = Array.from(a.items ?? []).filter((i) => isLootItem(i) && quantityOf(i) > 0 && !transferRestriction(i))
        .sort((x, y) => x.name.localeCompare(y.name));
      return { actor: a, items };
    }).filter((g) => g.items.length);
    if (!groups.length) {
      ui.notifications?.warn("None of your characters carries anything the party inventory holds.");
      return null;
    }
    const options = groups.map((g) => `<optgroup label="${escape(g.actor.name)}">${g.items.map((i) =>
      `<option value="${i.uuid}">${escape(i.name)}${quantityOf(i) > 1 ? ` (${quantityOf(i)})` : ""}${i.system?.equipped ? " — equipped" : ""}</option>`).join("")}</optgroup>`).join("");
    const uuid = await DialogV2.wait({
      window: { title: "Deposit Item", icon: "fa-solid fa-box-archive" },
      classes: ["trg-prime"],
      position: { width: 380 },
      content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked"><label>Which item goes into ${escape(this.actor.name)}'s inventory?</label>
        <select name="depositItem">${options}</select></div>
        <p class="hint">It moves: the character no longer carries it.</p></div>`,
      buttons: [
        // NOT `elements.item`: that is the collection's own item() method,
        // so the choice read as undefined and nothing was deposited (found
        // live on 3.711.0).
        { action: "confirm", label: "Choose", icon: "fa-solid fa-check", default: true, callback: (e, button) => button.form.elements.namedItem("depositItem")?.value },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!uuid || uuid === "cancel") return null;
    return groups.flatMap((g) => g.items).find((i) => i.uuid === uuid) ?? null;
  }

  static async #chooseQuantity(name, max, verb = "Take") {
    if (max <= 1) return max;
    const value = await DialogV2.wait({
      window: { title: `${verb}: ${name}`, icon: "fa-solid fa-hashtag" },
      classes: ["trg-prime"],
      position: { width: 320 },
      content: `<div class="trg-prime trg-check-dialog">
        <p class="hint">There ${max === 1 ? "is" : "are"} ${max}.</p>
        <div class="form-group"><label>How many?</label>
        <input type="number" name="qty" value="${max}" min="1" max="${max}" step="1"></div></div>`,
      buttons: [
        {
          action: "confirm", label: verb.split(":")[0].split(" ")[0], icon: "fa-solid fa-check", default: true,
          callback: (e, button) => Number(button.form.elements.qty.value) || 0
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!value || value === "cancel") return 0;
    // NOT CLAMPED. A number above what is there is passed on and refused
    // with the reason, rather than quietly turned into "all of it".
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  static async #chooseCoin(pot, { title = "Take Coin", verb = "Take", from = "" } = {}) {
    const rows = COIN_DENOMINATIONS.map((key) => `
      <div class="form-group"><label>${key.toUpperCase()} <span class="hint">(${pot[key]} ${from ? `with ${escape(from)}` : "available"})</span></label>
      <input type="number" name="${key}" value="0" min="0" max="${pot[key]}" step="1"></div>`).join("");
    const result = await DialogV2.wait({
      window: { title, icon: "fa-solid fa-coins" },
      classes: ["trg-prime"],
      position: { width: 340 },
      content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
      buttons: [
        {
          action: "confirm", label: verb, icon: "fa-solid fa-check", default: true,
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
    if (coinIsEmpty(result)) {
      ui.notifications?.warn("No coin was chosen.");
      return null;
    }
    return result;
  }

  /**
   * The Split Coin preview. Every member is ticked to begin with; the
   * shares and what stays in the treasury are worked out by planCoinSplit,
   * the same function the GM's client runs, as the ticks change.
   */
  static async #chooseSplit(pot, members) {
    if (!members.length) {
      ui.notifications?.warn("The party has no members to share coin with.");
      return null;
    }
    const ticks = members.map((a) => `<label class="checkbox"><input type="checkbox" name="r" value="${a.uuid}" data-name="${escape(a.name)}" checked> ${escape(a.name)}</label>`).join("");
    const preview = (form) => {
      const chosen = [...form.querySelectorAll('input[name="r"]:checked')].map((i) => ({ uuid: i.value, name: i.dataset.name }));
      const plan = planCoinSplit({ pot, recipients: chosen });
      const out = form.querySelector("[data-split-preview]");
      if (!out) return plan;
      out.innerHTML = plan.ok
        ? `<p>Each of the ${chosen.length} receives <strong>${coinLine(plan.share)}</strong>.</p>`
          + `<p>Shared out: ${coinLine(plan.distributed)}.</p>`
          + `<p>${coinIsEmpty(plan.remainder) ? "Nothing is left over." : `Stays in the treasury: <strong>${coinLine(plan.remainder)}</strong>.`}</p>`
        : `<p class="hint">${escape(plan.reason)}.</p>`;
      const button = form.querySelector('button[data-action="confirm"]');
      if (button) button.disabled = !plan.ok;
      return plan;
    };
    const result = await DialogV2.wait({
      window: { title: "Split Coin", icon: "fa-solid fa-scale-balanced" },
      classes: ["trg-prime"],
      position: { width: 400 },
      content: `<div class="trg-prime trg-check-dialog">
        <p>The treasury holds ${coinLine(pot) || "no coin"}. Each kind of coin is shared on its own; what does not divide stays in the treasury.</p>
        <div class="form-group stacked"><label>Share among</label>${ticks}</div>
        <div data-split-preview></div></div>`,
      render: (event, dialog) => {
        const form = dialog.element.querySelector("form") ?? dialog.element;
        form.addEventListener("change", () => preview(form));
        preview(form);
      },
      buttons: [
        {
          action: "confirm", label: "Split", icon: "fa-solid fa-check", default: true,
          callback: (e, button) => {
            const plan = preview(button.form);
            if (!plan.ok) return null;
            return { recipients: plan.allocations.map((a) => a.uuid), share: plan.share };
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

/** Text going into dialog markup. */
function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    // THE GM'S DRAG IS A MOVE (3.711.0, Stage 4), not Foundry's copy.
    if (game.user?.isGM === true && source?.parent?.type === PARTY_TYPE
      && actor?.type !== PARTY_TYPE && HOLDER_TYPES.includes(actor?.type)) {
      TRGPartySheet.distributeByDrag(source, actor).catch((error) => console.error("TRG Prime | party drag", error));
      return false;
    }
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
