/**
 * @file HeuristDataHostAdapter.js
 * @brief Host adapter for Heurist Data integrations.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "@heurist/client-core/host";

/** Main-Heurist bridge services used by heurist-data. */
/** Bridges application operations to the embedding Heurist host. */
export class HeuristDataHostAdapter extends HostAdapter {
  constructor({
    bridge = null,
    baseUrl = null,
    database = null,
    fetchImpl = null,
  } = {}) {
    super();
    this.bridge = bridge;
    this.baseUrl = String(baseUrl || "").replace(/\?$/, "");
    this.database = database;
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
  }
  supportsEditing() {
    return typeof this.bridge?.editRecord === "function";
  }
  supportsViewing() {
    return typeof this.bridge?.viewRecord === "function";
  }
  editRecord(recordId) {
    if (!this.supportsEditing())
      throw new Error("Record editor is unavailable");
    return this.bridge.editRecord(Number(recordId));
  }
  viewRecord(recordId) {
    if (!this.supportsViewing())
      throw new Error("Record viewer is unavailable");
    return this.bridge.viewRecord(Number(recordId));
  }
  supportsCollection() {
    return ["getCollection", "addToCollection", "removeFromCollection"].every(
      (method) => typeof this.bridge?.[method] === "function",
    );
  }
  getCollection() {
    if (!this.supportsCollection()) return Promise.resolve([]);
    return Promise.resolve(this.bridge.getCollection());
  }
  addToCollection(recordIds) {
    if (!this.supportsCollection())
      throw new Error("Persistent collection is unavailable from this host");
    return this.bridge.addToCollection(normalizeIds(recordIds));
  }
  removeFromCollection(recordIds) {
    if (!this.supportsCollection())
      throw new Error("Persistent collection is unavailable from this host");
    return this.bridge.removeFromCollection(normalizeIds(recordIds));
  }
  subscribeCollection(handler) {
    if (typeof this.bridge?.subscribeCollection !== "function") return null;
    return this.bridge.subscribeCollection(handler);
  }
  getCapabilities() {
    return {
      editing:
        this.supportsEditing() && typeof this.bridge?.addRecord === "function",
      dataPreferences: Boolean(this.baseUrl),
      dataPublishing: Boolean(this.baseUrl),
    };
  }
  addRecord(recordTypeId) {
    const id = Number(recordTypeId);
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      typeof this.bridge?.addRecord !== "function"
    ) {
      throw new Error("Record creation is unavailable from this host");
    }
    return this.bridge.addRecord(id);
  }
  editFieldset(context) {
    if (typeof this.bridge?.editFieldset !== "function")
      throw new Error("Fieldset editor is unavailable from this host");
    return this.bridge.editFieldset(context);
  }
  supportsSearch() {
    return typeof this.bridge?.doSearch === "function";
  }
  doSearch(request) {
    if (!this.supportsSearch())
      throw new Error("Host record search is unavailable");
    return this.bridge.doSearch(request);
  }
  async loadDataPreferences() {
    let value = await this.request("UserController", "get_prefs", {
      key: "heurist-data",
    });
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  }
  async saveDataPreferences(settings) {
    const result = await this.request(
      "UserController",
      "save_prefs",
      {},
      { key: "heurist-data", value: JSON.stringify(settings) },
    );
    this.bridge?.updateSettings?.(settings);
    return result;
  }
  publishData(payload) {
    return this.request(
      "PublicationController",
      "save",
      { type: "data" },
      { data: JSON.stringify(payload) },
    );
  }
  async request(controller, action, query = {}, post = null) {
    if (!this.baseUrl || !this.database)
      throw new Error("Heurist host FrontController is not configured");
    const url = new URL(
      this.baseUrl,
      globalThis.location?.href || "http://localhost/",
    );
    url.searchParams.set("db", this.database);
    url.searchParams.set("controller", controller);
    url.searchParams.set("action", action);
    Object.entries(query).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, String(value));
    });
    const init = { credentials: "same-origin" };
    if (post) {
      init.method = "POST";
      init.headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      };
      init.body = new URLSearchParams(
        Object.entries(post).map(([key, value]) => [key, String(value)]),
      ).toString();
    }
    const response = await this.fetchImpl(url, init);
    if (!response.ok)
      throw new Error(`FrontController request failed (${response.status})`);
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const contentType = response.headers?.get?.("content-type") || "";
      throw new Error(
        `FrontController returned a non-JSON response${contentType ? ` (${contentType})` : ""}`,
      );
    }
    if (
      !(
        payload?.status === 0 ||
        payload?.status === "0" ||
        String(payload?.status).toLowerCase() === "ok"
      )
    ) {
      throw new Error(
        payload?.message ||
          payload?.error?.message ||
          "FrontController request failed",
      );
    }
    return payload.data;
  }
}

function normalizeIds(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value == null ? [] : [value])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}
