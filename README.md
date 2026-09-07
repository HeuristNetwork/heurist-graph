# Heurist Graph

Standalone and embeddable graph presentation module for Heurist. The module
uses the renderer-neutral `/api/{database}/graph` endpoint and renders it with
`vis-network`.

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

## Bootstrap

Standalone pages define `window.heuristModuleBootstrap`:

```js
window.heuristModuleBootstrap = {
  runtime: {
    database: "demo",
    apiBaseUrl: "/heurist/api",
    runtimeMode: "standalone"
  },
  settings: {
    links: "all",
    limits: { maxNodes: 5000, maxEdges: 10000, maxDepth: 5 }
  },
  source: {
    query: "t:10",
    selection: []
  }
};
```

The child application exposes `window.heuristGraph` with `load`,
`expandNode`, `setSelection`, `clearSelection`, `getState`, `resize`, and
event subscription methods.

## Graph contract

Requests use `POST /api/{database}/graph` with a top-level query, an
internal-edge selection (`links`), pagination, and an optional `limits` budget.
`links` is `"all"` for the initial graph and a Saved Filter, or an array of
compact link specs for a Dataset. The response is renderer-neutral: `graph`
holds `records` (always `rec_ID`, `rec_Title`, `rec_RecTypeID`), provenance-
tagged `edges`, the `links`/`paths` namespaces, and an effective `limits`
report. The `VisNetworkAdapter` converts `graph.records` and `graph.edges` into
the vis-network node and edge collections.

Expansion checkboxes activate complete rule trees independently against the
loaded base records. Prune / Level / Expand navigate tree depth; selected records
have independent exploration scopes. Double-click advances one selected node.
Each request sends one branch step as `rule` and its parent IDs as `query.ids`.
The response includes `expansion.targetIds` for scheduling the next depth.

The base and every branch retain separate node/edge memberships. Disabling or
pruning removes only contributions with no other active owner; cached results
can be restored without another request. New source loads invalidate caches.
The host's existing RuleSet Builder edits all definitions through the new
`HEURIST4.ui.showRulesBuilderDialog` bridge. Generated `name` and `description`
are stored beside each rule's query. Dataset forms persist `DT_EXPANSION_RULES`;
legend edits are temporary overrides scoped to Current Results or a Dataset ID.

## Host integration

The legacy host adapter is available under
`heurist/hclient/modules/graph/HeuristModuleGraph.js` and follows the shared
`HeuristModuleViewer` and `HeuristModuleRecordset` lifecycle.
