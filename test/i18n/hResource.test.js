/**
 * @file hResource.test.js
 * @brief Tests localization resource behavior.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  $HR,
  applyI18n,
  initLocale,
  parseLocale,
} from "../../src/ui/i18n/HResource.js";

test("locale parser reads Heurist resource lines", () => {
  assert.deepEqual(parseLocale("#Save#Save\n#Cancel#\r\nignored"), {
    Save: "Save",
    Cancel: "",
  });
});

test("target locale overlays English and falls back for missing or empty values", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    text: async () =>
      String(url).includes("_fre")
        ? "#Save#Enregistrer\n#Cancel#"
        : "#Save#Save\n#Cancel#Cancel",
  });
  try {
    await initLocale("fre", "/heurist/");
    assert.equal($HR("Save"), "Enregistrer");
    assert.equal($HR("Cancel"), "Cancel");
    assert.equal($HR("Unknown"), "Unknown");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("applyI18n translates marked text-only descendants", () => {
  const elements = [{ textContent: "Save" }, { textContent: "Unknown" }];
  applyI18n({ querySelectorAll: () => elements });
  assert.equal(elements[0].textContent, "Enregistrer");
  assert.equal(elements[1].textContent, "Unknown");
});
