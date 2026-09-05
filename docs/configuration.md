# Heurist Graph Configuration

The module accepts a serializable bootstrap envelope. Standalone pages provide
it through `window.heuristModuleBootstrap`; embedded pages provide it through
the `heuristGraphHost` iframe bridge.

```js
window.heuristModuleBootstrap = {
  runtime: {
    database: "demo",
    apiBaseUrl: "/heurist/api",
    runtimeMode: "standalone",
    language: "eng"
  },
  settings: {
    engine: "vis-network",
    links: "all",
    rules: [],
    limits: {
      maxNodes: 5000,
      maxEdges: 10000,
      maxDepth: 5
    },
    engineOptions: {
      physics: true
    }
  },
  source: {
    query: "t:10",
    selection: []
  }
};
```

## Runtime values

- `runtime.database` identifies the Heurist database;
- `runtime.apiBaseUrl` points to the API root;
- `runtime.accessToken` and `runtime.requestHeaders` carry optional authentication;
- `runtime.baseUrl` identifies an embedded Heurist host;
- `runtime.source` identifies the module instance for host coordination;
- `source.query` is the top-level Heurist query;
- `source.selection` contains initially selected record IDs.

## Graph request

`GraphProvider` sends a POST request to `/graph`. The request body contains the
top query, the internal-edge selection (`links`), pagination values, and an
optional `limits` budget. The API response is a renderer-neutral document with
`query`, `total`, `offset`, `limit`, and a `graph` object holding `records`,
`edges`, `links`, `paths`, and `limits`.

`links` defaults to `"all"` (discover every edge whose two endpoints are both in
the result set) for the initial graph and for a Saved Filter. A Dataset with an
explicit compact link list sends that array instead. Client-side dynamic
expansion sends an IDs query with no link discovery and merges the returned
records and edges into the current graph by stable ID.

## Engine options

`engine` currently supports `vis-network`. Its options are passed to the
adapter and may contain the raw `physics`, `interaction`, `nodes`, `edges`,
`layout`, and `groups` vis-network objects, plus the named settings below,
each also exposed in the "Default settings" section of the graph's
Preferences dialog (`config.defaults.*`, threaded in by `graphConfig.js`).
These values are renderer-specific and must remain inside the engine adapter
boundary. A raw vis-network object provided directly always overrides the
adapter's own default for that key.

- `gravity`: `"loose"` | `"normal"` (default) | `"tight"` - node "gravity":
  how far apart nodes spread. Maps to `physics.barnesHut.gravitationalConstant`
  (`-4000` / `-2000` / `-800`); `physics.barnesHut.centralGravity` (`0.3`)
  separately pulls the whole graph back toward the center. Pass a raw
  `physics: false` to disable the simulation entirely once stabilized, or a
  raw `physics` object to override the solver outright.
- `scaling`: boolean, default `true` - scales each node's size by its
  connection count (`nodes.scaling`, with a computed `value` per node), so
  well-connected records stand out. `false` keeps every node the uniform
  default `size`.
- `labelMaxLength`: number 20-100, default `40` - see "Node labels" below.
- `popupDelay`: seconds, default `1` - the native hover tooltip's delay
  (`interaction.tooltipDelay`, converted to milliseconds).
- `popupTemplate`: a Heurist report template name, or `null`/omitted for the
  built-in vis-native popup - see "Node popups" below.
- `customPopup`: `false` disables the click popup entirely, keeping only the
  native hover tooltip; `popupRenderer(node)` overrides its content - see
  "Node popups" below.

Other useful `vis-network` appearance settings, passed through their raw
objects:

- `nodes.shape`, `nodes.color`, and `nodes.font` for node appearance; `groups`
  to style nodes per record type group, e.g. `{ groups: { 10: { color:
  "#c33" } } }`.
- `edges.smooth.type` (`"dynamic"`, `"curvedCW"`, `"cubicBezier"`, ...),
  `edges.arrows`, `edges.dashes`, and `edges.color.{color,highlight,hover}`
  for edge appearance.
- `interaction.multiselect` and `interaction.hideEdgesOnDrag` for interaction
  feel.
- `layout.hierarchical` for a tree/DAG layout instead of the force-directed
  default.

`resize()` only recalculates the canvas size (`autoResize` already tracks the
container); it never reframes the viewport, so an unrelated layout resize -
another widget's search finishing, a sidebar toggle - never yanks the user's
current pan/zoom back to a full "zoom to extent". Likewise, physics
stabilization never auto-fits (`stabilization.fit: false`); `fit()` is called
automatically only when `GraphApplication` renders a genuinely new or
switched graph (not an incremental node expansion), and otherwise only from
the "Expand graph" panel action or an explicit `heuristGraph.fit()` call.

## Node labels

Record titles may contain HTML from rich-text fields. `VisNetworkAdapter`
strips markup before using the title as a node's label and hover tooltip, and
truncates the label to `labelMaxLength` characters (default `40`, breaking on
a word boundary where possible) so long titles don't crowd the graph; the
untruncated, tag-stripped title remains the hover tooltip.

## Node popups

vis-network's own `title` option only supports a plain hover tooltip (a
string, or a DOM element inserted as-is) - there is no built-in click popup.
`VisNetworkAdapter` adds one: clicking a node shows a small positioned popup
near it, resolved in order:

1. **Popup template** (`popupTemplate`) - the same Standard/Smarty report
   template mechanism `HRecordList` uses for its card and extended-view
   templates (see `ReportTemplateProvider` for the available template list
   and `RecordContentProvider` for the fetch). The popup shows a loading
   placeholder, then `GraphApplication.requestPopupContent()` fetches the
   server-rendered HTML for that one record and the template's markup
   replaces it verbatim - exactly like a Dataset card's template content.
   A fetch superseded by clicking another node, or that returns nothing, is
   discarded/falls through to the next option below.
2. **`popupRenderer(node)`** - a caller-supplied function returning a DOM
   `Node` for custom, code-defined content (the node object carries `id`,
   `label`, `title`, and `recordTypeId`).
3. A small built-in title/type card.

Set `customPopup: false` to disable the click popup entirely and keep only
the native hover tooltip.

## Public API

The child exposes `window.heuristGraph`:

- `load({ query, links, merge })` loads or merges a graph;
- `expandNode(recordId)` requests a dynamic expansion;
- `getLegend()` returns node counts by record type and edge counts by link group;
- `setRecordTypeVisibility(recordTypeId, visible)` and
  `setLinkVisibility(key, visible)` toggle legend groups without reloading;
- `setSelection(recordIds)` updates selected records;
- `clearSelection()` clears selection;
- `getState()` returns query, selection, and graph record IDs;
- `resize()` refreshes the renderer;
- `addEventListener()` and `removeEventListener()` subscribe to module events;
- `destroy()` tears down the application.

The `heurist-graph-selection-changed` event is emitted for both host-driven and
renderer-driven selection changes. The embedded host wrapper forwards renderer
selection to the legacy `onselect` callback. A selection driven by another
widget's `ON_REC_SELECT` event commonly names records this graph never
loaded; `setSelection()` silently selects only the subset of IDs present in
the current graph instead of raising a "Node not found" error.

## Current scope

The first implementation is configuration-driven. A visual expansion-rules
builder, graph publication settings, graph export, path-aware styling, and
server-enforced node/edge/depth limits remain follow-up work. They should be
added without coupling the API or application layer to `vis-network`.
