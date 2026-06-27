const API_ENDPOINT = '/api/charts';

const chartBuilders = {
  pie_chart(rows) {
    if (!rows?.length) {
      throw new Error('Query returned no rows to plot.');
    }
    const labels = rows.map((row, index) => {
      if (!Object.prototype.hasOwnProperty.call(row, 'label')) {
        throw new Error(`Expected column 'label' in SQL result (row ${index + 1}).`);
      }
      const value = row.label;
      return value === null || value === undefined ? 'N/A' : String(value);
    });
    const values = rows.map((row, index) => {
      if (!Object.prototype.hasOwnProperty.call(row, 'value')) {
        throw new Error(`Expected column 'value' in SQL result (row ${index + 1}).`);
      }
      const parsed = Number(row.value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Row ${index + 1} has a non-numeric 'value'.`);
      }
      return parsed;
    });
    return {
      data: [
        {
          type: 'pie',
          labels,
          values,
          textinfo: 'label+percent',
          hoverinfo: 'label+value+percent',
          automargin: true,
          sort: false
        }
      ],
      layout: {
        margin: { t: 30, l: 0, r: 0, b: 0 }
      },
      config: {
        responsive: true,
        displaylogo: false
      }
    };
  }
};

async function loadPlotly() {
  const module = await import('plotly.js-dist-min');
  return module.default ?? module;
}

async function fetchChartRows(chartId, sql) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ chart_id: chartId, sql })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Unable to fetch chart data.');
  }
  const payload = await response.json();
  return payload.rows ?? [];
}

function setError(container, message) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-error';
  wrapper.textContent = message;
  container.appendChild(wrapper);
}

async function renderChart(container, plotlyInstance) {
  const chartId = container.dataset.chartId;
  const sqlAttribute = container.dataset.chartSql ?? '';
  const sql = decodeURIComponent(sqlAttribute);
  if (!chartId || !sql) {
    setError(container, 'Missing chart_id or SQL definition.');
    return;
  }
  const builder = chartBuilders[chartId];
  if (!builder) {
    setError(container, `Unknown chart preset: ${chartId}`);
    return;
  }
  try {
    container.textContent = 'Loading chart…';
    const rows = await fetchChartRows(chartId, sql);
    const spec = builder(rows);
    await plotlyInstance.newPlot(container, spec.data, spec.layout, spec.config);
  } catch (error) {
    setError(container, error instanceof Error ? error.message : String(error));
  }
}

async function initCharts() {
  const containers = document.querySelectorAll('[data-chart-id][data-chart-sql]');
  if (!containers.length) {
    return;
  }
  const plotlyInstance = await loadPlotly();
  await Promise.all(Array.from(containers, (container) => renderChart(container, plotlyInstance)));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCharts);
} else {
  initCharts();
}
