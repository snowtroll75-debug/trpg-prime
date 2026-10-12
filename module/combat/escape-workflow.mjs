/**
 * Escape's route chooser — the Foundry side of escape.mjs.
 *
 * Asked EARLY, before the check is configured, because one of the three
 * routes changes the kind of check being made rather than only its
 * bonus. Everything else in this workflow that prompts does so after the
 * situational dialog; this cannot, because the situational dialog needs
 * to know whether it is configuring a skill check or an attack.
 */
import { ESCAPE_CHECK_OPTIONS, ESCAPE_DEFAULT } from "./escape.mjs";

/**
 * @returns {Promise<string|null>} an ESCAPE_CHECK_OPTIONS key, or null if
 *   cancelled.
 */
export async function promptEscapeRoute() {
  const { DialogV2 } = foundry.applications.api;
  const rows = ESCAPE_CHECK_OPTIONS.map(
    (option) =>
      `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">` +
      `<input type="radio" name="escapeRoute" value="${option.key}"` +
      `${option.key === ESCAPE_DEFAULT ? " checked" : ""} style="margin:0">` +
      `<span>${option.label}</span>` +
      `</label>`
  ).join("");

  const result = await DialogV2.wait({
    window: { title: "Escape — how do you break free?", icon: "fa-solid fa-link-slash" },
    classes: ["trg-prime"],
    position: { width: 340 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Twist loose, force your way out, or fight your way free. The DC is the effect's own, whichever you choose.</p>
      ${rows}
    </div>`,
    buttons: [
      {
        action: "escape",
        label: "Escape",
        icon: "fa-solid fa-link-slash",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return root?.querySelector?.('input[name="escapeRoute"]:checked')?.value ?? ESCAPE_DEFAULT;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return result;
}
