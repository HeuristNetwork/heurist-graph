/**
 * @file DataControlPanel.js
 * @brief Renders dataset, filter, and data controls.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { DatasetSelector } from "./DatasetSelector.js";
import { FilterSelector } from "./FilterSelector.js";
import { $HR, applyI18n } from "./i18n/HResource.js";

/** Fixed collapsible panel overlaying the DataTables toolbar. */
/** Coordinates the application's dataset and filter controls. */
export class DataControlPanel {
  constructor({
    api,
    tableContainer,
    options = {},
    datasetListProvider = null,
    filterListProvider = null,
  }) {
    this.api = api;
    this.tableContainer = tableContainer;
    this.options = options;
    this.datasetListProvider = datasetListProvider;
    this.filterListProvider = filterListProvider;
    this.listeners = [];
  }

  async mount() {
    if (this.options.enabled === false) return null;
    this.element = document.createElement("aside");
    this.element.className = "heurist-data-control-panel";
    this.element.setAttribute("aria-label", $HR("Data controls"));
    const header = document.createElement("div");
    header.className = "heurist-data-panel-header";
    const toggle = iconButton(
      "fa-solid fa-layer-group",
      "Show or hide data controls",
      () => this.toggleFullyCollapsed(),
    );
    toggle.classList.add("heurist-data-panel-toggle");
    toggle.setAttribute(
      "aria-expanded",
      String(this.options.initiallyExpanded !== false),
    );
    header.append(toggle);
    this.actions = document.createElement("span");
    this.actions.className = "heurist-data-panel-actions";
    this.createButton = iconButton(
      "fa-solid fa-circle-plus",
      "Create new dataset",
      () => this.api.requestCreateDataset(),
    );
    this.fieldsButton = iconButton(
      "fa-solid fa-table-columns",
      "Pick fields",
      () => this.api.requestPickFields(),
    );
    this.optionsButton = iconButton("fa-solid fa-gear", "Options", () =>
      this.api.openPreferencesDialog(),
    );
    this.publishButton = iconButton("fa-solid fa-share-nodes", "Publish", () =>
      this.api.openPublishDialog(),
    );
    this.actions.append(
      this.createButton,
      this.fieldsButton,
      this.optionsButton,
      this.publishButton,
    );
    header.append(this.actions);

    const body = document.createElement("div");
    body.className = "heurist-data-panel-body";
    const datasets = section(body, "Datasets");
    this.datasetsSection = datasets.section;
    this.datasetsContainer = datasets.content;
    const filters = section(body, "Filters");
    this.filtersSection = filters.section;
    this.filtersContainer = filters.content;
    this.element.append(header, body);
    header.addEventListener("click", (event) => {
      if (!event.target.closest(".heurist-data-icon-button")) this.toggleBody();
    });
    (this.tableContainer.parentElement || document.body).append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-data-source-header";
    this.tableContainer.prepend(this.sourceHeader);
    if (this.options.initiallyExpanded === false)
      this.element.classList.add("fully-collapsed");
    this.datasetSelector = new DatasetSelector({
      api: this.api,
      container: this.datasetsContainer,
      onError: (error, operation) => this.reportError(error, operation),
    });
    this.filterSelector = new FilterSelector({
      api: this.api,
      container: this.filtersContainer,
      loadFilter: (id) => this.filterListProvider.load(id),
      onLoading: (id) => this.api.notifyFilterLoading(id),
      onLoaded: (filter) => this.api.notifyFilterLoaded(filter),
      onError: (error, operation) => this.reportError(error, operation),
    });
    this.bind("heurist-data-loaded", () => {
      void this.renderDatasets().catch((error) =>
        this.reportError(error, "render-datasets"),
      );
    });
    this.bind("heurist-data-source-changed", () => {
      this.collapseBody();
      void this.renderDatasets().catch((error) =>
        this.reportError(error, "render-datasets"),
      );
    });
    this.bind("heurist-data-configuration-changed", (event) => {
      void this.applyOptions(event.detail).catch((error) =>
        this.reportError(error, "apply-options"),
      );
    });
    this.applyVisibility();
    await Promise.all([this.renderDatasets(), this.renderFilters()]);
    applyI18n(this.element);
    return this.element;
  }

  bind(name, handler) {
    this.api.addEventListener(name, handler);
    this.listeners.push([name, handler]);
  }

  reportError(error, operation) {
    this.api.application?.dispatch("heurist-data-error", { error, operation });
  }

  toggleFullyCollapsed() {
    const fullyCollapsed = this.element.classList.toggle("fully-collapsed");
    if (!fullyCollapsed) {
      this.element.classList.toggle("body-collapsed", !this.hasVisiblePanels);
    }
    this.updateExpandedState();
  }

  toggleBody() {
    if (this.element.classList.contains("fully-collapsed")) return;
    if (!this.hasVisiblePanels) {
      this.toggleFullyCollapsed();
      return;
    }
    this.element.classList.toggle("body-collapsed");
    this.updateExpandedState();
  }

  updateExpandedState() {
    const expanded =
      !this.element.classList.contains("fully-collapsed") &&
      !this.element.classList.contains("body-collapsed");
    this.element
      .querySelector(".heurist-data-panel-toggle")
      ?.setAttribute("aria-expanded", String(expanded));
  }

  collapseBody() {
    if (!this.element?.hidden) {
      this.element.classList.remove("fully-collapsed");
      this.element.classList.add("body-collapsed");
      this.updateExpandedState();
    }
  }
  async renderDatasets() {
    const ids =
      this.options.allowAllDatasets === false
        ? normalizeIds(this.options.allowedDatasetIds)
        : null;
    const result = (await this.datasetListProvider?.list?.({ ids })) || [];
    let datasets = normalizeItems(result, "Dataset");
    const state = this.api.getState();
    const currentTitle = this.options.currentResultsTitle || "Current result";
    const activeDataset = datasets.find(
      (item) => String(item.id) === String(state.datasetId),
    );
    if (this.sourceHeader) {
      this.sourceHeader.textContent =
        activeDataset?.title ||
        (currentTitle === "Current result" ? $HR(currentTitle) : currentTitle);
    }
    this.datasetSelector?.render(datasets, state.datasetId, !state.datasetId, {
      showCurrentResults: this.options.showCurrentResults !== false,
      currentResultsTitle: currentTitle,
    });
  }
  async renderFilters() {
    const ids =
      this.options.allowAllFilters === false
        ? this.options.allowedFilterIds
        : null;
    const result = (await this.filterListProvider?.list?.({ ids })) || [];
    this.filterSelector?.render(normalizeItems(result, "Filter"));
  }
  async applyOptions(settings = {}) {
    const options = settings.options || settings;
    this.options = {
      ...this.options,
      ...options.ui,
      allowAllDatasets: options.datasets?.allowAll,
      allowedDatasetIds: options.datasets?.allowed,
      allowAllFilters: options.filters?.allowAll,
      allowedFilterIds: options.filters?.allowed,
      readonly: this.options.readonly || options.interaction?.readonly === true,
      editEnabled: options.interaction?.editEnabled,
      currentResultsTitle:
        settings.config?.currentResults?.title ||
        this.options.currentResultsTitle,
    };
    this.element?.classList.toggle(
      "fully-collapsed",
      this.options.initiallyExpanded === false,
    );
    this.applyVisibility();
    await Promise.all([this.renderDatasets(), this.renderFilters()]);
  }
  applyVisibility() {
    if (!this.element) return;
    const standalone = ["standalone", "publish", "published"].includes(
      String(this.options.runtimeMode || "").toLowerCase(),
    );
    const readonly =
      this.options.readonly === true ||
      String(this.options.runtimeMode || "").toLowerCase() === "readonly";
    if (this.sourceHeader && !this.sourceHeader.isConnected)
      this.tableContainer.prepend(this.sourceHeader);
    if (this.createButton)
      this.createButton.hidden =
        readonly || standalone || this.options.editEnabled === false;
    if (this.fieldsButton)
      this.fieldsButton.hidden =
        readonly || standalone || this.options.showColumnPicker === false;
    if (this.optionsButton)
      this.optionsButton.hidden =
        readonly || standalone || this.options.showOptions === false;
    if (this.publishButton)
      this.publishButton.hidden =
        readonly || standalone || this.options.showPublish === false;
    if (this.sourceHeader)
      this.sourceHeader.hidden = this.options.showSourceHeader !== true;
    this.tableContainer.classList.toggle(
      "heurist-data-has-source-header",
      this.options.showSourceHeader === true,
    );
    if (this.datasetsSection)
      this.datasetsSection.hidden =
        this.options.showDatasets === false &&
        this.options.showCurrentResults === false;
    if (this.filtersSection)
      this.filtersSection.hidden = this.options.showFilters === false;
    const hasVisiblePanel = [this.datasetsSection, this.filtersSection].some(
      (section) => section && !section.hidden,
    );
    this.hasVisiblePanels = hasVisiblePanel;
    const hasVisibleToolButton = [
      this.createButton,
      this.fieldsButton,
      this.optionsButton,
      this.publishButton,
    ].some((button) => button && !button.hidden);
    this.element.hidden = !hasVisiblePanel && !hasVisibleToolButton;
    if (
      !hasVisiblePanel &&
      !this.element.classList.contains("fully-collapsed")
    ) {
      this.element.classList.add("body-collapsed");
    }
    this.updateExpandedState();
  }
  destroy() {
    for (const [name, handler] of this.listeners)
      this.api.removeEventListener(name, handler);
    this.tableContainer?.classList.remove("heurist-data-has-source-header");
    this.sourceHeader?.remove();
    this.element?.remove();
  }
}

function section(parent, title) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.className = "h-i18n";
  heading.textContent = title;
  const content = document.createElement("div");
  section.append(heading, content);
  parent.append(section);
  return { section, content };
}
function normalizeItems(result, fallback) {
  const values = Array.isArray(result) ? result : result?.items || [];
  return values
    .map((item) => ({
      ...item,
      id: Number(item.id ?? item.rec_ID),
      title: String(
        item.title ??
          item.name ??
          item.rec_Title ??
          `${fallback} ${item.id ?? item.rec_ID}`,
      ),
    }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0);
}
function normalizeIds(values) {
  return (Array.isArray(values) ? values : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}
function iconButton(icon, title, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-data-icon-button";
  button.title = $HR(title);
  button.setAttribute("aria-label", $HR(title));
  button.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    Promise.resolve(handler()).catch(() => {});
  });
  return button;
}
