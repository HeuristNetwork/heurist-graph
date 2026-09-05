# Heurist Graph Architecture

`heurist-graph` is an independent Vite application for visualizing records and
relationships returned by the modern Heurist graph search API.

```text
HeuristGraphPublicApi
  -> GraphApplication
       -> GraphEngineAdapter
            -> VisNetworkAdapter
       -> GraphProvider
            -> POST /api/{database}/graph
       -> HostAdapter
```

## Boundaries

- `core` owns graph normalization, merging, selection, cancellation, and application state;
- `data` owns the OpenAPI graph request and response conversion;
- `engine` defines renderer-neutral graph operations;
- `engine/visnetwork` contains `vis-network` integration only;
- `host` exposes the stable child API and embedded host bridge;
- `ui` contains graph controls and future rules-builder UI.

The server response remains renderer-neutral. `GraphDocument` accepts the graph
document shape (`records`, `edges`, `links`, `paths`, `limits`) and also accepts
the `nodes` alias. Every edge carries `link`/`path` provenance and a stable `id`.
The vis adapter converts normalized records and edges into `vis-network`
`DataSet` instances.

## Loading and expansion

The initial request uses a top-level query and an internal-edge selection:

```json
{
  "query": "t:10",
  "links": "all",
  "limit": 1000,
  "limits": { "maxNodes": 5000, "maxEdges": 10000, "maxDepth": 5 }
}
```

`links` is `"all"` for the initial graph and for a Saved Filter until a Dataset
supplies an explicit compact link list (`["10:lt240:48", ...]`). Graph records
always carry exactly `rec_ID`, `rec_Title`, and `rec_RecTypeID`; the graph
endpoint does not accept a `fields` parameter. Client `limits` may only lower
the server budget; the response reports `nodesReturned`, `edgesReturned`, and
`truncated`.

A node double-click starts a new request using an IDs query with no link
discovery. The returned graph is merged by stable record and edge IDs.
Superseded requests are aborted and late responses are rejected through the
application generation guard.

An empty or missing query (no query configured yet, or an explicit `null`)
never reaches the graph endpoint: `GraphApplication` hides the vis-network
canvas and shows a message element instead, using
`persistedSettings.config.defaults.emptyResultMessage` (shared with
heurist-data). The same toggle applies whenever a query resolves with zero
records. An explicit `null`/empty query always wins, even over an active
Dataset - it deactivates the Dataset too, matching heurist-data's
`clearData()`.

A fresh (non-merge) `load()` also reframes the viewport once the graph
renders (`engine.fit()`); an incremental node expansion (`merge: true`) never
does, so expanding a node doesn't recenter the view out from under the user.

## Edge vocabulary (detail-type and relation-type labels)

The graph endpoint reports edges by numeric id only: `fieldId` is a detail
type (`dty_ID`), `relationshipId` is a relation-type term (`trm_ID`). After
every `load()` the graph is first rendered with those numbers as fallback
labels, then `GraphApplication.#resolveVocabulary()` resolves names through
`VocabularyProvider` and swaps them in:

- detail types: `GET /fields?details=name&dty_ID=1,3,16`;
- relation types: `GET /trl?parentId=<id>` returns the direct child terms of
  one term; `VocabularyProvider` walks it recursively (visited-set and
  `maxTreeDepth` guarded) into a `{ id, label, children }` tree, then
  `GET /trm?details=name&trm_ID=...` labels every node.

Every id (hits and misses) is cached on the provider, so repeated loads and
node expansions only fetch ids not seen before. Resolution is best-effort: a
failed request leaves the numeric fallback in place. On success the adapter
re-labels the rendered edges (`engine.setEdgeLabels`) and
`heurist-graph-vocabulary-changed` fires.

`getVocabulary()` returns `{ fields, relationTypes, relationTypeTrees }` and
`getLegend()` adds a resolved `label` to each link group plus
`relationTypeTrees` for the legend renderer.

## Filtered Result, Dataset, and Filter activation

`GraphApplication` tracks its active source (`{type: "dataset"}` or
`{type: "query"}`), mirroring heurist-data's `DataApplication`:

- a plain `load({query})` call - the shape the host uses to apply a Current
  Results query pushed by a global search event - is ignored while a
  persisted Dataset is active, so it can never clobber a Dataset the viewer
  deliberately selected. The query is still *remembered* as the latest
  Filtered Result query before that check runs, matching heurist-data's
  "host search events keep Filtered Result up to date": reactivating Current
  Results later shows that latest query, not a stale one from before the
  Dataset was selected;
- `setDataset(id)` always wins and marks the Dataset as the active source,
  without disturbing the remembered Filtered Result query;
- `activateCurrentResults()` restores the last remembered non-Dataset query
  locally, without contacting the host;
- `activateFilter(filter)` always deactivates the active Dataset. In hosted
  mode it delegates to `host.doSearch()`, which triggers the global
  `ON_REC_SEARCHSTART` event through the parent Heurist application (Current
  Results is then updated once the host echoes the search result back, the
  same "leaves Filtered Result pending" contract heurist-data's tests
  assert). In standalone mode it loads the filter's query directly, since the
  graph endpoint doubles as the search.

Individual interactive expansion rules are follow-up work: the client will send
one selected `rule` with the origin IDs. The visual rules builder is deferred
until the request, limits, path provenance, and selection contracts are stable.

## Host integration

The legacy parent-side integration lives in:

```text
heurist/hclient/modules/graph/
  HeuristModuleGraph.js
  graphViewer.js
  graphViewer.html
```

It reuses `HeuristModuleViewer` and `HeuristModuleRecordset` for iframe
lifecycle, host query synchronization, readiness, resize, errors, and selection.
The child never imports HAPI4, jQuery, D3, or legacy recordset objects.

## Future renderers

A new renderer must implement `GraphEngineAdapter` and be selected by
`createGraphEngine.js`. It must not change `GraphApplication` or
`GraphProvider`. Renderer-specific node styling, layout, physics, and viewport
behavior belong inside the adapter.
