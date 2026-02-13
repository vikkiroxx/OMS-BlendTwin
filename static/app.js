const API = '/api';

let editor = null;
let currentTrend = null;
let dbSchema = null;

// --- DOM Elements ---
const trendSelect = document.getElementById('trend-select');
const trendInfo = document.getElementById('trend-info');
const paramsContainer = document.getElementById('params-container');
const sqlEditorEl = document.getElementById('sql-editor');
const btnExecute = document.getElementById('btn-execute');
const btnSave = document.getElementById('btn-save');
const btnDelete = document.getElementById('btn-delete');
const btnNew = document.getElementById('btn-new');
const btnSettings = document.getElementById('btn-settings');
const dataGridContainer = document.getElementById('data-grid-container');
const dataGrid = document.getElementById('data-grid');
const resultsError = document.getElementById('results-error');
const resultsEmpty = document.getElementById('results-empty');
const plotEmpty = document.getElementById('plot-empty');
const plotsCanvas = document.getElementById('plots-canvas');
const btnAddPlot = document.getElementById('btn-add-plot');

// Modals
const modalNew = document.getElementById('modal-new');
const modalBuilder = document.getElementById('modal-builder');
const modalSettings = document.getElementById('modal-settings');

// Builder Elements
const btnBuilder = document.getElementById('btn-builder');
const builderTablesList = document.getElementById('builder-tables-list');
const builderColumnsContainer = document.getElementById('builder-columns-container');
const builderSqlPreview = document.getElementById('builder-sql-preview');
const btnInsertSql = document.getElementById('btn-insert-sql');
const btnAddJoin = document.getElementById('btn-add-join');
const joinsList = document.getElementById('joins-list');

let selectedTables = [];
let selectedCols = []; // { table, col }
let joins = []; // { leftTable, leftCol, rightTable, rightCol }

// Query results cache for multi-plot
let lastQueryResult = null; // { columns, rows }
let plotConfigs = []; // { id, title, type, x_col, y_col, series_col, pie_label_col, pie_value_col, x_label, y_label }
let chartInstances = []; // Chart.js instances

// --- Init CodeMirror ---
editor = CodeMirror.fromTextArea(sqlEditorEl, {
  mode: 'text/x-sql',
  theme: 'default',
  lineNumbers: true,
  indentUnit: 2,
  lineWrapping: true,
});

// --- Toast Notifications ---
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- API Helpers ---
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === 'string' ? d : (Array.isArray(d) ? d.map((e) => e?.msg || JSON.stringify(e)).join('; ') : JSON.stringify(data || res.statusText));
    throw new Error(msg);
  }
  return data;
}

// --- Load Trends ---
async function loadTrends() {
  const { trends } = await api('/trends');
  trendSelect.innerHTML = '<option value="">-- Select a trend --</option>';
  trends.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.template_id;
    opt.textContent = `${t.trend_code} - ${t.trend_name || t.trend_code}`;
    trendSelect.appendChild(opt);
  });
}

// --- Load Single Trend ---
async function loadTrend(templateId) {
  const trend = await api(`/trends/by-id/${templateId}`);
  currentTrend = trend;
  editor.setValue(trend.sql_template || '');

  renderParams(trend.parameters);

  trendInfo.textContent = trend.trend_name ? `${trend.trend_name} (${trend.trend_code})` : trend.trend_code;
  btnSave.disabled = false;
  btnDelete.disabled = false;
  btnSettings.classList.remove('hidden');
}

function paramDisplayName(p) {
  return (p.param_name === 'blendid' ? 'BlendID' : (p.ui_label || p.param_name));
}

function renderParams(params) {
  paramsContainer.innerHTML = '';
  if (params && params.length) {
    params
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .forEach((p) => {
        const div = document.createElement('div');
        div.className = 'param-field';
        div.innerHTML = `
          <label>${paramDisplayName(p)}${p.is_required ? ' *' : ''}</label>
          <input type="${p.param_type === 'number' ? 'number' : 'text'}" 
                 data-param="${p.param_name}" 
                 placeholder="${p.default_value || ''}"
                 value="${(p.default_value || '').replace(/"/g, '&quot;')}">
        `;
        paramsContainer.appendChild(div);
      });
  } else {
    paramsContainer.innerHTML = '<p class="muted">No parameters defined</p>';
  }
}

// --- Get Parameter Values ---
function getParams() {
  const params = {};
  paramsContainer.querySelectorAll('input[data-param]').forEach((inp) => {
    const v = inp.value.trim();
    if (v !== '') {
      params[inp.dataset.param] = inp.type === 'number' ? parseFloat(v) : v;
    }
  });
  return params;
}

// --- Execute ---
async function execute() {
  const sql = editor.getValue();
  if (!sql.trim()) {
    showError('Please enter SQL');
    return;
  }

  const params = getParams();
  resultsError.classList.add('hidden');
  resultsEmpty.classList.add('hidden');
  dataGridContainer.classList.add('hidden');

  try {
    const result = await api('/execute', {
      method: 'POST',
      body: JSON.stringify({ sql, params }),
    });

    if (result.error) {
      showError(result.error);
      lastQueryResult = null;
      btnAddPlot.disabled = true;
      plotEmpty.textContent = 'Execute a query to see results';
      return;
    }

    lastQueryResult = { columns: result.columns, rows: result.rows };
    plotConfigs = [];
    chartInstances.forEach(c => { if (c) c.destroy(); });
    chartInstances = [];

    renderTable(result.columns, result.rows);
    renderPlotsCanvas();

    btnAddPlot.disabled = false;
    dataGridContainer.classList.remove('hidden');
    plotEmpty.classList.remove('hidden');
    plotEmpty.textContent = 'Data loaded. Click "+ Add Plot" to create visualizations.';
  } catch (e) {
    showError(e.message);
    lastQueryResult = null;
    btnAddPlot.disabled = true;
    plotEmpty.textContent = 'Execute a query to see results';
  }
}

function showError(msg) {
  resultsError.textContent = msg;
  resultsError.classList.remove('hidden');
  resultsEmpty.classList.add('hidden');
  dataGridContainer.classList.add('hidden');
}

// --- Render Table ---
function renderTable(columns, rows) {
  let html = '<thead><tr>';
  columns.forEach((c) => (html += `<th>${escapeHtml(c)}</th>`));
  html += '</tr></thead><tbody>';
  rows.forEach((row) => {
    html += '<tr>';
    columns.forEach((col) => {
      const val = row[col];
      html += `<td>${val != null ? escapeHtml(String(val)) : ''}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  dataGrid.innerHTML = html;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// --- Multi-Plot Canvas ---
function renderPlotsCanvas() {
  if (!plotsCanvas) return;
  plotsCanvas.innerHTML = '';
  chartInstances = [];
  if (plotConfigs.length === 0) {
    if (plotEmpty) plotEmpty.classList.remove('hidden');
    return;
  }
  if (plotEmpty) plotEmpty.classList.add('hidden');
  plotConfigs.forEach((cfg, idx) => {
    const card = document.createElement('div');
    card.className = 'plot-card';
    card.innerHTML = `
      <div class="plot-card-header">
        <span class="plot-card-title">${escapeHtml(cfg.title || 'Plot ' + (idx + 1))}</span>
        <button type="button" class="btn btn-danger btn-sm plot-remove" data-idx="${idx}">Remove</button>
      </div>
      <div class="plot-card-body">
        <canvas id="plot-canvas-${idx}"></canvas>
      </div>
    `;
    plotsCanvas.appendChild(card);
    const canvas = card.querySelector('canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const instance = renderSinglePlot(ctx, cfg);
      chartInstances.push(instance);
    }
    card.querySelector('.plot-remove')?.addEventListener('click', () => {
      plotConfigs.splice(idx, 1);
      renderPlotsCanvas();
    });
  });
}

function renderSinglePlot(ctx, cfg) {
  const { columns = [], rows = [] } = lastQueryResult || {};
  if (!columns.length || !rows.length) return null;

  const xCol = cfg.x_col || columns[0];
  const yCol = cfg.y_col || columns[1];
  const seriesCol = cfg.series_col;
  const seriesMode = cfg.series_mode || 'single';
  const yCols = cfg.y_cols || [];
  const customSeries = cfg.series || [];

  if (cfg.type === 'pie') {
    const labelCol = cfg.pie_label_col || columns[0];
    const valueCol = cfg.pie_value_col || columns[1];
    const labelMap = {};
    rows.forEach((r) => {
      const lbl = String(r[labelCol] ?? '');
      const val = Number(r[valueCol]) || 0;
      labelMap[lbl] = (labelMap[lbl] || 0) + val;
    });
    const datasets = [{
      data: Object.values(labelMap),
      backgroundColor: Object.keys(labelMap).map((_, i) => getColor(i)),
      borderColor: '#fff',
      borderWidth: 1,
    }];
    const labels = Object.keys(labelMap);
    return new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          title: { display: true, text: cfg.title || 'Pie Chart' },
          legend: { position: 'right' },
        },
      },
    });
  }

  if (cfg.type === 'bar') {
    let datasets;
    if (seriesMode === 'custom' && customSeries.length > 0) {
      datasets = customSeries.map((s, i) => ({
        label: s.label,
        data: rows.map((r) => ({ x: String(r[s.x_col]), y: Number(r[s.y_col]) || 0 })),
        backgroundColor: getColor(i) + '80',
      }));
    } else if (seriesMode === 'multi_col' && yCols.length > 0) {
      datasets = yCols.map((col, i) => ({
        label: col,
        data: rows.map((r) => ({ x: String(r[xCol]), y: Number(r[col]) || 0 })),
        backgroundColor: getColor(i) + '80',
      }));
    } else if (seriesCol) {
      datasets = buildSeriesDatasets(rows, xCol, yCol, seriesCol);
    } else {
      datasets = [{
        label: yCol,
        data: rows.map((r) => ({ x: String(r[xCol]), y: Number(r[yCol]) || 0 })),
        backgroundColor: getColor(0) + '80',
      }];
    }
    return new Chart(ctx, {
      type: 'bar',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          title: { display: true, text: cfg.title || 'Bar Chart' },
          legend: { position: 'top' },
        },
        scales: {
          x: {
            title: { display: true, text: cfg.x_label || xCol },
            type: 'category',
          },
          y: {
            title: { display: true, text: cfg.y_label || yCol },
            type: 'linear',
          },
        },
      },
    });
  }

  // line (default)
  let datasets;
  if (seriesMode === 'custom' && customSeries.length > 0) {
    datasets = customSeries.map((s, i) => ({
      label: s.label,
      data: rows.map((r) => ({
        x: isNaN(Number(r[s.x_col])) ? r[s.x_col] : Number(r[s.x_col]),
        y: Number(r[s.y_col]) || 0,
      })),
      borderColor: getColor(i),
      backgroundColor: getColor(i) + '40',
      fill: false,
      tension: 0.2,
    }));
  } else if (seriesMode === 'multi_col' && yCols.length > 0) {
    datasets = yCols.map((col, i) => ({
      label: col,
      data: rows.map((r) => ({
        x: isNaN(Number(r[xCol])) ? r[xCol] : Number(r[xCol]),
        y: Number(r[col]) || 0,
      })),
      borderColor: getColor(i),
      backgroundColor: getColor(i) + '40',
      fill: false,
      tension: 0.2,
    }));
  } else if (seriesCol) {
    datasets = buildSeriesDatasets(rows, xCol, yCol, seriesCol);
  } else {
    datasets = [{
      label: yCol,
      data: rows.map((r) => ({ x: Number(r[xCol]) || 0, y: Number(r[yCol]) || 0 })),
      borderColor: getColor(0),
      backgroundColor: getColor(0) + '40',
      fill: false,
      tension: 0.2,
    }];
  }
  return new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: { display: true, text: cfg.title || 'Line Chart' },
        legend: { position: 'top' },
      },
      scales: {
        x: {
          title: { display: true, text: cfg.x_label || xCol },
          type: 'linear',
        },
        y: {
          title: { display: true, text: cfg.y_label || yCol },
          type: 'linear',
        },
      },
    },
  });
}

function buildSeriesDatasets(rows, xCol, yCol, seriesCol) {
  const seriesMap = {};
  rows.forEach((row) => {
    const s = String(row[seriesCol] ?? '');
    if (!seriesMap[s]) seriesMap[s] = [];
    seriesMap[s].push({
      x: isNaN(Number(row[xCol])) ? row[xCol] : Number(row[xCol]),
      y: Number(row[yCol]) || 0,
    });
  });
  return Object.entries(seriesMap).map(([label, d], i) => ({
    label,
    data: d,
    borderColor: getColor(i),
    backgroundColor: getColor(i) + '40',
    fill: false,
    tension: 0.2,
  }));
}

function renderPlot(columns, rows) {
  // Multi-plot canvas replaces single plot; user adds plots via "+ Add Plot"
}

function getColor(i) {
  const colors = ['#0969da', '#1a7f37', '#9a6700', '#cf222e', '#8250df', '#2da44e'];
  return colors[i % colors.length];
}

// --- CRUD Actions ---
async function save() {
  if (!currentTrend) return;
  const sql = editor.getValue();
  try {
    await api(`/trends/${currentTrend.template_id}`, {
      method: 'PUT',
      body: JSON.stringify({ sql_template: sql, trend_name: currentTrend.trend_name }),
    });
    showToast('success', 'Saved successfully');
  } catch (e) {
    showToast('error', 'Save failed: ' + e.message);
  }
}

async function deleteTrend() {
  if (!currentTrend) return;
  if (!confirm(`Are you sure you want to delete trend "${currentTrend.trend_code}"?`)) return;

  try {
    await api(`/trends/${currentTrend.template_id}`, { method: 'DELETE' });
    currentTrend = null;
    editor.setValue('');
    btnSave.disabled = true;
    btnDelete.disabled = true;
    btnSettings.classList.add('hidden');
    trendInfo.textContent = '';
    await loadTrends();
    showToast('success', 'Trend deleted');
  } catch (e) {
    showToast('error', 'Delete failed: ' + e.message);
  }
}

// --- Modals ---
let newParamsAdded = []; // { parameter, type, required, default }

let trendParamsList = [];
let trendParamsLoaded = false;

async function loadTrendParams() {
  if (trendParamsLoaded) return trendParamsList;
  try {
    const { params } = await api('/trend-params');
    trendParamsList = params || [];
    trendParamsLoaded = true;
  } catch (e) {
    trendParamsList = [];
  }
  return trendParamsList;
}

function populateParamDropdown(sel, loading = false) {
  if (loading) {
    sel.innerHTML = '<option value="">Loading…</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = '<option value="">— Select parameter —</option>' +
    trendParamsList
      .filter((p) => p.toLowerCase() !== 'blendid')
      .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
      .join('');
}

async function showNewModal() {
  modalNew.classList.remove('hidden');
  document.getElementById('new-trend-code').value = '';
  document.getElementById('new-trend-name').value = '';
  document.getElementById('new-template-id').value = '';
  document.getElementById('new-refid').value = '';
  document.getElementById('new-sql-template').value = 'SELECT cycleno, value, series FROM your_table WHERE BlendID = :blendid';
  newParamsAdded = [];
  renderNewParamsList();

  const sel = document.getElementById('new-param-name');
  if (!trendParamsLoaded) {
    populateParamDropdown(sel, true);
    await loadTrendParams();
  }
  populateParamDropdown(sel);
}

function renderNewParamsList() {
  const container = document.getElementById('new-params-added');
  if (!container) return;
  container.innerHTML = newParamsAdded.map((p, i) => `
    <div class="param-row param-row-added">
      <span>${escapeHtml(p.parameter)}</span>
      <button type="button" class="btn btn-danger btn-sm" data-idx="${i}">Remove</button>
    </div>
  `).join('');
  container.querySelectorAll('button[data-idx]').forEach((btn) => {
    btn.onclick = () => {
      newParamsAdded.splice(parseInt(btn.dataset.idx, 10), 1);
      renderNewParamsList();
    };
  });
}

document.getElementById('btn-add-param')?.addEventListener('click', () => {
  const nameEl = document.getElementById('new-param-name');
  const name = (nameEl?.value || '').trim();
  if (!name || name.toLowerCase() === 'blendid') {
    showToast('error', 'BlendID is already included. Select a different parameter.');
    return;
  }
  if (newParamsAdded.some((p) => p.parameter.toLowerCase() === name.toLowerCase())) {
    showToast('error', 'This parameter is already added.');
    return;
  }
  newParamsAdded.push({
    parameter: name,
    type: 'string',
    required: 'Y',
    default: null,
  });
  nameEl.value = '';
  renderNewParamsList();
});

async function createTrend() {
  const code = document.getElementById('new-trend-code').value.trim();
  const name = document.getElementById('new-trend-name').value.trim();
  const sql = document.getElementById('new-sql-template').value.trim();
  const templateId = document.getElementById('new-template-id')?.value?.trim() || null;
  const refid = document.getElementById('new-refid')?.value?.trim() || null;

  if (!code || !name || !sql) {
    showToast('error', 'Please fill Trend Code, Trend Name, and SQL Template');
    return;
  }

  const parameters = [
    { parameter: 'blendid', type: 'string', required: 'Y', default: null },
    ...newParamsAdded.map((p) => ({
      parameter: p.parameter,
      type: p.type,
      required: p.required,
      multi: 'N',
      default: p.default || null,
    })),
  ];

  try {
    await api('/trends', {
      method: 'POST',
      body: JSON.stringify({
        trend_code: code,
        trend_name: name,
        sql_template: sql,
        refid: refid || undefined,
        template_id: templateId || undefined,
        parameters,
      }),
    });
    modalNew.classList.add('hidden');
    await loadTrends();
    showToast('success', 'Trend created successfully');
  } catch (e) {
    showToast('error', 'Create failed: ' + e.message);
  }
}

// --- Advanced Visual Query Builder ---

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  };
});

async function showBuilderModal() {
  modalBuilder.classList.remove('hidden');
  if (!dbSchema) {
    dbSchema = await api('/schema');
    renderBuilderTables();
  }
}

function renderBuilderTables() {
  builderTablesList.innerHTML = '';
  Object.keys(dbSchema).sort().forEach(table => {
    const div = document.createElement('div');
    div.className = 'col-item';
    const checked = selectedTables.includes(table) ? 'checked' : '';
    div.innerHTML = `<input type="checkbox" value="${table}" ${checked}> <span>${table}</span>`;
    div.querySelector('input').onchange = (e) => {
      if (e.target.checked) selectedTables.push(table);
      else selectedTables = selectedTables.filter(t => t !== table);
      renderBuilderColumns();
      updateBuilderPreview();
    };
    builderTablesList.appendChild(div);
  });
}

function renderBuilderColumns() {
  builderColumnsContainer.innerHTML = '';
  if (selectedTables.length === 0) {
    builderColumnsContainer.innerHTML = '<p class="muted">Select tables on the left to see columns</p>';
    return;
  }

  selectedTables.forEach(table => {
    const header = document.createElement('div');
    header.className = 'col-header';
    header.textContent = table;
    builderColumnsContainer.appendChild(header);

    const cols = dbSchema[table];
    cols.forEach(col => {
      const div = document.createElement('div');
      div.className = 'col-item';
      const isChecked = selectedCols.some(sc => sc.table === table && sc.col === col);
      div.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''}> <span>${col}</span>`;
      div.querySelector('input').onchange = (e) => {
        if (e.target.checked) selectedCols.push({ table, col });
        else selectedCols = selectedCols.filter(sc => !(sc.table === table && sc.col === col));
        updateBuilderPreview();
      };
      builderColumnsContainer.appendChild(div);
    });
  });
}

btnAddJoin.onclick = () => {
  const row = document.createElement('div');
  row.className = 'join-row';

  const tableOptions = selectedTables.map(t => `<option value="${t}">${t}</option>`).join('');

  row.innerHTML = `
        <select class="join-lt"></select>
        .
        <select class="join-lc"></select>
        =
        <select class="join-rt"></select>
        .
        <select class="join-rc"></select>
        <button class="btn btn-danger btn-sm join-del">X</button>
    `;

  const lt = row.querySelector('.join-lt');
  const lc = row.querySelector('.join-lc');
  const rt = row.querySelector('.join-rt');
  const rc = row.querySelector('.join-rc');

  lt.innerHTML = tableOptions;
  rt.innerHTML = tableOptions;

  const updateCols = (tableSel, colSel) => {
    const table = tableSel.value;
    colSel.innerHTML = dbSchema[table].map(c => `<option value="${c}">${c}</option>`).join('');
  };

  lt.onchange = () => updateCols(lt, lc);
  rt.onchange = () => updateCols(rt, rc);

  updateCols(lt, lc);
  updateCols(rt, rc);

  row.querySelectorAll('select').forEach(s => s.onchange = (e) => {
    if (e.target.classList.contains('join-lt')) updateCols(lt, lc);
    if (e.target.classList.contains('join-rt')) updateCols(rt, rc);
    updateBuilderPreview();
  });

  row.querySelector('.join-del').onclick = () => {
    row.remove();
    updateBuilderPreview();
  };

  joinsList.appendChild(row);
  updateBuilderPreview();
};

function updateBuilderPreview() {
  if (selectedTables.length === 0) {
    builderSqlPreview.value = '';
    return;
  }

  const selectPart = selectedCols.length > 0
    ? selectedCols.map(sc => `\`${sc.table}\`.\`${sc.col}\``).join(', ')
    : '*';

  const firstTable = selectedTables[0];
  let sql = `SELECT ${selectPart}\nFROM \`${firstTable}\``;

  // Simple Join generation
  const rows = Array.from(joinsList.querySelectorAll('.join-row'));
  const joinedTables = new Set([firstTable]);

  rows.forEach(row => {
    const lt = row.querySelector('.join-lt').value;
    const lc = row.querySelector('.join-lc').value;
    const rt = row.querySelector('.join-rt').value;
    const rc = row.querySelector('.join-rc').value;

    let joinTable = '';
    if (joinedTables.has(lt) && !joinedTables.has(rt)) joinTable = rt;
    else if (joinedTables.has(rt) && !joinedTables.has(lt)) joinTable = lt;
    else joinTable = rt; // fallback

    sql += `\nJOIN \`${joinTable}\` ON \`${lt}\`.\`${lc}\` = \`${rt}\`.\`${rc}\``;
    joinedTables.add(lt);
    joinedTables.add(rt);
  });

  // Add other selected tables that aren't joined yet (as cross joins or manual joins needed)
  selectedTables.forEach(t => {
    if (!joinedTables.has(t)) {
      sql += `\nJOIN \`${t}\` ON -- Define join manually --`;
    }
  });

  sql += '\nLIMIT 100';
  builderSqlPreview.value = sql;
}

btnInsertSql.onclick = () => {
  const sql = builderSqlPreview.value;
  if (sql) {
    const doc = editor.getDoc();
    const cursor = doc.getCursor();
    doc.replaceRange(sql, cursor);
    modalBuilder.classList.add('hidden');
  }
};

// --- Settings Modal ---
function showSettingsModal() {
  if (!currentTrend) return;
  modalSettings.classList.remove('hidden');
  settingsTrendName.value = currentTrend.trend_name || '';

  settingsParamsList.innerHTML = '';
  currentTrend.parameters.forEach(p => {
    const div = document.createElement('div');
    div.className = 'setting-row';
    div.innerHTML = `
            <span>${paramDisplayName(p)}</span>
            <input type="text" value="${(p.ui_label || paramDisplayName(p)).replace(/"/g, '&quot;')}" data-orig="${p.param_name}">
        `;
    settingsParamsList.appendChild(div);
  });
}

// Simple Apply logic (updates local UI only for this demo unless API expanded)
document.getElementById('btn-save-settings').onclick = () => {
  currentTrend.trend_name = settingsTrendName.value;
  settingsParamsList.querySelectorAll('input').forEach(inp => {
    const p = currentTrend.parameters.find(x => x.param_name === inp.dataset.orig);
    if (p) p.ui_label = inp.value;
  });

  trendInfo.textContent = currentTrend.trend_name ? `${currentTrend.trend_name} (${currentTrend.trend_code})` : currentTrend.trend_code;
  renderParams(currentTrend.parameters);
  modalSettings.classList.add('hidden');
};

// --- Event Listeners ---
trendSelect.addEventListener('change', async () => {
  const id = trendSelect.value;
  if (!id) {
    currentTrend = null;
    editor.setValue('');
    btnSave.disabled = true;
    btnDelete.disabled = true;
    btnSettings.classList.add('hidden');
    trendInfo.textContent = '';
    renderParams([]);
    return;
  }
  await loadTrend(id);
});

btnExecute.onclick = execute;
btnSave.onclick = save;
btnDelete.onclick = deleteTrend;
btnNew.onclick = showNewModal;
btnSettings.onclick = showSettingsModal;
btnBuilder.onclick = showBuilderModal;

document.getElementById('btn-cancel-new').onclick = () => modalNew.classList.add('hidden');
document.getElementById('btn-create').onclick = createTrend;
document.getElementById('btn-cancel-builder').onclick = () => modalBuilder.classList.add('hidden');
document.getElementById('btn-cancel-settings').onclick = () => modalSettings.classList.add('hidden');

// --- Add Plot Modal ---
const modalAddPlot = document.getElementById('modal-add-plot');

function showAddPlotModal() {
  if (!lastQueryResult?.columns?.length) {
    showToast('error', 'Execute a query first to add plots.');
    return;
  }
  const cols = lastQueryResult.columns;
  const sel = (id) => document.getElementById(id);
  sel('plot-title').value = '';
  sel('plot-type').value = 'line';
  sel('plot-series-mode').value = 'single';
  sel('plot-x-col').innerHTML = cols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel('plot-y-col').innerHTML = cols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel('plot-series-col').innerHTML = '<option value="">— Select —</option>' + cols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel('plot-pie-label-col').innerHTML = cols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel('plot-pie-value-col').innerHTML = cols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const multiContainer = document.getElementById('plot-y-cols-multi');
  multiContainer.innerHTML = cols.map((c) => `<label class="plot-check-label"><input type="checkbox" value="${escapeHtml(c)}"> ${escapeHtml(c)}</label>`).join('');
  sel('plot-x-label').value = '';
  sel('plot-y-label').value = '';
  plotSeriesRows = [];
  renderPlotSeriesList();
  togglePlotTypeFields('line');
  toggleSeriesMode(sel('plot-series-mode').value);
  modalAddPlot?.classList.remove('hidden');
}

function toggleSeriesMode(mode) {
  document.querySelector('.plot-mode-single')?.classList.toggle('hidden', mode === 'multi_col' || mode === 'custom');
  document.querySelector('.plot-mode-series')?.classList.toggle('hidden', mode !== 'series_col');
  document.querySelector('.plot-mode-multi')?.classList.toggle('hidden', mode !== 'multi_col');
  document.querySelector('.plot-mode-custom')?.classList.toggle('hidden', mode !== 'custom');
}

function renderPlotSeriesList() {
  const list = document.getElementById('plot-series-list');
  if (!list) return;
  const cols = lastQueryResult?.columns || [];
  const opt = (val) => cols.map((c) => `<option value="${escapeHtml(c)}" ${c === val ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  list.innerHTML = plotSeriesRows.map((row, i) => `
    <div class="plot-series-row" data-idx="${i}">
      <input type="text" placeholder="Label (e.g. Stream Quality)" value="${escapeHtml(row.label || '')}" class="plot-series-label">
      <select class="plot-series-x-col">${opt(row.x_col)}</select>
      <select class="plot-series-y-col">${opt(row.y_col)}</select>
      <button type="button" class="btn btn-danger btn-sm plot-series-remove">×</button>
    </div>
  `).join('');
  list.querySelectorAll('.plot-series-remove').forEach((btn) => {
    btn.onclick = () => {
      plotSeriesRows.splice(parseInt(btn.closest('.plot-series-row').dataset.idx, 10), 1);
      renderPlotSeriesList();
    };
  });
}

let plotSeriesRows = [];

document.getElementById('btn-add-series')?.addEventListener('click', () => {
  const cols = lastQueryResult?.columns || [];
  const first = cols[0];
  const second = cols[1] || first;
  plotSeriesRows.push({ label: '', x_col: first, y_col: second });
  renderPlotSeriesList();
});

function togglePlotTypeFields(type) {
  document.querySelectorAll('.plot-config-line').forEach((el) => { el.style.display = type === 'pie' ? 'none' : ''; });
  document.querySelectorAll('.plot-config-pie').forEach((el) => { el.classList.toggle('hidden', type !== 'pie'); });
}

document.getElementById('plot-type')?.addEventListener('change', (e) => {
  togglePlotTypeFields(e.target.value);
});
document.getElementById('plot-series-mode')?.addEventListener('change', (e) => {
  toggleSeriesMode(e.target.value);
});

function savePlotConfig() {
  const sel = (id) => document.getElementById(id);
  const type = sel('plot-type')?.value || 'line';
  const seriesMode = sel('plot-series-mode')?.value || 'single';
  const cfg = {
    title: sel('plot-title')?.value?.trim() || 'Plot',
    type,
    x_col: sel('plot-x-col')?.value || lastQueryResult?.columns?.[0],
    y_col: sel('plot-y-col')?.value || lastQueryResult?.columns?.[1],
    series_col: sel('plot-series-col')?.value || undefined,
    series_mode: seriesMode,
    x_label: sel('plot-x-label')?.value?.trim() || undefined,
    y_label: sel('plot-y-label')?.value?.trim() || undefined,
  };
  if (seriesMode === 'multi_col') {
    cfg.y_cols = Array.from(document.querySelectorAll('#plot-y-cols-multi input:checked')).map((cb) => cb.value);
    if (!cfg.y_cols?.length) {
      showToast('error', 'Select at least one Y column for multi-series plot.');
      return;
    }
  }
  if (seriesMode === 'custom') {
    cfg.series = [];
    document.querySelectorAll('.plot-series-row').forEach((row) => {
      const label = row.querySelector('.plot-series-label')?.value?.trim();
      const xCol = row.querySelector('.plot-series-x-col')?.value;
      const yCol = row.querySelector('.plot-series-y-col')?.value;
      if (label && xCol && yCol) {
        cfg.series.push({ label, x_col: xCol, y_col: yCol });
      }
    });
    if (!cfg.series?.length) {
      showToast('error', 'Add at least one series with label, X column, and Y column.');
      return;
    }
  }
  if (type === 'pie') {
    cfg.pie_label_col = sel('plot-pie-label-col')?.value;
    cfg.pie_value_col = sel('plot-pie-value-col')?.value;
  }
  plotConfigs.push(cfg);
  renderPlotsCanvas();
  modalAddPlot?.classList.add('hidden');
}

btnAddPlot?.addEventListener('click', showAddPlotModal);
document.getElementById('btn-cancel-plot')?.addEventListener('click', () => modalAddPlot?.classList.add('hidden'));
document.getElementById('btn-save-plot')?.addEventListener('click', savePlotConfig);

// --- Init ---
loadTrends().catch(console.error);
loadTrendParams().catch(() => {}); // Prefetch for Create Trend modal
