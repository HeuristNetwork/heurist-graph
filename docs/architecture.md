# Heurist Graph Architecture

`heurist-graph` is an independent Vite application for visualizing records and
relationships returned by the modern Heurist graph search API.

```text
HeuristGraphPublicApi
  -> GraphApplication
       -> GraphEngineAdapter
            -> VisNetworkAdapter
       -> GraphProvider
            -> POST /api/{database}/records
       -> HostAdapter
```

## Boundaries

- `core` owns graph normalization, merging, selection, cancellation, and application state;
- `data` owns the OpenAPI graph request and response conversion;
- `engine` defines renderer-neutral graph operations;
- `engine/visnetwork` contains `vis-network` integration only;
- `host` exposes the stable child API and embedded host bridge;
- `ui` contains graph controls and future rules-builder UI.

The server response remains renderer-neutral. `GraphDocument` accepts the
current API shape (`records`, `edges`, and `paths`) and also accepts the planned
`nodes` aliases. The vis adapter converts normalized records and edges into
`vis-network` `DataSet` instances.

## Loading and expansion

The initial request uses a top-level query and explicit graph detail:

```json
{
  "query": "t:10",
  "detail": "graph",
  "rules": [],
  "fields": ["rec_Title", "rec_RecTypeID"],
  "limit": 100
}
```

A node double-click starts a new request using an IDs query. The returned graph
is merged by stable record and edge IDs. Superseded requests are aborted and
late responses are rejected through the application generation guard.

Expansion rules are supplied as configuration in the initial implementation.
The visual rules builder is deliberately deferred until the request, limits,
path provenance, and selection contracts are stable.

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
