/**
 * @file hostCollection.test.js
 * @brief Tests host collection integration.
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
import { HeuristDataHostAdapter } from "../../src/host/HeuristDataHostAdapter.js";

test("collection bridge preserves the canonical host collection and delegates mutations", async () => {
  const calls = [];
  const host = new HeuristDataHostAdapter({
    bridge: {
      getCollection: () => ["2", "3"],
      addToCollection: (ids) => calls.push(["add", ids]),
      removeFromCollection: (ids) => calls.push(["remove", ids]),
    },
  });
  assert.equal(host.supportsCollection(), true);
  // Large persisted collections must not be normalized/copied at every layer.
  assert.deepEqual(await host.getCollection(), ["2", "3"]);
  await host.addToCollection("5");
  await host.removeFromCollection([3, "4"]);
  assert.deepEqual(calls, [
    ["add", [5]],
    ["remove", [3, 4]],
  ]);
});

test("record search bridge is exposed without coupling the module to HAPI", async () => {
  let received;
  const host = new HeuristDataHostAdapter({
    bridge: {
      doSearch: (request) => {
        received = request;
        return true;
      },
    },
  });
  assert.equal(host.supportsSearch(), true);
  await host.doSearch({ q: "t:10", detail: "ids" });
  assert.deepEqual(received, { q: "t:10", detail: "ids" });
});
