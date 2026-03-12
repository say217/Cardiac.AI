const dropZone = document.getElementById('drop-zone');
const csvInput = document.getElementById('csv-input');
const metaCard = document.getElementById('meta-card');
const predictBtn = document.getElementById('predict-btn');
const btnText = predictBtn.querySelector('.btn-text');
const btnLoader = document.getElementById('btn-loader');
const statusMsg = document.getElementById('status-msg');
const sheetWrapper = document.getElementById('sheet-wrapper');
const sheetHead = document.getElementById('sheet-head');
const sheetBody = document.getElementById('sheet-body');
const placeholder = document.getElementById('sheet-placeholder');
const rowCounter = document.getElementById('row-counter');
const viewTabs = document.getElementById('view-tabs');
const downloadPredictedButton = document.getElementById('download-predicted-btn');
const vizContainer = document.getElementById('viz-container');
const vizGrid = document.getElementById('viz-grid');

let currentFile = null;
let uploadedCols = [];
let predictionData = null;
let chartInstances = [];

const RISK_COLORS = {
  Low: '#6fcf97',
  Medium: '#f2c94c',
  High: '#f2994a',
  'Very High': '#eb5757',
};

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function badgeFor(level) {
  const className = level.toLowerCase().replace(/\s+/g, '-');
  return `<span class="badge badge-${className}">${level}</span>`;
}

function resetAll() {
  predictionData = null;
  uploadedCols = [];
  chartInstances.forEach(chart => chart.destroy());
  chartInstances = [];
  vizContainer.classList.remove('visible');
  vizGrid.innerHTML = '';
  viewTabs.classList.remove('visible');
  viewTabs.querySelectorAll('.view-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === 'data');
  });
  downloadPredictedButton.classList.remove('visible');
  sheetWrapper.classList.remove('visible');
  document.getElementById('sheet-table').classList.remove('has-predictions');
  sheetHead.innerHTML = '';
  sheetBody.innerHTML = '';
  rowCounter.textContent = '';
  placeholder.style.display = 'flex';
  predictBtn.classList.remove('visible');
  metaCard.classList.remove('visible');
  statusMsg.textContent = '';
  statusMsg.classList.remove('error');
}

function escapeCsvValue(value) {
  const normalized = value == null ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildPredictedCsv() {
  if (!predictionData) return '';

  const lines = [];
  lines.push(predictionData.columns.map(escapeCsvValue).join(','));
  predictionData.rows.forEach(row => {
    lines.push(row.map(escapeCsvValue).join(','));
  });
  return lines.join('\r\n');
}

function downloadPredictedCsv() {
  if (!predictionData) return;

  const csv = buildPredictedCsv();
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'predicted-data';

  link.href = url;
  link.download = `${baseName}-predicted.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

viewTabs.addEventListener('click', event => {
  const tab = event.target.closest('.view-tab');
  if (!tab) return;

  viewTabs.querySelectorAll('.view-tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');

  if (tab.dataset.view === 'data') {
    sheetWrapper.classList.add('visible');
    rowCounter.style.display = '';
    vizContainer.classList.remove('visible');
    return;
  }

  sheetWrapper.classList.remove('visible');
  rowCounter.style.display = 'none';
  vizContainer.classList.add('visible');
  if (predictionData && chartInstances.length === 0) buildCharts();
});

dropZone.addEventListener('click', () => csvInput.click());

dropZone.addEventListener('dragover', event => {
  event.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = event.dataTransfer.files;
  if (files.length) {
    csvInput.files = files;
    handleFile(files[0]);
  }
});

csvInput.addEventListener('change', () => {
  if (csvInput.files.length) handleFile(csvInput.files[0]);
});

async function handleFile(file) {
  resetAll();
  currentFile = file;
  statusMsg.textContent = 'Uploading...';

  const form = new FormData();
  form.append('file', file);

  try {
    const response = await fetch('/test/upload', { method: 'POST', body: form });
    const data = await response.json();
    if (data.error) {
      statusMsg.textContent = data.error;
      statusMsg.classList.add('error');
      return;
    }

    const metadata = data.metadata;
    document.getElementById('meta-name').textContent = metadata.file_name;
    document.getElementById('meta-size').textContent = formatBytes(metadata.file_size);
    document.getElementById('meta-rows').textContent = metadata.rows.toLocaleString();
    document.getElementById('meta-cols').textContent = metadata.columns;
    document.getElementById('meta-col-names').textContent = metadata.column_names.join(', ');
    metaCard.classList.add('visible');

    renderTable(data.columns, data.rows);
    uploadedCols = data.metadata.column_names;
    predictBtn.classList.add('visible');
    statusMsg.textContent = 'Ready - click Predict to run model';
  } catch (error) {
    console.error(error);
    statusMsg.textContent = 'Upload failed';
    statusMsg.classList.add('error');
  }
}

function renderTable(columns, rows) {
  const hiddenIndex = columns.findIndex(column => column.toLowerCase() === 'heart_risk');
  const visibleColumns = hiddenIndex === -1 ? columns : columns.filter((_, index) => index !== hiddenIndex);
  const visibleRows = hiddenIndex === -1 ? rows : rows.map(row => row.filter((_, index) => index !== hiddenIndex));

  const table = document.getElementById('sheet-table');
  table.classList.remove('has-predictions');
  sheetHead.innerHTML = '<tr><th>#</th>' + visibleColumns.map(column => `<th>${column}</th>`).join('') + '</tr>';
  sheetBody.innerHTML = visibleRows.map((row, rowIndex) =>
    '<tr><td>' + (rowIndex + 1) + '</td>' + row.map(value => `<td>${value}</td>`).join('') + '</tr>'
  ).join('');
  placeholder.style.display = 'none';
  sheetWrapper.classList.add('visible');
  rowCounter.textContent = `Showing ${visibleRows.length} row${visibleRows.length !== 1 ? 's' : ''}`;
}

function renderTableWithBadge(columns, rows, predictionColumnIndex) {
  const table = document.getElementById('sheet-table');
  table.classList.add('has-predictions');
  sheetHead.innerHTML = '<tr><th>#</th>' + columns.map(column => `<th>${column}</th>`).join('') + '</tr>';
  sheetBody.innerHTML = rows.map((row, rowIndex) =>
    '<tr><td>' + (rowIndex + 1) + '</td>' + row.map((value, columnIndex) =>
      columnIndex === predictionColumnIndex ? `<td>${badgeFor(String(value))}</td>` : `<td>${value}</td>`
    ).join('') + '</tr>'
  ).join('');
  placeholder.style.display = 'none';
  sheetWrapper.classList.add('visible');
  rowCounter.textContent = `Showing ${rows.length} row${rows.length !== 1 ? 's' : ''} with predictions`;
}

const REQUIRED_COLS = ['age', 'sex', 'systolic_bp', 'cholesterol', 'bmi', 'smoking', 'diabetes', 'resting_hr', 'physical_activity', 'family_history'];

predictBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const lowerColumns = uploadedCols.map(column => column.toLowerCase());
  const missingColumns = REQUIRED_COLS.filter(column => !lowerColumns.includes(column));
  if (missingColumns.length) {
    statusMsg.textContent = 'Missing required columns: ' + missingColumns.join(', ');
    statusMsg.classList.add('error');
    return;
  }

  predictBtn.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';
  statusMsg.textContent = 'Running model...';
  statusMsg.classList.remove('error');

  chartInstances.forEach(chart => chart.destroy());
  chartInstances = [];
  vizGrid.innerHTML = '';
  vizContainer.classList.remove('visible');

  const form = new FormData();
  form.append('file', currentFile);

  try {
    const response = await fetch('/test/predict', { method: 'POST', body: form });
    const data = await response.json();
    if (data.error) {
      statusMsg.textContent = data.error;
      statusMsg.classList.add('error');
      return;
    }

    predictionData = data;
    const predictionIndex = data.columns.indexOf('Predicted Risk');
    renderTableWithBadge(data.columns, data.rows, predictionIndex);
    viewTabs.classList.add('visible');
    downloadPredictedButton.classList.add('visible');
    viewTabs.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === 'data');
    });
    sheetWrapper.classList.add('visible');
    vizContainer.classList.remove('visible');
    rowCounter.style.display = '';
    statusMsg.textContent = 'Prediction complete - switch to Visualize for charts';
  } catch (error) {
    console.error(error);
    statusMsg.textContent = 'Prediction failed';
    statusMsg.classList.add('error');
  } finally {
    predictBtn.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
});

downloadPredictedButton.addEventListener('click', () => {
  downloadPredictedCsv();
});

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: 'rgba(255,255,255,0.55)',
        font: { size: 10, family: "'DM Mono', monospace" },
      },
    },
    tooltip: { titleFont: { size: 11 }, bodyFont: { size: 11 } },
  },
  scales: {
    x: {
      ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } },
      grid: { color: 'rgba(255,255,255,0.06)' },
    },
    y: {
      ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } },
      grid: { color: 'rgba(255,255,255,0.06)' },
    },
  },
};

function makeCard(title) {
  const card = document.createElement('div');
  card.className = 'plot-card';
  card.innerHTML = `<h3>${title}</h3>`;
  const canvas = document.createElement('canvas');
  card.appendChild(canvas);
  vizGrid.appendChild(card);
  return canvas;
}

function colValues(name) {
  const index = predictionData.columns.indexOf(name);
  if (index === -1) return [];
  return predictionData.rows.map(row => Number(row[index])).filter(value => !isNaN(value));
}

function histogram(values, bins) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / bins || 1;
  const labels = [];
  const counts = new Array(bins).fill(0);

  for (let index = 0; index < bins; index++) {
    const low = min + step * index;
    const high = low + step;
    labels.push(index < bins - 1 ? `${low.toFixed(0)}-${high.toFixed(0)}` : `${low.toFixed(0)}+`);
  }

  values.forEach(value => {
    let bin = Math.floor((value - min) / step);
    if (bin >= bins) bin = bins - 1;
    counts[bin]++;
  });

  return { labels, counts };
}

function kde(values, points, bandwidth) {
  const xs = [];
  const ys = [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / points;

  for (let index = 0; index <= points; index++) {
    const x = min + step * index;
    xs.push(x.toFixed(1));
    let sum = 0;
    values.forEach(value => {
      const z = (x - value) / bandwidth;
      sum += Math.exp(-0.5 * z * z);
    });
    ys.push(sum / (values.length * bandwidth * Math.sqrt(2 * Math.PI)));
  }

  return { xs, ys };
}

function buildCharts() {
  if (!predictionData) return;

  const data = predictionData;
  const predictionIndex = data.columns.indexOf('Predicted Risk');
  const predictions = data.rows.map(row => String(row[predictionIndex]));

  {
    const counts = {};
    predictions.forEach(prediction => {
      counts[prediction] = (counts[prediction] || 0) + 1;
    });
    const levels = ['Low', 'Medium', 'High', 'Very High'].filter(level => counts[level]);
    const canvas = makeCard('Risk Distribution');
    chartInstances.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: levels,
        datasets: [{
          label: 'Count',
          data: levels.map(level => counts[level]),
          backgroundColor: levels.map(level => RISK_COLORS[level] + 'cc'),
          borderColor: levels.map(level => RISK_COLORS[level]),
          borderWidth: 1,
        }],
      },
      options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } },
    }));
  }

  {
    const values = colValues('age');
    if (values.length) {
      const distribution = histogram(values, 10);
      const canvas = makeCard('Age - Histogram');
      chartInstances.push(new Chart(canvas, {
        type: 'bar',
        data: {
          labels: distribution.labels,
          datasets: [{
            label: 'Freq',
            data: distribution.counts,
            backgroundColor: 'rgba(111,207,151,0.45)',
            borderColor: '#6fcf97',
            borderWidth: 1,
          }],
        },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } },
      }));
    }
  }

  {
    const values = colValues('bmi');
    if (values.length) {
      const distribution = histogram(values, 10);
      const canvas = makeCard('BMI - Histogram');
      chartInstances.push(new Chart(canvas, {
        type: 'bar',
        data: {
          labels: distribution.labels,
          datasets: [{
            label: 'Freq',
            data: distribution.counts,
            backgroundColor: 'rgba(242,201,76,0.45)',
            borderColor: '#f2c94c',
            borderWidth: 1,
          }],
        },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } },
      }));
    }
  }

  {
    const values = colValues('cholesterol');
    if (values.length > 2) {
      const bandwidth = (Math.max(...values) - Math.min(...values)) / 8 || 1;
      const density = kde(values, 60, bandwidth);
      const canvas = makeCard('Cholesterol - KDE');
      chartInstances.push(new Chart(canvas, {
        type: 'line',
        data: {
          labels: density.xs,
          datasets: [{
            label: 'Density',
            data: density.ys,
            fill: true,
            backgroundColor: 'rgba(242,153,74,0.18)',
            borderColor: '#f2994a',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.4,
          }],
        },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } },
      }));
    }
  }

  {
    const values = colValues('resting_hr');
    if (values.length > 2) {
      const bandwidth = (Math.max(...values) - Math.min(...values)) / 8 || 1;
      const density = kde(values, 60, bandwidth);
      const canvas = makeCard('Resting HR - KDE');
      chartInstances.push(new Chart(canvas, {
        type: 'line',
        data: {
          labels: density.xs,
          datasets: [{
            label: 'Density',
            data: density.ys,
            fill: true,
            backgroundColor: 'rgba(235,87,87,0.18)',
            borderColor: '#eb5757',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.4,
          }],
        },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } },
      }));
    }
  }

  {
    const ageIndex = data.columns.indexOf('age');
    const bloodPressureIndex = data.columns.indexOf('systolic_bp');
    if (ageIndex !== -1 && bloodPressureIndex !== -1) {
      const datasets = Object.keys(RISK_COLORS).map(level => ({
        label: level,
        data: data.rows.filter((_, index) => predictions[index] === level).map(row => ({ x: Number(row[ageIndex]), y: Number(row[bloodPressureIndex]) })),
        backgroundColor: RISK_COLORS[level] + '99',
        borderColor: RISK_COLORS[level],
        borderWidth: 1,
        pointRadius: 3.5,
      })).filter(dataset => dataset.data.length);
      const canvas = makeCard('Age vs Systolic BP');
      chartInstances.push(new Chart(canvas, {
        type: 'scatter',
        data: { datasets },
        options: {
          ...CHART_DEFAULTS,
          scales: {
            x: {
              ...CHART_DEFAULTS.scales.x,
              title: { display: true, text: 'Age', color: 'rgba(255,255,255,0.4)', font: { size: 9 } },
            },
            y: {
              ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'Systolic BP', color: 'rgba(255,255,255,0.4)', font: { size: 9 } },
            },
          },
        },
      }));
    }
  }

  {
    const bmiIndex = data.columns.indexOf('bmi');
    const cholesterolIndex = data.columns.indexOf('cholesterol');
    if (bmiIndex !== -1 && cholesterolIndex !== -1) {
      const datasets = Object.keys(RISK_COLORS).map(level => ({
        label: level,
        data: data.rows.filter((_, index) => predictions[index] === level).map(row => ({ x: Number(row[bmiIndex]), y: Number(row[cholesterolIndex]) })),
        backgroundColor: RISK_COLORS[level] + '99',
        borderColor: RISK_COLORS[level],
        borderWidth: 1,
        pointRadius: 3.5,
      })).filter(dataset => dataset.data.length);
      const canvas = makeCard('BMI vs Cholesterol');
      chartInstances.push(new Chart(canvas, {
        type: 'scatter',
        data: { datasets },
        options: {
          ...CHART_DEFAULTS,
          scales: {
            x: {
              ...CHART_DEFAULTS.scales.x,
              title: { display: true, text: 'BMI', color: 'rgba(255,255,255,0.4)', font: { size: 9 } },
            },
            y: {
              ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'Cholesterol', color: 'rgba(255,255,255,0.4)', font: { size: 9 } },
            },
          },
        },
      }));
    }
  }

  {
    const values = colValues('systolic_bp');
    if (values.length) {
      const distribution = histogram(values, 10);
      const canvas = makeCard('Systolic BP - Histogram');
      chartInstances.push(new Chart(canvas, {
        type: 'bar',
        data: {
          labels: distribution.labels,
          datasets: [{
            label: 'Freq',
            data: distribution.counts,
            backgroundColor: 'rgba(111,207,151,0.30)',
            borderColor: 'rgba(111,207,151,0.7)',
            borderWidth: 1,
          }],
        },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } },
      }));
    }
  }
}
