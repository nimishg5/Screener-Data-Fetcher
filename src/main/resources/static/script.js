console.log('Script loaded');

try {
    // Register the plugin
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    } else {
        console.warn('ChartDataLabels plugin not found');
    }

    // Set default chart font color for dark theme
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#cbd5e1';
        Chart.defaults.borderColor = '#334155';
    }
} catch (e) {
    console.error('Error initializing Chart.js settings:', e);
}

let tickers = new Set(['TCS', 'INFY']); // Default tickers
let chartInstance = null;
let currentData = null;

// Initialize chips and autocomplete
document.addEventListener('DOMContentLoaded', () => {
    renderChips();
    setupAutocomplete(document.getElementById('tickerInput'), null);
});

// Add ticker on Enter key
document.getElementById('tickerInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        addTicker();
    }
});

function setupAutocomplete(inputElement, onSelect) {
    let debounceTimer;
    const dropdown = document.createElement('div');
    dropdown.className = 'suggestions-dropdown';
    // Ensure parent is relative
    if (getComputedStyle(inputElement.parentNode).position === 'static') {
        inputElement.parentNode.style.position = 'relative';
    }
    inputElement.parentNode.appendChild(dropdown);

    inputElement.addEventListener('input', function () {
        const query = this.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/v1/data-fetcher/search?query=${encodeURIComponent(query)}`);
                if (response.ok) {
                    const suggestions = await response.json();
                    renderSuggestions(suggestions);
                }
            } catch (e) {
                console.error('Error fetching suggestions', e);
            }
        }, 300);
    });

    function renderSuggestions(suggestions) {
        dropdown.innerHTML = '';
        if (suggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        suggestions.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <span class="suggestion-ticker">${item.ticker}</span>
                <span class="suggestion-name">${item.name}</span>
            `;
            div.onclick = () => {
                inputElement.value = item.ticker;
                dropdown.style.display = 'none';
                addTicker(); // Auto-add the ticker
                if (onSelect) {
                    onSelect(item.ticker);
                }
            };
            dropdown.appendChild(div);
        });
        dropdown.style.display = 'block';
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        if (e.target !== inputElement && e.target !== dropdown && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function addTicker() {
    const input = document.getElementById('tickerInput');
    const ticker = input.value.trim().toUpperCase();

    if (ticker && !tickers.has(ticker)) {
        tickers.add(ticker);
        renderChips();
        input.value = '';
    } else if (tickers.has(ticker)) {
        alert('Ticker already added');
    }
}

function removeTicker(ticker) {
    tickers.delete(ticker);
    renderChips();
}

function renderChips() {
    const container = document.getElementById('tickerChips');
    container.innerHTML = '';

    tickers.forEach(ticker => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            ${ticker}
            <button onclick="removeTicker('${ticker}')">&times;</button>
        `;
        container.appendChild(chip);
    });
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Render chart if switching to chart tab and data exists
    if (tabName === 'chart' && currentData) {
        renderChart(currentData);
    }

    // Fetch geo analysis if switching to geo tab
    if (tabName === 'geo') {
        fetchGeoAnalysis();
    }

    // Fetch corporate actions if switching to actions tab
    if (tabName === 'actions') {
        fetchCorporateActions();
    }
}

function updateChartType() {
    if (currentData) {
        renderChart(currentData);
    }
}

async function compareTickers() {
    if (tickers.size === 0) {
        alert('Please add at least one ticker');
        return;
    }

    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const tabs = document.getElementById('tabs');
    const compareBtn = document.getElementById('compareBtn');

    loading.style.display = 'block';
    error.style.display = 'none';
    tabs.style.display = 'none';
    document.getElementById('tableTab').style.display = 'none';
    document.getElementById('chartTab').style.display = 'none';
    compareBtn.disabled = true;

    try {
        const tickerString = Array.from(tickers).join(',');
        const response = await fetch(`/api/v1/data-fetcher/compare?tickers=${encodeURIComponent(tickerString)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }
        const data = await response.json();
        currentData = data;

        // Extract Industries
        const industries = new Set();
        Object.values(data).forEach(d => {
            if (d && d.Industry) industries.add(d.Industry);
        });

        renderIndustryTabs(industries);

        // Default to All
        currentIndustry = 'All';
        renderTable(data);

        // Show UI
        loading.style.display = 'none';
        tabs.style.display = 'flex';

        // Clear inline styles that were set to 'none'
        document.getElementById('tableTab').style.display = '';
        document.getElementById('chartTab').style.display = '';

        // Activate table tab
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tableTab').classList.add('active');

        // Reset active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.tab-btn:first-child').classList.add('active');

    } catch (err) {
        error.textContent = 'Error fetching data: ' + err.message;
        error.style.display = 'block';
        loading.style.display = 'none';
    } finally {
        compareBtn.disabled = false;
    }
}

let currentIndustry = 'All';

function renderIndustryTabs(industries) {
    // Remove existing industry tabs if any
    const existing = document.getElementById('industryTabs');
    if (existing) existing.remove();

    if (industries.size === 0) return;

    const container = document.createElement('div');
    container.id = 'industryTabs';
    container.className = 'tabs';
    container.style.marginTop = '1rem';
    container.style.borderBottom = 'none'; // distinct style
    container.style.gap = '0.5rem';

    // All Tab
    const allBtn = document.createElement('button');
    allBtn.className = 'sub-tab-btn active';
    allBtn.textContent = 'All';
    allBtn.onclick = () => switchIndustry('All', allBtn);
    container.appendChild(allBtn);

    // Sort industries alphabetically
    const sortedIndustries = Array.from(industries).sort();

    sortedIndustries.forEach(ind => {
        const btn = document.createElement('button');
        btn.className = 'sub-tab-btn';
        btn.textContent = ind;
        btn.onclick = () => switchIndustry(ind, btn);
        container.appendChild(btn);
    });

    // Insert before the main content tabs
    const tabs = document.getElementById('tabs');
    tabs.parentNode.insertBefore(container, tabs);
}

function switchIndustry(industry, btn) {
    currentIndustry = industry;

    // Update active state
    const container = document.getElementById('industryTabs');
    container.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Re-render current view
    renderTable(currentData);
    if (document.getElementById('chartTab').classList.contains('active')) {
        renderChart(currentData);
    }
}

function renderTable(data) {
    const headerRow = document.getElementById('headerRow');
    const tableBody = document.getElementById('tableBody');

    headerRow.innerHTML = '<th>Metric</th>';
    tableBody.innerHTML = '';

    const allTickers = Object.keys(data);
    if (allTickers.length === 0) {
        document.getElementById('error').textContent = 'No data found';
        document.getElementById('error').style.display = 'block';
        return;
    }

    const validTickers = [];
    const invalidTickers = [];

    allTickers.forEach(ticker => {
        if (data[ticker] === null) {
            invalidTickers.push(ticker);
        } else {
            // Filter by Industry
            if (currentIndustry === 'All' || data[ticker].Industry === currentIndustry) {
                validTickers.push(ticker);
            }
        }
    });

    if (invalidTickers.length > 0 && currentIndustry === 'All') {
        // Only show alert if we are in 'All' view to avoid spamming when switching tabs
        // alert('Invalid ticker(s): ' + invalidTickers.join(', '));
    }

    if (validTickers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" style="text-align:center; color: #94a3b8;">No tickers found for this industry.</td></tr>';
        return;
    }

    // Headers
    validTickers.forEach(ticker => {
        const th = document.createElement('th');
        th.textContent = ticker;
        headerRow.appendChild(th);
    });

    // Metrics
    const allMetrics = new Set();
    validTickers.forEach(ticker => {
        Object.keys(data[ticker]).forEach(metric => {
            if (metric !== 'Industry') allMetrics.add(metric);
        });
    });

    Array.from(allMetrics).sort().forEach(metric => {
        const tr = document.createElement('tr');

        const tdMetric = document.createElement('td');
        tdMetric.textContent = metric;
        tr.appendChild(tdMetric);

        validTickers.forEach(ticker => {
            const tdValue = document.createElement('td');
            const rawValue = data[ticker][metric];
            tdValue.textContent = rawValue || '-';

            // Apply conditional formatting
            if (rawValue) {
                const color = getMetricColor(metric, rawValue);
                if (color) {
                    tdValue.style.color = color;
                    tdValue.style.fontWeight = '600';
                }
            }

            tr.appendChild(tdValue);
        });

        tableBody.appendChild(tr);
    });
}

function getMetricColor(metric, rawValue) {
    const value = parseValue(rawValue);
    if (isNaN(value)) return null;

    const lowerMetric = metric.toLowerCase();

    // Rules
    if (lowerMetric.includes('p/e') || lowerMetric.includes('price to earning')) {
        if (value < 25) return '#4ade80'; // Green
        if (value > 50) return '#f87171'; // Red
    }
    else if (lowerMetric.includes('roce') || lowerMetric.includes('return on capital')) {
        if (value > 20) return '#4ade80';
        if (value < 10) return '#f87171';
    }
    else if (lowerMetric.includes('roe') || lowerMetric.includes('return on equity')) {
        if (value > 15) return '#4ade80';
        if (value < 8) return '#f87171';
    }
    else if (lowerMetric.includes('dividend yield')) {
        if (value > 2) return '#4ade80';
        if (value < 0.5) return '#f87171';
    }
    else if (lowerMetric.includes('sales growth') || lowerMetric.includes('profit growth')) {
        if (value > 10) return '#4ade80';
        if (value < 0) return '#f87171';
    }
    else if (lowerMetric.includes('debt') && lowerMetric.includes('equity')) {
        if (value < 0.5) return '#4ade80';
        if (value > 1) return '#f87171';
    }
    else if (lowerMetric.includes('price to book')) {
        if (value < 3) return '#4ade80';
        if (value > 8) return '#f87171';
    }
    else if (lowerMetric.includes('pledged percentage')) {
        if (value === 0) return '#4ade80';
        if (value > 0) return '#f87171';
    }

    return null;
}

function parseValue(value) {
    if (value === null || value === undefined) return NaN;
    // Handle "High / Low" case by taking the first value
    let strVal = value.toString();
    if (strVal.includes('/')) {
        strVal = strVal.split('/')[0];
    }
    // Remove commas, currency symbols, percentages, and whitespace
    const cleanValue = strVal.replace(/[₹$,%\s]/g, '');
    return parseFloat(cleanValue);
}

function renderChart(data) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    const chartType = document.getElementById('chartType').value;

    if (chartInstance) {
        chartInstance.destroy();
    }

    const validTickers = Object.keys(data).filter(t => {
        return data[t] !== null && (currentIndustry === 'All' || data[t].Industry === currentIndustry);
    });

    if (validTickers.length === 0) return;

    // Collect numeric metrics only
    const numericMetrics = new Set();
    validTickers.forEach(ticker => {
        Object.entries(data[ticker]).forEach(([key, value]) => {
            if (key === 'Industry') return;
            const val = parseValue(value);
            if (!isNaN(val) && isFinite(val)) {
                numericMetrics.add(key);
            }
        });
    });

    const labels = Array.from(numericMetrics).sort().slice(0, 15);

    // Calculate max for each metric to normalize
    const metricMax = {};
    labels.forEach(metric => {
        let max = 0;
        validTickers.forEach(ticker => {
            const val = parseValue(data[ticker][metric]);
            if (!isNaN(val) && Math.abs(val) > max) max = Math.abs(val);
        });
        metricMax[metric] = max === 0 ? 1 : max;
    });

    const datasets = validTickers.map((ticker, index) => {
        const colors = [
            'rgba(34, 211, 238, 0.8)',  // Cyan (Electric Blue)
            'rgba(244, 114, 182, 0.8)', // Pink (Hot Pink)
            'rgba(163, 230, 53, 0.8)',  // Lime (Bright Green)
            'rgba(251, 146, 60, 0.8)',  // Orange (Vibrant)
            'rgba(192, 132, 252, 0.8)'  // Purple (Violet)
        ];

        const originalData = labels.map(metric => {
            const val = parseValue(data[ticker][metric]);
            return isNaN(val) ? 0 : val;
        });

        return {
            label: ticker,
            // Normalize data to 0-100 scale relative to max of that metric
            data: originalData.map((val, i) => {
                const metric = labels[i];
                return (val / metricMax[metric]) * 100;
            }),
            originalData: originalData,
            backgroundColor: colors[index % colors.length],
            borderColor: colors[index % colors.length].replace('0.8', '1'),
            borderWidth: 2, // Increased border width for better definition
            fill: true
        };
    });

    const config = {
        type: chartType === 'horizontalBar' ? 'bar' : chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: chartType === 'horizontalBar' ? 'y' : 'x',
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        generateLabels: function (chart) {
                            if (chart.config.type === 'polarArea') {
                                // Custom legend for Polar Area to show Datasets (Tickers)
                                return chart.data.datasets.map((dataset, i) => ({
                                    text: dataset.label,
                                    fillStyle: dataset.backgroundColor,
                                    strokeStyle: dataset.borderColor,
                                    lineWidth: dataset.borderWidth,
                                    hidden: !chart.isDatasetVisible(i),
                                    index: i
                                }));
                            }
                            return Chart.defaults.plugins.legend.labels.generateLabels(chart);
                        }
                    },
                    onClick: function (e, legendItem, legend) {
                        if (legend.chart.config.type === 'polarArea') {
                            const index = legendItem.index;
                            const chart = legend.chart;
                            chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
                            chart.update();
                        } else {
                            Chart.defaults.plugins.legend.onClick(e, legendItem, legend);
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Relative Comparison (Normalized to 100%)',
                    color: '#cbd5e1'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const val = context.dataset.originalData[context.dataIndex];
                            // For Polar Area, also show the metric name since it's not on axis
                            if (context.chart.config.type === 'polarArea') {
                                return context.chart.data.labels[context.dataIndex] + ': ' + val.toLocaleString();
                            }
                            return context.dataset.label + ': ' + val.toLocaleString();
                        }
                    }
                },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    formatter: function (value, context) {
                        const val = context.dataset.originalData[context.dataIndex];

                        // For Polar Area, show metric name + value to make it clear what part represents what
                        if (context.chart.config.type === 'polarArea') {
                            const metricName = context.chart.data.labels[context.dataIndex];
                            // Shorten metric name if too long
                            const shortMetric = metricName.length > 10 ? metricName.substring(0, 10) + '...' : metricName;

                            let formattedVal = val;
                            if (Math.abs(val) >= 1000000) formattedVal = (val / 1000000).toFixed(1) + 'M';
                            else if (Math.abs(val) >= 1000) formattedVal = (val / 1000).toFixed(1) + 'k';

                            return shortMetric + '\n' + formattedVal;
                        }

                        // Format large numbers
                        if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'k';
                        return val;
                    },
                    font: {
                        size: 10,
                        weight: 'bold'
                    },
                    color: '#e2e8f0', // Light text for dark theme
                    textAlign: 'center'
                }
            },
            scales: {
                r: { // For Radar/Polar
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        display: false,
                        backdropColor: 'transparent' // Remove white backdrop
                    },
                    grid: {
                        color: '#334155'
                    },
                    pointLabels: {
                        color: '#cbd5e1',
                        display: true // Ensure labels are shown on the periphery
                    }
                },
                x: {
                    display: chartType !== 'radar' && chartType !== 'polarArea',
                    beginAtZero: true,
                    grid: {
                        color: '#334155'
                    },
                    ticks: {
                        color: '#cbd5e1'
                    },
                    ...(chartType === 'horizontalBar' ? { max: 110, ticks: { display: false } } : {})
                },
                y: {
                    display: chartType !== 'radar' && chartType !== 'polarArea',
                    beginAtZero: true,
                    grid: {
                        color: '#334155'
                    },
                    ticks: {
                        color: '#cbd5e1'
                    },
                    ...(chartType !== 'horizontalBar' ? { max: 110, ticks: { display: false } } : {})
                }
            }
        }
    };

    chartInstance = new Chart(ctx, config);
}

let geoChartInstances = {};
let geoResults = {}; // Changed to object for easier lookup

async function fetchGeoAnalysis() {
    if (tickers.size === 0) return;

    const loading = document.getElementById('loading');
    const geoTab = document.getElementById('geoTab');

    // 1. Initialize UI Structure if needed (or clear if we want to ensure order)
    // We'll rebuild the structure to ensure it matches the current `tickers` set order
    geoTab.innerHTML = '';

    const subTabsContainer = document.createElement('div');
    subTabsContainer.className = 'sub-tabs';
    subTabsContainer.style.display = 'flex';
    subTabsContainer.style.gap = '1rem';
    subTabsContainer.style.marginBottom = '1.5rem';
    subTabsContainer.style.borderBottom = '1px solid #334155';
    subTabsContainer.style.paddingBottom = '1rem';
    geoTab.appendChild(subTabsContainer);

    const contentContainer = document.createElement('div');
    geoTab.appendChild(contentContainer);

    // Check if we have ANY data cached to decide on global loader
    const hasAnyCachedData = Array.from(tickers).some(t => geoResults[t]);
    if (!hasAnyCachedData) {
        loading.style.display = 'block';
    } else {
        loading.style.display = 'none';
    }

    // 2. Process each ticker
    const tickerArray = Array.from(tickers);

    // Create tabs and content placeholders
    tickerArray.forEach((ticker, index) => {
        // Create Tab Button
        const btn = document.createElement('button');
        btn.textContent = ticker;
        btn.className = 'sub-tab-btn';
        btn.dataset.ticker = ticker;
        btn.onclick = () => switchSubTab(ticker);
        subTabsContainer.appendChild(btn);

        // Create Content Div
        const contentDiv = document.createElement('div');
        contentDiv.id = `geo-content-${ticker}`;
        contentDiv.className = 'geo-sub-content';
        contentDiv.style.display = 'none';
        contentContainer.appendChild(contentDiv);
    });

    // Activate first tab
    if (tickerArray.length > 0) {
        switchSubTab(tickerArray[0]);
    }

    // 3. Fetch/Render Data
    tickerArray.forEach(async (ticker) => {
        const contentDiv = document.getElementById(`geo-content-${ticker}`);

        if (geoResults[ticker]) {
            // Data exists in cache, render immediately
            renderTickerData(ticker, geoResults[ticker], contentDiv);
        } else {
            // No data, show local loader
            contentDiv.innerHTML = `
                <div class="loading-local" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <div class="loader" style="width: 30px; height: 30px; border-width: 3px;"></div>
                    <div>Loading ${ticker}...</div>
                </div>
            `;

            try {
                const response = await fetch(`/api/v1/data-fetcher/geo-analysis?ticker=${ticker}`);
                if (!response.ok) throw new Error('Failed');
                const data = await response.json();

                // Update cache
                geoResults[ticker] = { data };

                // Render
                renderTickerData(ticker, { data }, contentDiv);

                // Hide global loader if it was visible (first successful fetch)
                loading.style.display = 'none';

            } catch (e) {
                console.error(`Error fetching geo for ${ticker}`, e);
                geoResults[ticker] = { error: e.message };
                renderTickerData(ticker, { error: e.message }, contentDiv);

                // Hide global loader even on error if it's the only one? 
                // Better to just hide it if we are done with at least one.
                loading.style.display = 'none';
            }
        }
    });
}

async function refetchGeoAnalysis(ticker) {
    const contentDiv = document.getElementById(`geo-content-${ticker}`);
    if (!contentDiv) return;

    contentDiv.innerHTML = `
        <div class="loading-local" style="text-align: center; padding: 2rem; color: #94a3b8;">
            <div class="loader" style="width: 30px; height: 30px; border-width: 3px;"></div>
            <div>Refetching ${ticker}...</div>
        </div>
    `;

    try {
        const response = await fetch(`/api/v1/data-fetcher/geo-analysis?ticker=${ticker}&refresh=true`);
        if (!response.ok) throw new Error('Failed');
        const data = await response.json();

        geoResults[ticker] = { data };
        renderTickerData(ticker, { data }, contentDiv);
    } catch (e) {
        console.error(`Error refetching geo for ${ticker}`, e);
        geoResults[ticker] = { error: e.message };
        renderTickerData(ticker, { error: e.message }, contentDiv);
    }
}

function renderTickerData(ticker, result, container) {
    // Clear old chart instance for this ticker if it exists
    if (geoChartInstances[ticker]) {
        geoChartInstances[ticker].destroy();
        delete geoChartInstances[ticker];
    }

    container.innerHTML = ''; // Clear loader or old content

    if (result.error) {
        container.innerHTML = `<div class="error">Failed to load data for ${ticker}</div>`;
        return;
    }

    const data = result.data;

    // Container for Chart and News
    const flexContainer = document.createElement('div');
    flexContainer.style.display = 'flex';
    flexContainer.style.flexWrap = 'wrap';
    flexContainer.style.gap = '2rem';

    // Chart Section
    const chartDiv = document.createElement('div');
    chartDiv.style.flex = '1';
    chartDiv.style.minWidth = '300px';

    const chartTitle = document.createElement('h3');
    chartTitle.textContent = 'Revenue Split by Geography';
    chartDiv.appendChild(chartTitle);

    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'chart-container';
    canvasContainer.style.height = '400px';

    // Check if revenue split data exists
    const revenueSplit = data.revenueSplit || {};
    if (Object.keys(revenueSplit).length === 0) {
        canvasContainer.innerHTML = `
            <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #94a3b8; flex-direction: column; gap: 0.5rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>Revenue split data not available</div>
            </div>
        `;
    } else {
        const canvas = document.createElement('canvas');
        canvas.id = `geoChart_${ticker}`;
        canvasContainer.appendChild(canvas);
    }

    chartDiv.appendChild(canvasContainer);

    // News Section
    const newsDiv = document.createElement('div');
    newsDiv.style.flex = '1';
    newsDiv.style.minWidth = '300px';

    // News Tabs
    const newsTabs = document.createElement('div');
    newsTabs.className = 'tabs';
    newsTabs.style.marginBottom = '1rem';
    newsTabs.style.borderBottom = '1px solid #334155';

    const aiTabBtn = document.createElement('button');
    aiTabBtn.className = 'sub-tab-btn active';
    aiTabBtn.textContent = 'AI Insights';
    aiTabBtn.onclick = () => switchNewsTab(ticker, 'ai', aiTabBtn);

    const rawTabBtn = document.createElement('button');
    rawTabBtn.className = 'sub-tab-btn';
    rawTabBtn.textContent = 'Raw News';
    rawTabBtn.onclick = () => switchNewsTab(ticker, 'raw', rawTabBtn);

    newsTabs.appendChild(aiTabBtn);
    newsTabs.appendChild(rawTabBtn);
    newsDiv.appendChild(newsTabs);

    // AI Content
    const aiContent = document.createElement('div');
    aiContent.id = `news-ai-${ticker}`;
    aiContent.style.display = 'block';
    aiContent.innerHTML = `
        <div class="loading-local" style="text-align: center; padding: 2rem; color: #94a3b8;">
            <div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <div style="margin-top: 0.5rem; font-size: 0.9rem;">Analyzing news impact...</div>
        </div>
    `;
    newsDiv.appendChild(aiContent);

    // Raw Content
    const rawContent = document.createElement('div');
    rawContent.id = `news-raw-${ticker}`;
    rawContent.style.display = 'none';

    const countryNews = data.news || {};
    if (Object.keys(countryNews).length === 0) {
        rawContent.innerHTML = '<div style="color: #94a3b8;">No recent news found.</div>';
    } else {
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '1rem';

        for (const [country, newsList] of Object.entries(countryNews)) {
            if (!newsList || newsList.length === 0) continue;

            const countryHeader = document.createElement('h4');
            countryHeader.textContent = country;
            countryHeader.style.color = 'var(--accent-color)';
            countryHeader.style.marginBottom = '0.5rem';
            countryHeader.style.marginTop = '0';
            list.appendChild(countryHeader);

            newsList.forEach(item => {
                const newsItem = document.createElement('div');
                newsItem.className = 'news-item';
                newsItem.style.padding = '0.75rem';
                newsItem.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                newsItem.style.borderRadius = '0.5rem';
                newsItem.style.marginBottom = '0.5rem';

                newsItem.innerHTML = `
                    <div style="font-weight: 500; margin-bottom: 0.25rem;">
                        <a href="${item.link}" target="_blank" style="color: var(--text-color); text-decoration: none; hover: text-decoration: underline;">${item.title}</a>
                    </div>
                    <div style="font-size: 0.8rem; color: #94a3b8;">${item.pubDate}</div>
                `;
                list.appendChild(newsItem);
            });
        }
        rawContent.appendChild(list);
    }
    newsDiv.appendChild(rawContent);

    flexContainer.appendChild(chartDiv);
    flexContainer.appendChild(newsDiv);
    container.appendChild(flexContainer);

    // Render Chart
    if (Object.keys(revenueSplit).length > 0) {
        const ctx = document.getElementById(`geoChart_${ticker}`).getContext('2d');

        // Prepare data for Pie/Doughnut
        const labels = Object.keys(revenueSplit);
        const values = Object.values(revenueSplit);

        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'
        ];

        geoChartInstances[ticker] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#0f172a',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#cbd5e1' }
                    },
                    datalabels: {
                        color: '#fff',
                        formatter: (value) => value + '%'
                    }
                }
            }
        });
    }

    // Fetch AI Analysis
    fetchAiAnalysis(ticker);
}

function switchNewsTab(ticker, tab, btn) {
    const parent = btn.parentNode;
    parent.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById(`news-ai-${ticker}`).style.display = tab === 'ai' ? 'block' : 'none';
    document.getElementById(`news-raw-${ticker}`).style.display = tab === 'raw' ? 'block' : 'none';
}

async function fetchAiAnalysis(ticker) {
    const container = document.getElementById(`news-ai-${ticker}`);
    try {
        const response = await fetch(`/api/v1/data-fetcher/news-analysis?ticker=${ticker}`);
        if (!response.ok) throw new Error('Failed to fetch analysis');
        const data = await response.json();

        renderAiAnalysis(ticker, data, container);

    } catch (e) {
        console.error('Error fetching AI analysis', e);
        container.innerHTML = '<div class="error" style="font-size: 0.9rem;">Failed to load AI insights.</div>';
    }
}

async function refetchAiAnalysis(ticker) {
    const container = document.getElementById(`news-ai-${ticker}`);
    if (!container) return;

    container.innerHTML = `
        <div class="loading-local" style="text-align: center; padding: 2rem; color: #94a3b8;">
            <div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <div style="margin-top: 0.5rem; font-size: 0.9rem;">Refetching AI analysis...</div>
        </div>
    `;

    try {
        const response = await fetch(`/api/v1/data-fetcher/news-analysis?ticker=${ticker}&refresh=true`);
        if (!response.ok) throw new Error('Failed to fetch analysis');
        const data = await response.json();

        renderAiAnalysis(ticker, data, container);

    } catch (e) {
        console.error('Error refetching AI analysis', e);
        container.innerHTML = '<div class="error" style="font-size: 0.9rem;">Failed to load AI insights.</div>';
    }
}

function renderAiAnalysis(ticker, data, container) {
    const aiData = data.aiAnalysis;
    if (!aiData) {
        container.innerHTML = '<div style="color: #94a3b8;">No analysis available.</div>';
        return;
    }

    // Header with Date and Refetch
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.marginBottom = '1rem';
    headerDiv.style.paddingBottom = '0.5rem';
    headerDiv.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

    const dateSpan = document.createElement('span');
    dateSpan.style.fontSize = '0.85rem';
    dateSpan.style.color = '#94a3b8';
    if (data.fetchedAt) {
        const date = new Date(data.fetchedAt);
        dateSpan.textContent = `Last updated: ${date.toLocaleString()}`;
    } else {
        dateSpan.textContent = 'Last updated: Just now';
    }

    const refetchBtn = document.createElement('button');
    refetchBtn.textContent = 'Refetch';
    refetchBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    refetchBtn.style.color = '#60a5fa';
    refetchBtn.style.border = '1px solid rgba(59, 130, 246, 0.2)';
    refetchBtn.style.padding = '0.25rem 0.75rem';
    refetchBtn.style.borderRadius = '0.25rem';
    refetchBtn.style.cursor = 'pointer';
    refetchBtn.style.fontSize = '0.85rem';
    refetchBtn.onmouseover = () => refetchBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
    refetchBtn.onmouseout = () => refetchBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    refetchBtn.onclick = () => refetchAiAnalysis(ticker);

    headerDiv.appendChild(dateSpan);
    headerDiv.appendChild(refetchBtn);

    container.innerHTML = '';
    container.appendChild(headerDiv);

    let html = '';

    // Summary
    if (aiData.summary) {
        // Convert hyphens or newlines to list items
        const summaryText = aiData.summary;
        let summaryHtml = '';

        if (summaryText.includes('- ')) {
            const items = summaryText.split('- ').filter(item => item.trim().length > 0);
            summaryHtml = '<ul style="margin: 0; padding-left: 1.2rem; font-size: 0.9rem; line-height: 1.5;">';
            items.forEach(item => {
                summaryHtml += `<li style="margin-bottom: 0.5rem;">${item.trim()}</li>`;
            });
            summaryHtml += '</ul>';
        } else {
            // Fallback for paragraph text
            summaryHtml = `<p style="margin: 0; font-size: 0.9rem; line-height: 1.5;">${summaryText}</p>`;
        }

        html += `
            <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                <h4 style="margin-top: 0; color: var(--primary-color); margin-bottom: 0.5rem;">AI Summary</h4>
                ${summaryHtml}
            </div>
        `;
    }

    // Scored News
    if (aiData.scoredNews && aiData.scoredNews.length > 0) {
        html += '<h4 style="color: var(--accent-color); margin-bottom: 0.5rem;">High Impact News</h4>';
        aiData.scoredNews.forEach(item => {
            const scoreColor = item.score >= 8 ? '#ef4444' : (item.score >= 6 ? '#f59e0b' : '#10b981');
            html += `
                <div style="padding: 0.75rem; background-color: rgba(255, 255, 255, 0.03); border-radius: 0.5rem; margin-bottom: 0.5rem; border-left: 3px solid ${scoreColor};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
                        <a href="${item.link}" target="_blank" style="font-weight: 500; color: var(--text-color); text-decoration: none; flex: 1; margin-right: 0.5rem;">${item.title}</a>
                        <span style="background: ${scoreColor}; color: #000; font-size: 0.7rem; font-weight: bold; padding: 0.1rem 0.4rem; border-radius: 1rem;">${item.score}/10</span>
                    </div>
                    <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.25rem;">${item.reason}</div>
                    <div style="font-size: 0.75rem; color: #94a3b8;">${item.pubDate || ''}</div>
                </div>
            `;
        });
    } else {
        html += '<div style="color: #94a3b8; font-size: 0.9rem;">No high-impact news found.</div>';
    }

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = html;
    container.appendChild(contentDiv);
}

function switchSubTab(ticker) {
    // Update buttons
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        if (btn.dataset.ticker === ticker) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Show content
    document.querySelectorAll('.geo-sub-content').forEach(div => div.style.display = 'none');
    const activeContent = document.getElementById(`geo-content-${ticker}`);
    if (activeContent) {
        activeContent.style.display = 'block';

        // Check if we need to render the chart (if data is loaded but chart not drawn yet)
        if (geoResults[ticker] && !geoResults[ticker].error && !geoChartInstances[ticker]) {
            // Ensure element exists before drawing
            if (document.getElementById(`geoChart_${ticker}`)) {
                renderPieChart(`geoChart_${ticker}`, geoResults[ticker].data.revenueSplit, ticker);
            }
        }
    }
}

function renderPieChart(canvasId, revenueSplit, ticker) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    revenueSplit = revenueSplit || {};
    const labels = Object.keys(revenueSplit);
    const values = Object.values(revenueSplit);

    if (labels.length === 0) {
        labels.push('No Data Available');
        values.push(100);
    }

    const chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    'rgba(34, 211, 238, 0.8)',
                    'rgba(244, 114, 182, 0.8)',
                    'rgba(163, 230, 53, 0.8)',
                    'rgba(251, 146, 60, 0.8)',
                    'rgba(192, 132, 252, 0.8)'
                ],
                borderColor: '#1e293b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#cbd5e1' }
                },
                datalabels: {
                    color: '#fff',
                    formatter: (value, ctx) => {
                        if (ctx.chart.data.labels[ctx.dataIndex] === 'No Data Available') return '';
                        return value.toFixed(1) + '%';
                    }
                }
            }
        }
    });
    geoChartInstances[ticker] = chart;
}

async function login() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        loginError.textContent = 'Please enter both email and password';
        loginError.style.display = 'block';
        return;
    }

    loginBtn.disabled = true;
    loginError.style.display = 'none';
    loginBtn.textContent = 'Logging in...';

    try {
        const response = await fetch('/api/v1/data-fetcher/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('appSection').style.display = 'block';

            // Show welcome message
            const welcomeMsg = document.getElementById('welcomeMsg');
            if (welcomeMsg) {
                welcomeMsg.textContent = `Welcome, ${data.username}`;
                welcomeMsg.style.display = 'block';
            }
        } else {
            const msg = 'Login failed. Please check your credentials.';
            loginError.textContent = msg;
            loginError.style.display = 'block';
            alert(msg);
        }
    } catch (error) {
        loginError.textContent = 'An error occurred: ' + error.message;
        loginError.style.display = 'block';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
}

async function logout() {
    try {
        await fetch('/api/v1/data-fetcher/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout failed:', error);
    } finally {
        // Reset UI
        document.getElementById('appSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'flex';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('loginError').style.display = 'none';

        // Clear data
        tickers.clear();
        renderChips();
        currentData = null;
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        document.getElementById('tableBody').innerHTML = '';
        document.getElementById('tickerInput').value = '';
    }
}

document.getElementById('password').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        login();
    }
});

let actionsResults = {};

async function fetchCorporateActions() {
    if (tickers.size === 0) return;

    const loading = document.getElementById('loading');
    const actionsTab = document.getElementById('actionsTab');

    // 1. Initialize UI Structure
    actionsTab.innerHTML = '';

    const subTabsContainer = document.createElement('div');
    subTabsContainer.className = 'sub-tabs';
    subTabsContainer.style.display = 'flex';
    subTabsContainer.style.gap = '1rem';
    subTabsContainer.style.marginBottom = '1.5rem';
    subTabsContainer.style.borderBottom = '1px solid #334155';
    subTabsContainer.style.paddingBottom = '1rem';
    actionsTab.appendChild(subTabsContainer);

    const contentContainer = document.createElement('div');
    actionsTab.appendChild(contentContainer);

    const hasAnyCachedData = Array.from(tickers).some(t => actionsResults[t]);
    if (!hasAnyCachedData) {
        loading.style.display = 'block';
    } else {
        loading.style.display = 'none';
    }

    const tickerArray = Array.from(tickers);

    tickerArray.forEach((ticker) => {
        const btn = document.createElement('button');
        btn.textContent = ticker;
        btn.className = 'sub-tab-btn';
        btn.dataset.ticker = ticker;
        btn.onclick = () => switchActionsSubTab(ticker);
        subTabsContainer.appendChild(btn);

        const contentDiv = document.createElement('div');
        contentDiv.id = `actions-content-${ticker}`;
        contentDiv.className = 'actions-sub-content';
        contentDiv.style.display = 'none';
        contentContainer.appendChild(contentDiv);
    });

    if (tickerArray.length > 0) {
        switchActionsSubTab(tickerArray[0]);
    }

    tickerArray.forEach(async (ticker) => {
        const contentDiv = document.getElementById(`actions-content-${ticker}`);

        if (actionsResults[ticker]) {
            renderActionsData(ticker, actionsResults[ticker], contentDiv);
        } else {
            // Ensure contentDiv is visible if it's the active one, or just set innerHTML
            // The visibility is handled by switchActionsSubTab, but we need to make sure content is there
            contentDiv.innerHTML = `
<div class="loading-local" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; color: #94a3b8;">
    <div class="loader"></div>
    <div style="margin-top: 1rem; font-weight: 500;">Fetching Corporate Actions for ${ticker}...</div>
</div>
`;

            try {
                console.log(`Fetching actions for ${ticker}...`);
                const response = await fetch(`/api/v1/data-fetcher/corporate-actions?ticker=${ticker}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                console.log(`Received actions for ${ticker}:`, data);
                actionsResults[ticker] = { data };
                renderActionsData(ticker, { data }, contentDiv);
            } catch (e) {
                console.error(`Error fetching actions for ${ticker}`, e);
                actionsResults[ticker] = { error: e.message };
                renderActionsData(ticker, { error: e.message }, contentDiv);
            } finally {
                // If this was the last one, hide global loader (though we are using local loaders now)
                loading.style.display = 'none';
            }
        }
    });
}

function switchActionsSubTab(ticker) {
    document.querySelectorAll('#actionsTab .sub-tab-btn').forEach(btn => {
        if (btn.dataset.ticker === ticker) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    document.querySelectorAll('.actions-sub-content').forEach(div => {
        div.style.display = 'none';
    });
    document.getElementById(`actions-content-${ticker}`).style.display = 'block';
}

function renderActionsData(ticker, result, container) {
    container.innerHTML = '';
    if (result.error) {
        container.innerHTML = `<div class="error">Failed to load data: ${result.error}</div>`;
        return;
    }

    const data = result.data;
    if (data.error) {
        container.innerHTML = `<div class="error">${data.error}</div>`;
        return;
    }

    const categories = ['dividends', 'bonus', 'splits', 'rights'];

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(400px, 1fr))';
    grid.style.gap = '2rem';
    container.appendChild(grid);

    categories.forEach(cat => {
        if (!data[cat]) return;

        const card = document.createElement('div');
        card.style.background = '#1e293b';
        card.style.padding = '1.5rem';
        card.style.borderRadius = '1rem';
        card.style.border = '1px solid #334155';

        const title = document.createElement('h3');
        title.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        title.style.marginTop = '0';
        title.style.color = '#f1f5f9';
        title.style.borderBottom = '1px solid #334155';
        title.style.paddingBottom = '0.5rem';
        card.appendChild(title);

        // Upcoming
        if (data[cat].upcoming && data[cat].upcoming.length > 0) {
            const subTitle = document.createElement('h4');
            subTitle.textContent = 'Upcoming';
            subTitle.style.color = '#4ade80'; // Green
            subTitle.style.marginTop = '1rem';
            card.appendChild(subTitle);
            card.appendChild(createActionTable(data[cat].upcoming));
        }

        // Previous
        if (data[cat].previous && data[cat].previous.length > 0) {
            const subTitle = document.createElement('h4');
            subTitle.textContent = 'Previous';
            subTitle.style.color = '#94a3b8'; // Muted
            subTitle.style.marginTop = '1rem';
            card.appendChild(subTitle);
            card.appendChild(createActionTable(data[cat].previous.slice(0, 5))); // Limit to 5
        } else if (!data[cat].upcoming || data[cat].upcoming.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No data available';
            empty.style.color = '#64748b';
            empty.style.fontStyle = 'italic';
            empty.style.marginTop = '1rem';
            card.appendChild(empty);
        }

        grid.appendChild(card);
    });
}

function createActionTable(rows) {
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '0.9rem';
    table.style.marginTop = '0.5rem';

    // Headers
    if (rows.length > 0) {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        Object.keys(rows[0]).forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            th.style.padding = '0.5rem';
            th.style.color = '#94a3b8';
            th.style.fontSize = '0.8rem';
            th.style.textAlign = 'left';
            th.style.borderBottom = '1px solid #334155';
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
    }

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        Object.values(row).forEach(val => {
            const td = document.createElement('td');
            td.textContent = val;
            td.style.padding = '0.5rem';
            td.style.borderBottom = '1px solid #334155';
            td.style.color = '#e2e8f0';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
}
