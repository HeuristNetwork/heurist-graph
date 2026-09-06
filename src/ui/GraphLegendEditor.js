import { $HR } from '@heurist/client-core/ui';

/** Session configuration; persisted Dataset editing is delegated to the host. */
export class GraphLegendEditor {
  constructor({ api, onError }) { Object.assign(this, { api, onError }); }

  open(mode) {
    const app = this.api.application;
    const generation = app.generation;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'heurist-graph-legend-editor';
    const heading = document.createElement('h3');
    heading.textContent = $HR(mode === 'links' ? 'Define initial links' : 'Add new rule');
    this.dialog.setAttribute('aria-label', heading.textContent);
    const note = document.createElement('p');
    note.textContent = $HR('Changes apply to this viewing session. Use Edit Dataset to edit the saved definition.');
    this.dialog.append(heading, note);
    const field = (title, value, multiline = false) => {
      const label = document.createElement('label'); label.textContent = $HR(title);
      const input = document.createElement(multiline ? 'textarea' : 'input'); input.value = value;
      label.append(input); this.dialog.append(label); return input;
    };
    let links, name, description, query;
    if (mode === 'links') {
      const current = app.source?.links ?? app.dataset?.links ?? app.config.links ?? 'all';
      links = field('Links (one definition per line, or all)', Array.isArray(current) ? current.join('\n') : current, true);
      links.placeholder = '10:lt240:48\n10:rt3260:10';
    } else {
      name = field('Rule name', '');
      description = field('Description', '');
      query = field('Expansion query (JSON)', '', true);
      query.placeholder = '{"t":48,"lf:240":[{"t":10}]}';
    }
    const errorText = document.createElement('p'); errorText.setAttribute('role', 'alert');
    const footer = document.createElement('footer');
    const cancel = document.createElement('button'); cancel.textContent = $HR('Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => this.destroy());
    const save = document.createElement('button'); save.type = 'button'; save.textContent = $HR('Apply');
    save.addEventListener('click', async () => {
      errorText.textContent = '';
      save.disabled = true;
      try {
        if (app.generation !== generation) throw new Error($HR('The active graph changed. Reopen this editor.'));
        if (app.config.persistedSettings?.options?.interaction?.editEnabled === false) throw new Error($HR('Editing is disabled.'));
        if (mode === 'links') {
          const value = links.value.trim();
          if (!value) throw new Error($HR('Enter link definitions or all.'));
          const specs = value.toLowerCase() === 'all' ? 'all' : value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
          if (specs !== 'all' && specs.some(s => !/^\d+:(?:lt|rt)\d+:\d+$/.test(s))) throw new Error($HR('Use link definitions such as 10:lt240:48 or 10:rt3260:10.'));
          await app.load({ query: app.config.query, links: specs, internal: true, remember: false });
          if (app.source) app.source.links = specs;
        } else {
          if (!name.value.trim()) throw new Error($HR('Enter a rule name.'));
          const expression = JSON.parse(query.value);
          if (!expression || typeof expression !== 'object' || Array.isArray(expression)) throw new Error($HR('The expansion query must be a JSON object.'));
          const target = app.dataset || app.config;
          target.rules = [...(target.rules || []), { name: name.value.trim(), description: description.value.trim(), query: expression }];
          app.dispatch('heurist-graph-visibility-changed', {});
        }
        this.destroy();
      } catch (error) {
        errorText.textContent = error.message;
        this.onError?.(error);
      } finally { save.disabled = false; }
    });
    footer.append(cancel, save); this.dialog.append(errorText, footer);
    this.dialog.addEventListener('close', () => this.destroy());
    document.body.append(this.dialog); this.dialog.showModal();
  }

  destroy() { this.dialog?.remove(); this.dialog = null; }
}
