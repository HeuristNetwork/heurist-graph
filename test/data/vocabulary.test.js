/**
 * @file vocabulary.test.js
 * @brief Tests detail-type and relation-type label resolution.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { VocabularyProvider } from "../../src/data/VocabularyProvider.js";

/** Stub of HeuristApiClient.get for /fields, /trl, and /trm. */
function stubApiClient({ fields = {}, children = {}, terms = {} } = {}) {
  const calls = [];
  return {
    calls,
    async get(path, { query } = {}) {
      calls.push({ path, query });
      if (path === "/fields") {
        const ids = String(query.dty_ID).split(",").map(Number);
        return {
          items: ids
            .filter((id) => fields[id] != null)
            .map((id) => ({ dty_ID: String(id), dty_Name: fields[id] })),
        };
      }
      if (path === "/trl") {
        const parentId = Number(query.parentId);
        return {
          items: (children[parentId] || []).map((trm_ID) => ({
            trl_ParentID: parentId,
            trl_TermID: trm_ID,
          })),
        };
      }
      if (path === "/trm") {
        const ids = String(query.trm_ID).split(",").map(Number);
        return {
          items: ids
            .filter((id) => terms[id] != null)
            .map((id) => ({ trm_ID: String(id), trm_Label: terms[id] })),
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

test("VocabularyProvider resolves detail-type names and caches ids and misses", async () => {
  const api = stubApiClient({ fields: { 1: "Name", 16: "Person" } });
  const provider = new VocabularyProvider({ apiClient: api });

  const first = await provider.getFieldNames([1, 16, 999]);
  assert.deepEqual([...first.entries()], [
    [1, "Name"],
    [16, "Person"],
  ]);
  assert.equal(first.has(999), false, "unknown id is omitted, not guessed");

  // Second call for the same ids must not hit the API again (misses cached too).
  await provider.getFieldNames([1, 16, 999]);
  assert.equal(api.calls.filter((c) => c.path === "/fields").length, 1);
});

test("VocabularyProvider walks the relation-type tree and labels every node", async () => {
  // 3260 Ascendants -> 3089 IsParentOf -> {3095, 3104}; 3115 IsGrandParentOf (leaf)
  const api = stubApiClient({
    children: { 3260: [3089, 3115], 3089: [3095, 3104], 3115: [], 3095: [], 3104: [] },
    terms: {
      3260: "Ascendants",
      3089: "IsParentOf",
      3115: "IsGrandParentOf",
      3095: "IsBiologicalParentOf",
      3104: "IsAdoptiveParentOf",
    },
  });
  const provider = new VocabularyProvider({ apiClient: api });

  const { names, trees } = await provider.getRelationTypeTrees([3260]);

  assert.equal(names.get(3260), "Ascendants");
  assert.equal(names.get(3095), "IsBiologicalParentOf");
  assert.deepEqual(trees[3260], {
    id: 3260,
    label: "Ascendants",
    children: [
      {
        id: 3089,
        label: "IsParentOf",
        children: [
          { id: 3095, label: "IsBiologicalParentOf", children: [] },
          { id: 3104, label: "IsAdoptiveParentOf", children: [] },
        ],
      },
      { id: 3115, label: "IsGrandParentOf", children: [] },
    ],
  });

  // Every subtree fetched exactly once.
  assert.equal(api.calls.filter((c) => c.path === "/trl").length, 5);
  assert.equal(api.calls.filter((c) => c.path === "/trm").length, 1);
});

test("VocabularyProvider tolerates cycles and depth without looping forever", async () => {
  const api = stubApiClient({
    children: { 10: [11], 11: [10] }, // 10 <-> 11 cycle
    terms: { 10: "A", 11: "B" },
  });
  const provider = new VocabularyProvider({ apiClient: api });
  const { trees } = await provider.getRelationTypeTrees([10]);
  assert.equal(trees[10].label, "A");
  assert.equal(trees[10].children[0].label, "B");
  // B's re-reference to A is cut (no infinite recursion).
  assert.deepEqual(trees[10].children[0].children, [{ id: 10, label: "A", children: [] }]);
});

test("VocabularyProvider keeps numeric fallback when the API fails", async () => {
  const api = {
    async get() {
      throw new Error("network down");
    },
  };
  const provider = new VocabularyProvider({ apiClient: api });
  const names = await provider.getFieldNames([1, 2]);
  assert.equal(names.size, 0);
  const { names: termNames, trees } = await provider.getRelationTypeTrees([3260]);
  assert.equal(termNames.size, 0);
  assert.equal(trees[3260].label, "3260");
});
