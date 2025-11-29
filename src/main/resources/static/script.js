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

// Initialize chips
document.addEventListener('DOMContentLoaded', () => {
    renderChips();
});

// Add ticker on Enter key
document.getElementById('tickerInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        addTicker();
    }
});

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
            validTickers.push(ticker);
        }
    });

    if (invalidTickers.length > 0) {
        alert('Invalid ticker(s): ' + invalidTickers.join(', '));
    }

    if (validTickers.length === 0) {
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
        Object.keys(data[ticker]).forEach(metric => allMetrics.add(metric));
    });

    Array.from(allMetrics).sort().forEach(metric => {
        const tr = document.createElement('tr');

        const tdMetric = document.createElement('td');
        tdMetric.textContent = metric;
        tr.appendChild(tdMetric);

        validTickers.forEach(ticker => {
            const tdValue = document.createElement('td');
            tdValue.textContent = data[ticker][metric] || '-';
            tr.appendChild(tdValue);
        });

        tableBody.appendChild(tr);
    });
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

    const validTickers = Object.keys(data).filter(t => data[t] !== null);
    if (validTickers.length === 0) return;

    // Collect numeric metrics only
    const numericMetrics = new Set();
    validTickers.forEach(ticker => {
        Object.entries(data[ticker]).forEach(([key, value]) => {
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
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('appSection').style.display = 'block';
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
