/**
 * @file DataTablesAdapter.js
 * @brief DataTables.net rendering engine.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";
import "datatables.net-buttons-dt";
import "datatables.net-buttons-dt/css/buttons.dataTables.css";
import "datatables.net-buttons/js/buttons.html5.mjs";
import { DataEngineAdapter } from "../DataEngineAdapter.js";
import { $HR } from "../../ui/i18n/HResource.js";
import {
  fieldValues,
  sanitizeTextHtml,
  stripHtml,
} from "../../core/FieldValueFormatter.js";

const RECORD_TYPE_ICON_TOKEN = Date.now();

/** Renders application data with DataTables.net. */
export class DataTablesAdapter extends DataEngineAdapter {
  async initialize({
    container,
    options = {},
    onSelectionChange,
    onEditRecord,
    onViewRecord,
    onCollectionToggle,
    onDataRequest,
  }) {
    this.container = container;
    this.options = options;
    this.onSelectionChange = onSelectionChange;
    this.onEditRecord = onEditRecord;
    this.onViewRecord = onViewRecord;
    this.onCollectionToggle = onCollectionToggle;
    this.onDataRequest = onDataRequest;
    this.pendingRequestKey = null;
    this.pendingRequest = null;
    this.selected = new Set();
    this.collected = new Set();
    this.exportButtons = [];
    if (this.options.controls?.export !== false) {
      await this._initializeExportButtons();
    }
    this.tableElement = document.createElement("table");
    this.tableElement.className = "display heurist-data-table";
    this.container.replaceChildren(this.tableElement);
    this.container.classList.add("heurist-data-table-host");
    this.container.style.setProperty(
      "--heurist-data-font-size",
      `${Number(this.options.fontSize) || 14}px`,
    );
    this.clickHandler = (event) => this._handleClick(event);
    this.tableElement.addEventListener("click", this.clickHandler);
  }

  /** Load large, format-specific exporters only when export controls are enabled. */
  async _initializeExportButtons() {
    const exportOptions = { orthogonal: "export", stripHtml: true };
    this.exportButtons = [
      { extend: "copyHtml5", text: "Copy", exportOptions },
      { extend: "csvHtml5", exportOptions },
    ];

    try {
      const { default: JSZip } = await import("jszip");
      DataTable.Buttons.jszip(JSZip);
      this.exportButtons.push({ extend: "excelHtml5", exportOptions });
    } catch {
      // CSV and clipboard export remain available without JSZip.
    }

    try {
      const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
        import("pdfmake/build/pdfmake.js"),
        import("pdfmake/build/vfs_fonts.js"),
      ]);
      pdfMake.addVirtualFileSystem(pdfFonts);
      DataTable.Buttons.pdfMake(pdfMake);
      this.exportButtons.push({ extend: "pdfHtml5", exportOptions });
    } catch {
      // Other export formats remain available if PDF initialization fails.
    }
  }

  async setData({ dataset, records, meta, pagination }) {
    this.instance?.destroy();
    this.instance = null;
    this.tableElement.replaceChildren();
    this.selected.clear();
    this.dataset = dataset;
    this.records = records;
    this.meta = meta;
    const fields =
      dataset?.fields?.filter((field) => field.visible !== false) || [];
    const projected = projectRecords(records, fields);
    const interaction = this.options.interaction || {};
    const collectionEnabled = interaction.persistentSelectionEnabled === true;
    const adminEnabled = interaction.adminInfoEnabled === true;
    const actionEnabled =
      interaction.editEnabled === true || interaction.popupEnabled === true;
    const columns = [
      ...(collectionEnabled
        ? [
            {
              title: "",
              data: "rec_ID",
              width: "1.6em",
              orderable: false,
              searchable: false,
              className: "heurist-data-collection-cell",
              render: (value) =>
                `<input type="checkbox" class="heurist-data-collection" data-record-id="${Number(value)}" aria-label="${escapeHtml($HR("In collection"))}">`,
            },
          ]
        : []),
      ...(adminEnabled
        ? [
            {
              title: $HR("Record info"),
              data: "_record",
              width: "9em",
              orderable: false,
              searchable: false,
              className: "heurist-data-admin-cell",
              render: (record, type) =>
                type === "display"
                  ? renderAdminInfo(record, this.options)
                  : String(record?.rec_OwnerName || ""),
            },
          ]
        : []),
      ...fields.map((field, index) => ({
        title: field.title || fieldTitle(field.field, meta),
        data: columnKey(index),
        width: field.width || undefined,
        orderable: Boolean(sortCode(field.field)),
        render: (value, type) =>
          formatProjectedCell(value, type, fieldType(field.field, meta)),
      })),
      ...(actionEnabled
        ? [
            {
              title: "",
              data: "rec_ID",
              width: "3em",
              orderable: false,
              searchable: false,
              className: "heurist-data-actions-cell",
              render: (value) => renderRowActions(value, interaction),
            },
          ]
        : []),
    ];
    let initialPage = {
      records: projected,
      total: Number(pagination?.total) || projected.length,
    };
    this.instance = new DataTable(this.tableElement, {
      columns,
      pageLength: Number(this.options.pageLength) || 100,
      lengthMenu: [50, 100, 500, 1000, 5000],
      layout: this._layoutOptions(),
      serverSide: true,
      processing: true,
      ajax: async (request, callback) => {
        try {
          let page;
          if (initialPage) {
            page = {
              ...initialPage,
              records: initialPage.records.slice(
                Number(request.start) || 0,
                (Number(request.start) || 0) + (Number(request.length) || 25),
              ),
            };
            initialPage = null;
          } else {
            const order = request.order?.[0];
            const columnIndex = order ? Number(order.column) : -1;
            const firstFieldColumn =
              (collectionEnabled ? 1 : 0) + (adminEnabled ? 1 : 0);
            const field =
              columnIndex >= firstFieldColumn
                ? fields[columnIndex - firstFieldColumn]
                : null;
            const serverSort = field ? sortCode(field.field) : null;
            const search = String(request.search?.value || "").trim();
            const result = await this._requestPageOnce({
              offset: Number(request.start) || 0,
              limit: Number(request.length) || 25,
              // Omit sort when DataTables has no applicable ordering so the
              // base query's stored top-level sort remains effective.
              sort: serverSort
                ? `${order.dir === "desc" ? "-" : ""}${serverSort}`
                : undefined,
              filter: search ? { f: search } : null,
            });
            page = {
              records: projectRecords(result?.records || [], fields),
              total: result?.recordsTotal || 0,
              filtered: result?.recordsFiltered || 0,
            };
          }
          callback({
            draw: request.draw,
            data: page.records,
            recordsTotal: page.total,
            recordsFiltered: page.filtered ?? page.total,
          });
          this._applySelectionClasses();
          this._applyCollectionClasses();
        } catch (error) {
          callback({
            draw: request.draw,
            data: [],
            recordsTotal: 0,
            recordsFiltered: 0,
          });
          // Rapid filtering, sorting or paging intentionally supersedes the
          // previous fetch. DataTables discards this older draw by draw number.
          if (
            error?.name !== "AbortError" &&
            error !== "Superseded data request" &&
            error?.message !== "Superseded data request"
          ) {
            this.container.dispatchEvent(
              new CustomEvent("heurist-data-table-error", {
                detail: { error },
              }),
            );
          }
        }
      },
      deferRender: true,
      autoWidth: false,
      order: [],
      searchDelay: Number(this.options.searchDelay) || 400,
      scrollY: "100%",
      scrollCollapse: true,
      language: dataTablesLanguage(this.options.emptyResultMessage),
    });
    this.pagination = pagination;
  }

  /** Native DataTables layout. The fixed ControlPanel deliberately reserves no space. */
  _layoutOptions() {
    const controls = this.options.controls || {};
    const buttons =
      controls.export !== false && this.exportButtons?.length
        ? { buttons: this.exportButtons }
        : null;
    const topStart = [];
    if (controls.search !== false) topStart.push("search");
    // No ControlPanel placeholder. The panel overlays the top-right corner.
    return {
      topStart,
      topEnd: null,
      bottomStart: controls.pageSize === false ? null : "pageLength",
      bottom2Start: buttons,
      bottom2End: controls.counter === false ? null : "info",
      bottomEnd: "paging",
    };
  }

  async setSelection(recordIds) {
    this.selected = new Set(recordIds.map(Number));
    this._applySelectionClasses();
  }

  async setCollection(recordIds) {
    this.collected = new Set(recordIds.map(Number));
    this._applyCollectionClasses();
  }

  /** Coalesce duplicate DataTables draws while an identical request is active. */
  _requestPageOnce(request) {
    const key = JSON.stringify(request);
    if (key === this.pendingRequestKey && this.pendingRequest) {
      return this.pendingRequest;
    }
    this.pendingRequestKey = key;
    const pending = Promise.resolve(this.onDataRequest?.(request));
    this.pendingRequest = pending.finally(() => {
      if (this.pendingRequestKey === key) {
        this.pendingRequestKey = null;
        this.pendingRequest = null;
      }
    });
    return this.pendingRequest;
  }

  _handleClick(event) {
    const collection = event.target.closest(".heurist-data-collection");
    if (collection) {
      const id = Number(collection.dataset.recordId);
      const checked = collection.checked;
      Promise.resolve(this.onCollectionToggle?.(id, checked)).catch(() => {
        collection.checked = !checked;
      });
      return;
    }
    const edit = event.target.closest(".heurist-data-record");
    if (edit) {
      this.onEditRecord?.(Number(edit.dataset.recordId));
      return;
    }
    const action = event.target.closest(".heurist-data-row-action");
    if (action) {
      const id = Number(action.dataset.recordId);
      action.blur();
      action.dataset.action === "edit"
        ? this.onEditRecord?.(id)
        : this.onViewRecord?.(id);
      return;
    }
    const row = event.target.closest("tr");
    if (this.options.interaction?.selectionEnabled === false) return;
    if (!row || !this.instance) return;
    const record = this.instance.row(row).data();
    const id = Number(record?.rec_ID);
    if (!Number.isInteger(id) || id < 1) return;
    if (event.ctrlKey || event.metaKey) {
      this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    } else {
      this.selected = new Set([id]);
    }
    this._applySelectionClasses();
    this.onSelectionChange?.([...this.selected]);
  }

  _applySelectionClasses() {
    if (!this.instance) return;
    const selected = this.selected;
    this.instance.rows().every(function () {
      const node = this.node();
      node?.classList.toggle(
        "heurist-data-selected",
        selected.has(Number(this.data()?.rec_ID)),
      );
    });
  }

  _applyCollectionClasses() {
    if (!this.instance) return;
    const collected = this.collected;
    this.instance.rows().every(function () {
      const id = Number(this.data()?.rec_ID);
      const checkbox = this.node()?.querySelector(".heurist-data-collection");
      if (checkbox) checkbox.checked = collected.has(id);
    });
  }

  async resize() {
    this.instance?.columns.adjust();
  }

  async applyConfiguration(options = {}) {
    this.options = { ...this.options, ...options };
    if (this.container)
      this.container.style.setProperty(
        "--heurist-data-font-size",
        `${Number(this.options.fontSize) || 14}px`,
      );
    if (this.dataset)
      await this.setData({
        dataset: this.dataset,
        records: this.records || [],
        meta: this.meta || {},
        pagination: this.pagination || {},
      });
  }

  async destroy() {
    this.instance?.destroy();
    this.instance = null;
    this.pendingRequestKey = null;
    this.pendingRequest = null;
    this.tableElement?.removeEventListener("click", this.clickHandler);
    this.container?.replaceChildren();
  }
}

export function projectRecords(records, fields) {
  return records.map((record) => {
    const row = { rec_ID: record.rec_ID, _record: record };
    fields.forEach((field, index) => {
      row[columnKey(index)] = fieldValues(record, field);
    });
    return row;
  });
}

export function formatCell(record, field, type = "display") {
  const normalized = fieldValues(record, field).map(String);
  return formatProjectedCell(normalized, type, field.type || null);
}

function formatProjectedCell(value, type = "display", dataType = null) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const plain = values.map((item) => stripHtml(String(item ?? "")));
  if (type !== "display") return plain.join(" | ");
  return values
    .map((item, index) =>
      formatDisplayValue(String(item ?? ""), plain[index], dataType),
    )
    .join("<br>");
}

function columnKey(index) {
  return `field_${index}`;
}

function sortCode(code) {
  if (code === "rec_ID") return "id";
  if (code === "rec_Title") return "title";
  if (code === "rec_RecTypeID") return "type";
  if (code === "rec_Added") return "added";
  if (code === "rec_Modified") return "modified";
  if (/^\d+$/.test(code)) return `f:${code}`;
  const parts = code.split(":");
  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    return `f:${parts[1]}`;
  }
  return null;
}

function dataTablesLanguage(emptyResultMessage) {
  const empty = String(emptyResultMessage || "No records");
  return {
    emptyTable: $HR(empty, empty),
    zeroRecords: $HR(empty, empty),
    search: $HR("Search"),
    lengthMenu: $HR("Show _MENU_ entries"),
    info: $HR("Showing _START_ to _END_ of _TOTAL_ entries"),
    infoEmpty: $HR("Showing 0 to 0 of 0 entries"),
    infoFiltered: $HR("(filtered from _MAX_ total entries)"),
    paginate: {
      first: $HR("First"),
      previous: $HR("Previous"),
      next: $HR("Next"),
      last: $HR("Last"),
    },
    processing: $HR("Processing..."),
  };
}

function fieldTitle(code, meta) {
  const raw = meta?.fields?.details || meta?.details || [];
  const details = Array.isArray(raw) ? raw : Object.values(raw);
  const found = details.find(
    (item) => item.dty_PathCode === code || String(item.dty_ID) === code,
  );
  return found?.dty_Name || code;
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

function renderAdminInfo(record, options) {
  const visibility = String(record?.rec_NonOwnerVisibility || "").toLowerCase();
  const visibilityInfo = {
    hidden: { icon: "fa-eye-slash", hint: "hidden_hint", color: "#c62828" },
    visible: { icon: "fa-eye", hint: "visible_hint", color: "#e07b00" },
    pending: { icon: "fa-eye", hint: "pending_hint", color: "#2e8b57" },
    public: { icon: "fa-eye", hint: "public_hint", color: "#777" },
  }[visibility] || { icon: "fa-eye", hint: "public_hint", color: "#777" };
  const visibilityHint = $HR(visibilityInfo.hint);
  const baseUrl = String(
    options?.baseUrl ||
      globalThis.heuristModuleBootstrap?.runtime?.baseUrl ||
      "",
  );
  const heuristRoot =
    baseUrl && !baseUrl.endsWith("/") ? `${baseUrl}/` : baseUrl;
  const database = String(
    options?.database ||
      globalThis.heuristModuleBootstrap?.runtime?.database ||
      "",
  );
  const typeId = Number(record?.rec_RecTypeID);
  const typeIcon =
    typeId > 0 && heuristRoot
      ? `${heuristRoot}?db=${encodeURIComponent(database)}&icon=${typeId}&t=${RECORD_TYPE_ICON_TOKEN}&version=thumb`
      : "";
  const bookmarked = Number(record?.rec_Bookmarked) !== 0;
  return (
    '<span class="heurist-data-admin">' +
    `<span class="heurist-data-owner" title="${escapeHtml(record?.rec_OwnerName || "")}">${escapeHtml(record?.rec_OwnerName || "")}</span>` +
    `<span class="heurist-data-visibility" title="${escapeHtml(visibilityHint)}"><i class="fa-regular ${visibilityInfo.icon}" style="color:${visibilityInfo.color}" aria-label="${escapeHtml(visibilityHint)}"></i></span>` +
    `<i class="fa-regular fa-bookmark heurist-data-bookmark${bookmarked ? "" : " is-placeholder"}" title="Bookmarked" aria-label="Bookmarked"></i>` +
    (typeIcon
      ? `<img class="heurist-data-rectype-icon" src="${escapeHtml(typeIcon)}" width="18" height="18" alt="">`
      : '<span class="heurist-data-rectype-icon"></span>') +
    "</span>"
  );
}

function fieldType(code, meta) {
  const raw = meta?.fields?.details || meta?.details || [];
  const details = Array.isArray(raw) ? raw : Object.values(raw);
  return (
    details.find(
      (item) => item.dty_PathCode === code || String(item.dty_ID) === code,
    )?.dty_Type || null
  );
}

function formatDisplayValue(value, plain, dataType) {
  const type = String(dataType || "").toLowerCase();
  if (type === "blocktext") {
    const shortened = truncate(plain, 240);
    return `<span class="heurist-data-memo" title="${escapeHtml(plain)}">${escapeHtml(shortened)}</span>`;
  }
  if (type === "json" || looksLikeJson(plain)) {
    return `<span class="heurist-data-structured" title="${escapeHtml(plain)}">${escapeHtml(compactJson(plain))}</span>`;
  }
  if (type === "geo") {
    return `<span class="heurist-data-structured" title="${escapeHtml(plain)}">${escapeHtml(truncate(plain, 90))}</span>`;
  }
  return sanitizeTextHtml(value);
}

function looksLikeJson(value) {
  const text = String(value || "").trim();
  if (!(text.startsWith("{") || text.startsWith("["))) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function compactJson(value) {
  try {
    return truncate(JSON.stringify(JSON.parse(value)), 90);
  } catch {
    return truncate(value, 90);
  }
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function renderRowActions(value, interaction) {
  const id = Number(value);
  return (
    '<span class="heurist-data-row-actions">' +
    (interaction.editEnabled === true
      ? `<button class="heurist-data-row-action" data-action="edit" data-record-id="${id}" title="Edit"><i class="fa-solid fa-pen"></i></button>`
      : "") +
    (interaction.popupEnabled === true
      ? `<button class="heurist-data-row-action" data-action="view" data-record-id="${id}" title="View"><i class="fa-solid fa-circle-info"></i></button>`
      : "") +
    "</span>"
  );
}
