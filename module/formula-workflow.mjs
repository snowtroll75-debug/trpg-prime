import { formulaCost, deductCurrency, hasFormulaCapacity, FORMULA_BOOK_CAPACITY } from "./items.mjs";
import { parseGrantList } from "./grants.mjs";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * Add Formula (Chapter 6, Item Formulas): "You can purchase a formula
 * for an item if it is available to buy for cost of approximately 10%
 * of the items purchase price." Prompts for the formula's name and
 * the target item's own purchase price, computes and deducts the 10%
 * cost from the actor's currency, and — only on a successful
 * purchase — appends the formula to this book's stored list.
 *
 * Enforces the 20-formula capacity stated in Crafting Book's own
 * rulebook entry, applied uniformly to both Crafting Book and
 * Formula Book, per Graham directly.
 *
 * @param {Actor} actor
 * @param {Item} book A Crafting Book or Formula Book (or any gear
 *   item — not restricted to those two by name, since a player might
 *   reasonably want this on a homebrew equivalent).
 */
export async function addFormula(actor, book) {
  const currentCount = parseGrantList(book.system?.formulae).length;
  if (!hasFormulaCapacity(currentCount)) {
    ui.notifications.warn(
      `${book.name} is full — it already holds ${currentCount} of a maximum ${FORMULA_BOOK_CAPACITY} formulae (Chapter 6).`
    );
    return null;
  }

  const { DialogV2 } = foundry.applications.api;

  const result = await DialogV2.wait({
    window: { title: `${book.name} — Add Formula`, icon: "fa-solid fa-scroll" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Chapter 6, Item Formulas: a formula costs approximately 10% of the item's own purchase price, and takes an hour to copy into the book once purchased. This book holds ${currentCount} of a maximum ${FORMULA_BOOK_CAPACITY} formulae.</p>
        <div class="form-group">
          <label for="trg-formula-name">Formula name</label>
          <input id="trg-formula-name" type="text" name="formulaName" required>
        </div>
        <div class="form-group">
          <label for="trg-formula-price">Item's purchase price (gp)</label>
          <input id="trg-formula-price" type="number" name="itemPrice" min="0" step="0.01" value="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "add",
        label: "Purchase & Add",
        icon: "fa-solid fa-scroll",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;

  const formulaName = String(result.formulaName ?? "").trim();
  if (!formulaName) {
    ui.notifications.warn("A formula needs a name.");
    return null;
  }

  const itemPrice = Math.max(0, Number(result.itemPrice) || 0);
  const cost = formulaCost(itemPrice);

  const deduction = deductCurrency(actor.system?.currency, cost);
  if (!deduction.success) {
    ui.notifications.warn(
      `Not enough currency to purchase the ${formulaName} formula (${cost} gp) — short by ${deduction.shortfallGP} gp.`
    );
    return null;
  }
  await actor.update({ "system.currency": deduction.purse });

  const existing = parseGrantList(book.system?.formulae);
  existing.push(formulaName);
  await book.update({ "system.formulae": existing.join(", ") });

  const lines = [
    line(`<strong>${book.name}</strong> gains the <strong>${formulaName}</strong> formula.`),
    line(`Cost: ${cost} gp (10% of the item's ${itemPrice} gp price).`),
    line(`Now holds ${existing.length} of a maximum ${FORMULA_BOOK_CAPACITY} formulae.`)
  ];

  await postCard(actor, "Add Formula", lines);

  return { formulaName, cost };
}
