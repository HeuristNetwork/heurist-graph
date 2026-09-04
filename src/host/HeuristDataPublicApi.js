/**
 * @file HeuristDataPublicApi.js
 * @brief Stable engine-neutral public API for host integrations.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { serializeDataConfigurationSettings } from "../ui/config/dataConfigurationSchema.js";
import { PublishedDialog } from "../ui/PublishedDialog.js";

/** Stable engine-neutral public API for host integrations. */
/** Stable engine-neutral public API for host integrations. */
export class HeuristDataPublicApi {
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
    this.configurationDialog = null;
    this.publishedDialog = null;
  }
  setReadyPromise(value) {
    this.readyPromise = value;
  }
  /** Resolve when the application is ready. */
  ready() {
    return this.readyPromise || Promise.resolve(this);
  }
  /** Select and load a persisted Dataset. */
  setDataset(id, options) {
    return this.application.setDataset(id, options);
  }
  /** Select and load Current Results. */
  setQuery(query, options) {
    return this.application.setQuery(query, options);
  }
  /** Replace the selected record IDs. */
  setSelection(ids, options) {
    return this.application.setSelection(ids, options);
  }
  /** Clear the selected record IDs. */
  clearSelection() {
    return this.application.clearSelection();
  }
  /** Activate the remembered Current Results source. */
  activateCurrentResults() {
    return this.application.activateCurrentResults();
  }
  /** Activate a saved filter against Current Results. */
  activateFilter(filter) {
    return this.application.activateFilter(filter);
  }
  notifyFilterLoading(filterId) {
    this.application.dispatch("heurist-data-filter-loading", {
      filterId: Number(filterId),
    });
  }
  notifyFilterLoaded(filter) {
    this.application.dispatch("heurist-data-filter-loaded", { filter });
  }
  requestCreateDataset() {
    return this.application.requestCreateDataset();
  }
  requestPickFields() {
    return this.application.requestPickFields();
  }
  /** Return host and engine capabilities. */
  getCapabilities() {
    return this.application.getCapabilities();
  }
  /** Return the current application state. */
  getState() {
    return this.application.getState();
  }
  /** Resize the active rendering engine. */
  resize() {
    return this.application.resize();
  }
  /** Reload the active Dataset or query source. */
  refresh() {
    const state = this.application.getState();
    if (state.datasetId)
      return this.setDataset(state.datasetId, { reload: true });
    if (state.query != null && state.query !== "") {
      return this.setQuery(state.query, { reload: true });
    }
    return Promise.resolve(state);
  }
  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory =
      typeof factory === "function" ? factory : null;
  }
  openConfigurationDialog(options = {}) {
    if (!this.configurationDialogFactory)
      throw new Error("Data configuration dialog is not available");
    this.configurationDialog?.close?.();
    this.configurationDialog = this.configurationDialogFactory(options);
    return this.configurationDialog;
  }
  openConfiguration(options = {}) {
    return this.openConfigurationDialog(options);
  }
  loadDataPreferences() {
    return this.application.host.loadDataPreferences?.() ?? null;
  }
  saveDataPreferences(value) {
    return this.application.host.saveDataPreferences?.(
      serializeDataConfigurationSettings(value),
    );
  }
  /** Apply normalized runtime configuration. */
  applyConfiguration(value) {
    return this.application.applyConfiguration(value);
  }
  async openPreferencesDialog(options = {}) {
    const saved = await this.loadDataPreferences();
    return this.openConfigurationDialog({
      ...options,
      mode: "preferences",
      value: saved || this.application.config.persistedSettings,
      onSave: async (value, context) => {
        const result = await this.saveDataPreferences(value);
        await this.applyConfiguration(context.serialized);
        return options.onSave?.(value, context, result) ?? result;
      },
    });
  }
  publishData(value, publishOptions = {}) {
    const settings = serializeDataConfigurationSettings(value);
    const state =
      publishOptions.preserveCurrentState === false ? {} : this.getState();
    return this.application.host.publishData({
      format: "heurist-publication",
      version: 1,
      options: settings.options,
      config: settings.config,
      state,
    });
  }
  openPublishDialog(options = {}) {
    const value = publicationSettings(
      options.value || this.application.config.persistedSettings,
      this.application.config.language,
    );
    return this.openConfigurationDialog({
      ...options,
      mode: "publish",
      value,
      onSave: async (value, context) => {
        const result = normalizePublicationResult(
          await this.publishData(value, context.publishOptions),
        );
        this.application.dispatch("heurist-data-published", {
          publication: result,
          settings: context.serialized,
        });
        await options.onSave?.(value, context, result);
        setTimeout(() => {
          this.publishedDialog?.close?.();
          this.publishedDialog = new PublishedDialog({
            publication: result,
          }).open();
        }, 0);
        return result;
      },
    });
  }
  addEventListener(...args) {
    this.application.addEventListener(...args);
  }
  removeEventListener(...args) {
    this.application.removeEventListener(...args);
  }
  destroy() {
    this.configurationDialog?.close?.();
    this.publishedDialog?.close?.();
    return this.application.destroy();
  }
}

function publicationSettings(settings, runtimeLanguage) {
  const value = JSON.parse(JSON.stringify(settings || {}));
  value.options ||= {};
  value.options.ui ||= {};
  if (!value.options.ui.language || value.options.ui.language === "auto") {
    value.options.ui.language = runtimeLanguage || "eng";
  }
  return value;
}

function normalizePublicationResult(result) {
  if (!result?.url) return result;
  try {
    const url = new URL(
      result.url,
      globalThis.location?.href || "http://localhost/",
    );
    const publicationId =
      url.searchParams.get("pub_id") || url.searchParams.get("publication_id");
    if (publicationId) url.searchParams.set("pub_id", publicationId);
    url.searchParams.delete("publication_id");
    url.searchParams.delete("type");
    return { ...result, url: url.href };
  } catch {
    return result;
  }
}
