/**
 * @file GraphDocument.js
 * @brief Renderer-neutral normalized graph document.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

export class GraphDocument {
  constructor(value = {}) {
    const graph = value.graph || value;
    this.records = normalizeRecords(graph.records || graph.nodes);
    this.edges = normalizeEdges(graph.edges);
    this.paths =
      graph.paths && typeof graph.paths === "object" ? { ...graph.paths } : {};
    this.limits =
      graph.limits && typeof graph.limits === "object"
        ? { ...graph.limits }
        : null;
  }

  merge(value) {
    const next = new GraphDocument(value);
    const records = new Map(this.records.map((record) => [record.id, record]));
    next.records.forEach((record) =>
      records.set(record.id, { ...records.get(record.id), ...record }),
    );
    const edges = new Map(this.edges.map((edge) => [edge.id, edge]));
    next.edges.forEach((edge) => edges.set(edge.id, edge));
    return new GraphDocument({
      records: [...records.values()],
      edges: [...edges.values()],
      paths: { ...this.paths, ...next.paths },
      limits: next.limits || this.limits,
    });
  }

  get recordIds() {
    return this.records.map((record) => record.id);
  }
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => ({
      id: Number(record?.id ?? record?.rec_ID),
      recordTypeId:
        Number(record?.recordTypeId ?? record?.rec_RecTypeID) || null,
      title: String(record?.title ?? record?.rec_Title ?? ""),
      isTop: record?.isTop === true,
      raw: record,
    }))
    .filter((record) => Number.isInteger(record.id) && record.id > 0);
}

function normalizeEdges(edges) {
  if (!Array.isArray(edges)) return [];
  return edges
    .map((edge) => {
      const source = Number(edge?.from ?? edge?.source);
      const target = Number(edge?.to ?? edge?.target);
      const fieldId = Number(edge?.fieldId ?? edge?.field) || null;
      const relationshipId =
        Number(edge?.relationshipId ?? edge?.relationship) || null;
      return {
        id: String(
          edge?.id ??
            `${source}:${target}:${fieldId || 0}:${relationshipId || 0}`,
        ),
        from: source,
        to: target,
        fieldId,
        relationshipId,
        pathId: edge?.pathId == null ? null : String(edge.pathId),
        raw: edge,
      };
    })
    .filter((edge) => edge.from > 0 && edge.to > 0);
}
