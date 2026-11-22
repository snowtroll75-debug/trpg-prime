/**
 * LIVE PARTY SHEETS (Party Sheet V2, Stage 1; 3.708.0).
 *
 * A Party sheet shows numbers it reads from OTHER actors (its members, and
 * on the GM's Rewards tab its adversaries). Foundry re-renders a sheet
 * when its own document changes, not when a document it merely reads
 * from changes, so before 3.708.0 a member taking damage left every open
 * Party sheet showing the old hit points until someone closed and
 * reopened it.
 *
 * HOW. One registry, shared by every open Party sheet:
 *
 *   sheet → the document UUIDs it last rendered from
 *   UUID  → the sheets that rendered from it
 *
 * A sheet tells the registry its UUIDs after each render, and leaves when
 * it closes. The registry holds ONE set of Foundry hooks however many
 * sheets are open. They are installed when the first sheet starts watching
 * and removed when the last one leaves, so a world with no Party sheet
 * open pays nothing. A document change looks its actor's UUID up in the
 * index: an actor no open sheet shows costs one map lookup and renders
 * nothing.
 *
 * WHAT COUNTS AS A CHANGE TO A MEMBER: the actor itself (HP, PP, level,
 * class, name, portrait, anything prepared from them), the items it holds
 * and the effects on it or on those items (conditions, equipped armour),
 * its creation or deletion, and the deletion of the token whose actor it
 * is. All of these reach the actor's own UUID, so nothing here needs to
 * know which fields the sheet prints.
 *
 * NOTHING IS STORED. The registry holds UUIDs and sheet references, never
 * a copy of anything a member has. A notified sheet re-renders and reads
 * the members again.
 *
 * NO LOOPS. A render reads documents and never writes one, and a sheet is
 * notified only by a document change, so a render cannot cause the next
 * render. Bursts are coalesced: one change or twenty in the same moment
 * give one render per sheet (RenderCoalescer, below).
 *
 * Pure: the hooks API and the timers are injected, so the harness drives
 * every path with fakes.
 */

/** The Foundry hook events that can change what a Party sheet shows. */
export const PARTY_SYNC_EVENTS = Object.freeze([
  "createActor", "updateActor", "deleteActor",
  "createItem", "updateItem", "deleteItem",
  "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
  "createToken", "deleteToken"
]);

/**
 * The actor a changed document belongs to, or null.
 *
 * An item's parent is its actor. An effect's parent is an actor, or an
 * item whose parent is the actor. Anything else (a world item, an effect
 * on a world item) belongs to no actor, so no Party sheet cares.
 */
export function owningActor(document) {
  let current = document;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.documentName === "Actor") return current;
    current = current.parent ?? null;
  }
  return null;
}

/**
 * The options argument of a hook call, by event. An update hook passes
 * (document, changes, options, userId); a create or delete hook passes
 * (document, options, userId).
 */
function hookOptions(event, args) {
  return (event.startsWith("update") ? args[2] : args[1]) ?? {};
}

export class PartyLiveSync {
  /** @type {Map<object, Set<string>>} */
  #keysBySheet = new Map();

  /** @type {Map<string, Set<object>>} */
  #sheetsByKey = new Map();

  /** @type {Array<[string, number]>|null} */
  #hookIds = null;

  #hooks;

  /**
   * @param {{on: (event: string, fn: Function) => number, off: (event: string, id: number) => void}} hooks
   */
  constructor(hooks) {
    this.#hooks = hooks;
  }

  /** How many sheets are watching. */
  get sheetCount() {
    return this.#keysBySheet.size;
  }

  /** How many hooks this registry has installed (0 or PARTY_SYNC_EVENTS.length). */
  get hookCount() {
    return this.#hookIds?.length ?? 0;
  }

  /** The sheets that last rendered from this UUID. */
  sheetsFor(key) {
    return new Set(this.#sheetsByKey.get(String(key ?? "")) ?? []);
  }

  /**
   * Replace a sheet's watched UUIDs with these. Called after every render,
   * so a member added or removed is picked up by the next render without
   * any bookkeeping of its own.
   *
   * @param {object} sheet Anything with an `onPartyDocumentChanged()` method.
   * @param {Iterable<string>} keys
   */
  watch(sheet, keys) {
    this.#forget(sheet);
    const set = new Set();
    for (const key of keys ?? []) {
      const k = String(key ?? "").trim();
      if (k) set.add(k);
    }
    this.#keysBySheet.set(sheet, set);
    for (const key of set) {
      if (!this.#sheetsByKey.has(key)) this.#sheetsByKey.set(key, new Set());
      this.#sheetsByKey.get(key).add(sheet);
    }
    this.#install();
  }

  /** The sheet closed: forget it, and take the hooks down if it was the last. */
  unwatch(sheet) {
    this.#forget(sheet);
    this.#keysBySheet.delete(sheet);
    if (this.#keysBySheet.size === 0) this.#uninstall();
  }

  /**
   * A document changed. Tell every sheet that rendered from it.
   * Exported through the hooks, and called directly by the harness.
   *
   * @returns {number} how many sheets were told
   */
  handle(event, document, ...rest) {
    if (hookOptions(event, [document, ...rest]).render === false) return 0;
    const told = new Set();
    const tell = (key) => {
      for (const sheet of this.#sheetsByKey.get(key) ?? []) told.add(sheet);
    };

    if (event === "createToken" || event === "deleteToken") {
      // The token's actor is "<token uuid>.Actor.<id>"; a roster that names
      // an unlinked token's actor loses it when the token goes.
      const prefix = `${document?.uuid ?? ""}.Actor.`;
      if (document?.uuid) {
        for (const key of this.#sheetsByKey.keys()) if (key.startsWith(prefix)) tell(key);
      }
    } else {
      const actor = owningActor(document);
      if (actor?.uuid) tell(actor.uuid);
    }

    for (const sheet of told) {
      try {
        sheet.onPartyDocumentChanged?.(event);
      } catch (error) {
        console.error("TRG Prime | party sheet live update", error);
      }
    }
    return told.size;
  }

  #forget(sheet) {
    for (const key of this.#keysBySheet.get(sheet) ?? []) {
      const sheets = this.#sheetsByKey.get(key);
      sheets?.delete(sheet);
      if (sheets && !sheets.size) this.#sheetsByKey.delete(key);
    }
    this.#keysBySheet.set(sheet, new Set());
  }

  #install() {
    if (this.#hookIds || !this.#hooks) return;
    this.#hookIds = PARTY_SYNC_EVENTS.map((event) => [
      event, this.#hooks.on(event, (...args) => this.handle(event, ...args))
    ]);
  }

  #uninstall() {
    if (!this.#hookIds) return;
    for (const [event, id] of this.#hookIds) this.#hooks.off(event, id);
    this.#hookIds = null;
  }
}

/**
 * Many requests, one render.
 *
 * A request starts a short timer; requests during it are absorbed. When it
 * fires, the sheet renders, unless:
 *   - it has closed (nothing to do), or
 *   - the user is typing in one of its fields. A render would replace the
 *     field and lose what they typed, so the render waits until focus
 *     leaves the field, and then happens once.
 */
export class RenderCoalescer {
  #timer = null;
  #waitingForIdle = false;
  #deps;

  /**
   * @param {object} deps
   * @param {() => void} deps.render
   * @param {() => boolean} deps.isRendered
   * @param {() => boolean} [deps.isBusy]
   * @param {(callback: () => void) => void} [deps.whenIdle]
   * @param {(fn: () => void, ms: number) => any} [deps.setTimer]
   * @param {(handle: any) => void} [deps.clearTimer]
   * @param {number} [deps.delay]
   */
  constructor(deps) {
    this.#deps = {
      isBusy: () => false,
      whenIdle: (callback) => callback(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle),
      delay: 50,
      ...deps
    };
  }

  /** Is a render waiting? */
  get pending() {
    return this.#timer !== null || this.#waitingForIdle;
  }

  request() {
    if (this.pending) return;
    this.#timer = this.#deps.setTimer(() => this.#fire(), this.#deps.delay);
  }

  /** Drop anything pending (the sheet closed). */
  cancel() {
    if (this.#timer !== null) this.#deps.clearTimer(this.#timer);
    this.#timer = null;
    this.#waitingForIdle = false;
  }

  #fire() {
    this.#timer = null;
    if (!this.#deps.isRendered()) return;
    if (this.#deps.isBusy()) {
      this.#waitingForIdle = true;
      this.#deps.whenIdle(() => {
        if (!this.#waitingForIdle) return;
        this.#waitingForIdle = false;
        if (this.#deps.isRendered()) this.#deps.render();
      });
      return;
    }
    this.#deps.render();
  }
}

/** The world's one registry. Created on first use, so it binds to Foundry's live Hooks. */
let shared = null;
export function partyLiveSync() {
  shared ??= new PartyLiveSync(globalThis.Hooks);
  return shared;
}
