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

let tickers = new Set(['TCS', 'INFY']); // Default tickers (will be overwritten by localStorage if present)
let chartInstance = null;
let currentData = null;

// Initialize chips and autocomplete
document.addEventListener('DOMContentLoaded', () => {
    loadTickers(); // Load saved tickers
    renderChips();
    setupAutocomplete(document.getElementById('tickerInput'), null);
    checkLoginStatus();
});

function loadTickers() {
    const saved = localStorage.getItem('saved_tickers');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                // If array is populated, use it. If empty array, use it (user deleted all).
                tickers = new Set(parsed);
            }
        } catch (e) {
            console.error('Error loading saved tickers', e);
            // Fallback to defaults on error
            tickers = new Set(['TCS', 'INFY']);
        }
    } else {
        // No saved data found -> Use defaults
        tickers = new Set(['TCS', 'INFY']);
    }
}

function saveTickers() {
    localStorage.setItem('saved_tickers', JSON.stringify(Array.from(tickers)));
}

function checkLoginStatus() {
    const user = localStorage.getItem('screen_fetcher_user');
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'block';
        const welcomeMsg = document.getElementById('welcomeMsg');
        if (welcomeMsg) {
            welcomeMsg.textContent = `Welcome, ${user}`;
            welcomeMsg.style.display = 'block';
        }
    }
}

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
        saveTickers(); // Save
        renderChips();
        input.value = '';
    } else if (tickers.has(ticker)) {
        alert('Ticker already added');
    }
}

function removeTicker(ticker) {
    tickers.delete(ticker);
    saveTickers(); // Save
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
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Deactivate all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab content
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Activate button
    // Find button with onclick="switchTab('tabName')"
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(`'${tabName}'`)) {
            btn.classList.add('active');
        }
    });

    if (tabName === 'chart') {
        // Fix: Force redraw after a small delay to ensure canvas is visible and sized
        setTimeout(() => {
            updateChartType(); // This calls renderChart
        }, 50);
    } else if (tabName === 'geo') {
        // Trigger geo analysis for all tickers if not already done
        tickers.forEach(t => {
            if (!geoResults[t]) fetchGeoAnalysis(t);
        });
    } else if (tabName === 'actions') {
        // Trigger corporate actions for all tickers
        tickers.forEach(t => {
            if (!actionsResults[t]) fetchCorporateActions(t);
        });
    } else if (tabName === 'marketActions') {
        fetchMarketActions();
    } else if (tabName === 'brokerResearch') {
        tickers.forEach(t => {
            if (!brokerResearchResults[t]) fetchBrokerResearch(t);
        });
        renderBrokerResearch();
    }
}

// State for Broker Research
let brokerResearchResults = {};

// State for market actions
let marketActionsData = {};
let currentMarketActionCategory = 'dividends';
let marketActionSearchQuery = '';
// Default sort: Ex-Date (or similar) DESC
let marketActionSort = { column: 'exDate', direction: 'desc' };
let currentMarketActionYear = new Date().getFullYear();

async function fetchMarketActions(year = null) {
    const container = document.getElementById('marketActionsTab');

    // Ensure layout exists
    if (!document.getElementById('marketActionsContent')) {
        setupMarketActionsLayout();
    }

    const contentDiv = document.getElementById('marketActionsContent');
    // Show loading in the content area
    contentDiv.innerHTML = `
        <div class="loading" style="display: block;">
            <div class="loader"></div>
            <div>Fetching market actions...</div>
        </div>
    `;

    try {
        let url = '/api/v1/data-fetcher/market-actions';
        const yearToFetch = year || currentMarketActionYear;
        // Use yearToFetch for the API call
        if (yearToFetch) {
            url += `?year=${yearToFetch}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();

        marketActionsData = data;
        if (year) currentMarketActionYear = parseInt(year);

        filterAndRenderMarketActionTable();
    } catch (e) {
        contentDiv.innerHTML = `<div class="error">Error: ${e.message}</div>`;
    }
}

function setupMarketActionsLayout() {
    const container = document.getElementById('marketActionsTab');
    container.innerHTML = '';

    // Top Controls Bar (Tabs + Year + Search)
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'tabs';
    controlsDiv.style.marginBottom = '1rem';
    controlsDiv.style.borderBottom = '1px solid #334155';
    controlsDiv.style.display = 'flex';
    controlsDiv.style.justifyContent = 'space-between';
    controlsDiv.style.alignItems = 'center';
    controlsDiv.style.flexWrap = 'wrap';
    controlsDiv.style.gap = '1rem';

    // 1. Categories
    const categoriesContainer = document.createElement('div');
    const categories = ['dividends', 'bonus', 'splits', 'rights'];

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `sub-tab-btn ${cat === currentMarketActionCategory ? 'active' : ''}`;
        btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        btn.style.marginRight = '0.5rem';
        btn.onclick = () => {
            currentMarketActionCategory = cat;
            // Default sort when switching: Ex-Date DESC
            const dateKey = cat === 'splits' ? 'splitDate' : 'exDate';
            marketActionSort = { column: dateKey, direction: 'desc' };

            // Update active class
            categoriesContainer.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterAndRenderMarketActionTable();
        };
        categoriesContainer.appendChild(btn);
    });
    controlsDiv.appendChild(categoriesContainer);

    // 2. Right Side Controls (Year + Search)
    const rightControls = document.createElement('div');
    rightControls.style.display = 'flex';
    rightControls.style.gap = '1rem';
    rightControls.style.alignItems = 'center';

    // Year Selector
    const yearSelect = document.createElement('select');
    yearSelect.style.padding = '0.4rem';
    yearSelect.style.borderRadius = '0.25rem';
    yearSelect.style.border = '1px solid #334155';
    yearSelect.style.backgroundColor = '#1e293b';
    yearSelect.style.color = '#e2e8f0';

    // Generate last 3 years + next year? 
    // Usually we care about current and previous.
    // 5paisa might have data for many years. Let's offer a range.
    const thisYear = new Date().getFullYear();
    const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentMarketActionYear) opt.selected = true;
        yearSelect.appendChild(opt);
    });

    yearSelect.onchange = (e) => {
        const newYear = e.target.value;
        currentMarketActionYear = parseInt(newYear);
        fetchMarketActions(newYear);
    };
    rightControls.appendChild(yearSelect);

    // Search Input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search company...';
    searchInput.value = marketActionSearchQuery;
    searchInput.style.padding = '0.5rem';
    searchInput.style.borderRadius = '0.25rem';
    searchInput.style.border = '1px solid #334155';
    searchInput.style.backgroundColor = '#1e293b';
    searchInput.style.color = '#e2e8f0';
    searchInput.style.minWidth = '200px';

    searchInput.addEventListener('input', (e) => {
        marketActionSearchQuery = e.target.value;
        filterAndRenderMarketActionTable();
    });
    rightControls.appendChild(searchInput);

    controlsDiv.appendChild(rightControls);
    container.appendChild(controlsDiv);

    const contentDiv = document.createElement('div');
    contentDiv.id = 'marketActionsContent';
    container.appendChild(contentDiv);

    // Check sort
    const dateKey = currentMarketActionCategory === 'splits' ? 'splitDate' : 'exDate';
    if (!marketActionSort.column) {
        marketActionSort = { column: dateKey, direction: 'desc' };
    }
}

function filterAndRenderMarketActionTable() {
    let items = marketActionsData[currentMarketActionCategory] || [];

    // Filter
    if (marketActionSearchQuery) {
        const q = marketActionSearchQuery.toLowerCase();
        items = items.filter(item => {
            return item.company && item.company.toLowerCase().includes(q);
        });
    }

    // Sort
    if (marketActionSort.column) {
        items.sort((a, b) => {
            let valA = a[marketActionSort.column];
            let valB = b[marketActionSort.column];

            // Handle dates if possible
            if (marketActionSort.column.toLowerCase().includes('date')) {
                const dateA = parseDateGeneric(valA);
                const dateB = parseDateGeneric(valB);

                // If one is invalid, treat as smaller (or push to bottom?)
                // Let's treat invalid as very old
                const timeA = dateA ? dateA.getTime() : -8640000000000000;
                const timeB = dateB ? dateB.getTime() : -8640000000000000;

                if (timeA < timeB) return marketActionSort.direction === 'asc' ? -1 : 1;
                if (timeA > timeB) return marketActionSort.direction === 'asc' ? 1 : -1;
                return 0;
            } else if (!isNaN(parseFloat(valA)) && !isNaN(parseFloat(valB))) {
                // Handle numbers
                valA = parseFloat(valA);
                valB = parseFloat(valB);
            } else {
                // Handle strings
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return marketActionSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return marketActionSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    renderMarketActionTable(items, currentMarketActionCategory);
}

function renderMarketActionTable(items, category) {
    const container = document.getElementById('marketActionsContent');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="color: #94a3b8;">No data available.</div>';
        return;
    }

    const tableWrapper = document.createElement('div');
    tableWrapper.style.overflowX = 'auto';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.minWidth = '600px';

    // Headers depend on category. Key mapping for sorting.
    let colDefs = [];
    if (category === 'dividends') {
        colDefs = [
            { label: 'Company', key: 'company' },
            { label: 'Type', key: 'type' },
            { label: '%', key: 'percentage' },
            { label: 'Announcement', key: 'announcementDate' },
            { label: 'Record', key: 'recordDate' },
            { label: 'Ex-Date', key: 'exDate' }
        ];
    } else if (category === 'bonus') {
        colDefs = [
            { label: 'Company', key: 'company' },
            { label: 'Ratio', key: 'ratio' },
            { label: 'Announcement', key: 'announcementDate' },
            { label: 'Record', key: 'recordDate' },
            { label: 'Ex-Date', key: 'exDate' }
        ];
    } else if (category === 'splits') {
        colDefs = [
            { label: 'Company', key: 'company' },
            { label: 'Old FV', key: 'oldFV' },
            { label: 'New FV', key: 'newFV' },
            { label: 'Split Date', key: 'splitDate' }
        ];
    } else if (category === 'rights') {
        colDefs = [
            { label: 'Company', key: 'company' },
            { label: 'Ratio', key: 'ratio' },
            { label: 'Premium', key: 'premium' },
            { label: 'Announcement', key: 'announcementDate' },
            { label: 'Record', key: 'recordDate' },
            { label: 'Ex-Date', key: 'exDate' }
        ];
    }

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    colDefs.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        if (marketActionSort.column === col.key) {
            th.textContent += marketActionSort.direction === 'asc' ? ' ↑' : ' ↓';
        }
        th.style.textAlign = 'left';
        th.style.padding = '1rem';
        th.style.borderBottom = '1px solid #334155';
        th.style.color = '#94a3b8';
        th.style.fontWeight = '600';
        th.style.cursor = 'pointer';

        th.onclick = () => {
            if (marketActionSort.column === col.key) {
                marketActionSort.direction = marketActionSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                marketActionSort.column = col.key;
                marketActionSort.direction = 'asc';
            }
            filterAndRenderMarketActionTable();
        };

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

        // Check date status
        const dateKey = category === 'splits' ? 'splitDate' : 'exDate';
        const dateStr = item[dateKey];
        const status = getDateStatus(dateStr);

        if (status === 'urgent') {
            // Yellow for Today/Tomorrow
            tr.style.backgroundColor = 'rgba(234, 179, 8, 0.1)';
            tr.style.boxShadow = 'inset 4px 0 0 0 #eab308';
        } else if (status === 'upcoming') {
            // Green for future
            tr.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            tr.style.boxShadow = 'inset 4px 0 0 0 #10b981';
        }

        colDefs.forEach(col => {
            const td = document.createElement('td');
            const val = item[col.key];
            td.textContent = val || '-';
            td.style.padding = '1rem';
            td.style.color = '#e2e8f0';

            // Highlight the date column itself
            if (col.key === dateKey) {
                if (status === 'urgent') {
                    td.style.color = '#facc15'; // Yellow
                    td.style.fontWeight = '700';
                } else if (status === 'upcoming') {
                    td.style.color = '#34d399'; // Green
                    td.style.fontWeight = '700';
                }
            }

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
}

function parseDateGeneric(dateStr) {
    if (!dateStr || dateStr.trim() === '-' || dateStr.toLowerCase().includes('not')) return null;

    try {
        const ddmmyyyyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
        const match = dateStr.trim().match(ddmmyyyyRegex);

        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3], 10);
            return new Date(year, month, day);
        } else {
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? null : d;
        }
    } catch (e) {
        return null;
    }
}

function getDateStatus(dateStr) {
    const actionDate = parseDateGeneric(dateStr);
    if (!actionDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Day after tomorrow (threshold for green)
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);

    // Urgent: Today or Tomorrow
    // Check if actionDate is >= today AND < dayAfterTomorrow
    // Actually simpler: 
    // If < today: Past (null)
    // If >= today AND <= tomorrow: Urgent
    // If > tomorrow: Upcoming

    if (actionDate < today) return null;

    if (actionDate <= tomorrow) return 'urgent';

    return 'upcoming';
}

function updateChartType() {
    if (currentData) {
        renderChart(currentData);
    }
}

function extractIndustries(data) {
    console.log('Extracting industries from data:', Object.keys(data));
    const industries = new Set();
    Object.values(data).forEach(d => {
        if (d && d.Industry) {
            industries.add(d.Industry);
        } else {
            console.log('Missing industry for ticker data:', d);
        }
    });
    console.log('Found industries:', Array.from(industries));
    renderIndustryTabs(industries);
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
        extractIndustries(data);

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
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            if (b.textContent.includes('Table')) b.classList.add('active');
        });

        // Pre-fetch Broker Research in background for better UX
        setupBrokerResearchLayout(); // Ensure containers exist
        tickers.forEach(t => {
            // Check if already fetched to avoid double fetch if button clicked multiple times? 
            // Actually, compareTickers implies a refreshed view, so fetching is good.
            // But we should check if currently fetching?
            // Simple approach: just trigger it.
            fetchBrokerResearch(t);
        });
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
        // if (ind === 'Others') return; // Show Others if it's the only thing available
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

    // IMPORTANT: Extract industries whenever table is re-rendered with new data (full refresh)
    // But we need to be careful not to reset user selection if just filtering
    if (currentIndustry === 'All' && document.getElementById('industryTabs').children.length <= 1) {
        extractIndustries(data);
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
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
                <div style="color: #f59e0b; font-weight: 500;">Work in Progress</div>
                <div style="font-size: 0.8rem; color: #64748b;">Revenue split data is being processed</div>
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
    aiTabBtn.dataset.tab = 'ai'; // Add data attribute for easier selection
    aiTabBtn.onclick = () => switchNewsTab(ticker, 'ai', aiTabBtn);

    const rawTabBtn = document.createElement('button');
    rawTabBtn.className = 'sub-tab-btn';
    rawTabBtn.textContent = 'Raw News';
    rawTabBtn.dataset.tab = 'raw'; // Add data attribute
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

        // Split by newlines to handle different bullet formats
        const lines = summaryText.split('\n');
        const listItems = [];
        let paragraphText = '';

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Check for bullet points (hyphen, asterisk, bullet char)
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
                // Remove the bullet marker and bold markers if present
                let content = trimmed.substring(2).trim();
                // Handle bold text **text** -> <strong>text</strong>
                content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                listItems.push(content);
            } else {
                // If it's not a bullet, treat as paragraph text or append to previous
                if (listItems.length === 0) {
                    paragraphText += (paragraphText ? ' ' : '') + trimmed;
                } else {
                    // If we already have list items, maybe this is a continuation or a new paragraph?
                    // For now, let's just add it as a list item if it looks like a sentence
                    listItems.push(trimmed);
                }
            }
        });

        if (listItems.length > 0) {
            summaryHtml = '<ul style="margin: 0; padding-left: 1.2rem; font-size: 0.9rem; line-height: 1.5;">';
            listItems.forEach(item => {
                summaryHtml += `<li style="margin-bottom: 0.5rem;">${item}</li>`;
            });
            summaryHtml += '</ul>';
        } else if (paragraphText) {
            summaryHtml = `<p style="margin: 0; font-size: 0.9rem; line-height: 1.5;">${paragraphText}</p>`;
        } else {
            // Fallback if parsing failed completely but text exists
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
    // Only target buttons that are actual ticker tabs (have data-ticker)
    // This prevents clearing active state of other sub-tabs like news tabs
    const geoTab = document.getElementById('geoTab');
    if (geoTab) {
        geoTab.querySelectorAll('.sub-tab-btn').forEach(btn => {
            if (btn.dataset.ticker) {
                if (btn.dataset.ticker === ticker) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    }

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

        // Reset to AI Insights tab by default
        const aiTabBtn = activeContent.querySelector('button[data-tab="ai"]');
        if (aiTabBtn) {
            switchNewsTab(ticker, 'ai', aiTabBtn);
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
            localStorage.setItem('screen_fetcher_user', data.username);
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('appSection').style.display = 'block';

            // Restore saved state
            loadTickers();
            renderChips();


            const welcomeMsg = document.getElementById('welcomeMsg');

            // Show welcome message
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
        localStorage.removeItem('screen_fetcher_user');
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

async function refetchCorporateActions(ticker) {
    const contentDiv = document.getElementById(`actions-content-${ticker}`);
    if (!contentDiv) return;

    contentDiv.innerHTML = `
        <div class="loading-local" style="text-align: center; padding: 2rem; color: #94a3b8;">
            <div class="loader" style="width: 30px; height: 30px; border-width: 3px;"></div>
            <div>Refetching ${ticker}...</div>
        </div>
    `;

    try {
        const response = await fetch(`/api/v1/data-fetcher/corporate-actions?ticker=${ticker}&refresh=true`);
        if (!response.ok) throw new Error('Failed');
        const data = await response.json();

        actionsResults[ticker] = { data };
        renderActionsData(ticker, { data }, contentDiv);
    } catch (e) {
        console.error(`Error refetching corporate actions for ${ticker}`, e);
        actionsResults[ticker] = { error: e.message };
        renderActionsData(ticker, { error: e.message }, contentDiv);
    }
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

    // Header with Date and Refetch Button
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.marginBottom = '1.5rem';
    headerDiv.style.paddingBottom = '0.75rem';
    headerDiv.style.borderBottom = '2px solid rgba(255,255,255,0.1)';

    const dateSpan = document.createElement('span');
    dateSpan.style.fontSize = '0.9rem';
    dateSpan.style.color = '#94a3b8';
    dateSpan.style.fontWeight = '500';
    if (data.fetchedAt) {
        const date = new Date(data.fetchedAt);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let timeAgo = '';
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                timeAgo = diffMins === 0 ? 'Just now' : `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
            } else {
                timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            }
        } else if (diffDays === 1) {
            timeAgo = 'Yesterday';
        } else if (diffDays < 7) {
            timeAgo = `${diffDays} days ago`;
        } else {
            timeAgo = `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
        }

        dateSpan.innerHTML = `
            <span style="color: #cbd5e1;">Last updated:</span> ${date.toLocaleString()}
            <span style="color: #64748b; margin-left: 0.5rem;">(${timeAgo})</span>
        `;
    } else {
        dateSpan.textContent = 'Last updated: Just now';
    }

    const refetchBtn = document.createElement('button');
    refetchBtn.textContent = '🔄 Refetch';
    refetchBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    refetchBtn.style.color = '#60a5fa';
    refetchBtn.style.border = '1px solid rgba(59, 130, 246, 0.3)';
    refetchBtn.style.padding = '0.5rem 1rem';
    refetchBtn.style.borderRadius = '0.5rem';
    refetchBtn.style.cursor = 'pointer';
    refetchBtn.style.fontSize = '0.9rem';
    refetchBtn.style.fontWeight = '600';
    refetchBtn.style.transition = 'all 0.2s ease';
    refetchBtn.onmouseover = () => {
        refetchBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
        refetchBtn.style.transform = 'translateY(-1px)';
    };
    refetchBtn.onmouseout = () => {
        refetchBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        refetchBtn.style.transform = 'translateY(0)';
    };
    refetchBtn.onclick = () => refetchCorporateActions(ticker);

    headerDiv.appendChild(dateSpan);
    headerDiv.appendChild(refetchBtn);
    container.appendChild(headerDiv);

    const categories = ['dividends', 'bonus', 'splits', 'rights'];

    // Create Tabs Container
    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '1rem';
    tabsContainer.style.marginBottom = '1.5rem';
    tabsContainer.style.borderBottom = '1px solid #334155';
    container.appendChild(tabsContainer);

    // Content Container
    const contentContainer = document.createElement('div');
    container.appendChild(contentContainer);

    // State for active tab
    let activeTab = 'dividends'; // Default

    // Function to render content for a specific category
    const renderCategoryContent = (cat) => {
        contentContainer.innerHTML = ''; // Clear previous content

        if (!data[cat]) {
            contentContainer.innerHTML = '<div style="color: #64748b; font-style: italic;">No data available for ' + cat + '</div>';
            return;
        }

        const card = document.createElement('div');
        // Card style specific to content - removed border/background to blend with tab view or keep if preferred
        // Keeping it simple for now

        // Upcoming
        if (data[cat].upcoming && data[cat].upcoming.length > 0) {
            const subTitle = document.createElement('h4');
            subTitle.textContent = 'Upcoming';
            subTitle.style.color = '#4ade80'; // Green
            subTitle.style.marginTop = '0';
            card.appendChild(subTitle);
            card.appendChild(createActionTable(data[cat].upcoming));
        }

        // Previous
        // Filter out completely empty objects from 'previous' list
        const validPrevious = data[cat].previous ? data[cat].previous.filter(item => {
            // Check if item has at least one key with non-empty value
            return Object.values(item).some(val => val && val.trim() !== '');
        }) : [];

        if (validPrevious.length > 0) {
            const subTitle = document.createElement('h4');
            subTitle.textContent = 'Previous';
            subTitle.style.color = '#94a3b8'; // Muted
            subTitle.style.marginTop = '1.5rem';
            card.appendChild(subTitle);
            card.appendChild(createActionTable(validPrevious));
        } else if (!data[cat].upcoming || data[cat].upcoming.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No data available';
            empty.style.color = '#64748b';
            empty.style.fontStyle = 'italic';
            empty.style.marginTop = '1rem';
            card.appendChild(empty);
        }

        contentContainer.appendChild(card);
    };

    // Create Tab Buttons
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        btn.style.background = 'transparent';
        btn.style.border = 'none';
        btn.style.color = activeTab === cat ? '#3b82f6' : '#94a3b8';
        btn.style.borderBottom = activeTab === cat ? '2px solid #3b82f6' : '2px solid transparent';
        btn.style.padding = '0.75rem 1.5rem';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '1rem';
        btn.style.transition = 'all 0.2s';

        btn.onclick = () => {
            activeTab = cat;
            // Update buttons styles
            Array.from(tabsContainer.children).forEach(child => {
                const isSelected = child.textContent.toLowerCase() === cat;
                child.style.color = isSelected ? '#3b82f6' : '#94a3b8';
                child.style.borderBottom = isSelected ? '2px solid #3b82f6' : '2px solid transparent';
            });
            renderCategoryContent(cat);
        };

        tabsContainer.appendChild(btn);
    });

    // Initial render
    renderCategoryContent(activeTab);
}

function createActionTable(rows) {
    // Wrap table for horizontal scrolling
    const tableWrapper = document.createElement('div');
    tableWrapper.style.overflowX = 'auto';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '0.9rem';
    table.style.marginTop = '0.5rem';
    table.style.borderCollapse = 'collapse'; // Better border handling

    // Headers
    let headers = [];
    if (rows.length > 0) {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        headers = Object.keys(rows[0]); // Capture headers to ensure consistent order
        headers.forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            th.style.padding = '0.75rem';
            th.style.color = '#94a3b8';
            th.style.fontSize = '0.8rem';
            th.style.textAlign = 'left';
            th.style.borderBottom = '1px solid #334155';
            th.style.whiteSpace = 'nowrap'; // Prevent header wrapping
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
    }

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        // Use the captured headers to iterate, ensuring alignment
        headers.forEach(key => {
            const val = row[key];
            const td = document.createElement('td');
            td.textContent = val !== undefined && val !== null ? val : '';
            td.style.padding = '0.75rem';
            td.style.borderBottom = '1px solid #334155';
            td.style.color = '#e2e8f0';
            td.style.whiteSpace = 'nowrap'; // Prevent content wrapping if desired, or remove for wrapping
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    tableWrapper.appendChild(table);
    return tableWrapper;
}

// Broker Research Logic with Sub-tabs

// State for Broker Research
// let brokerResearchResults = {}; // Already defined above

function renderBrokerResearch() {
    setupBrokerResearchLayout();
}

function setupBrokerResearchLayout() {
    const tab = document.getElementById('brokerResearchTab');

    // Check if layout already exists to prevent clearing on re-render/tab switch
    if (tab.querySelector('.sub-tabs-container')) {
        // Just ensure sub-tabs encompass all current tickers?
        // For simplicity, if tickers changed, we might need to rebuild.
        // Let's check if the number of tabs matches tickers.size
        const existingTabs = tab.querySelectorAll('.sub-tab-btn');
        if (existingTabs.length === tickers.size) {
            return; // Assume already set up
        }
        // If mismatch, clear and rebuild (e.g., user added/removed ticker)
        tab.innerHTML = '';
    } else {
        tab.innerHTML = '';
    }

    if (tickers.size === 0) {
        tab.innerHTML = '<div class="error">No tickers added. Add tickers to see broker research.</div>';
        return;
    }

    const tickerArray = Array.from(tickers);

    // Create Sub-tabs Container
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'sub-tabs-container';
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '0.5rem';
    tabsContainer.style.marginBottom = '1.5rem';
    tabsContainer.style.flexWrap = 'wrap';
    tab.appendChild(tabsContainer);

    // Create Content Container
    const contentContainer = document.createElement('div');
    contentContainer.id = 'brokerResearchContent';
    tab.appendChild(contentContainer);

    // Generate Tabs
    tickerArray.forEach((ticker, index) => {
        const btn = document.createElement('button');
        btn.textContent = ticker;
        btn.className = 'sub-tab-btn';
        if (index === 0) btn.classList.add('active');
        btn.dataset.ticker = ticker;
        btn.onclick = () => switchBrokerResearchSubTab(ticker);
        tabsContainer.appendChild(btn);

        // Create content div (hidden by default)
        const contentDiv = document.createElement('div');
        contentDiv.id = `broker-content-${ticker}`;
        contentDiv.className = 'broker-sub-content';
        contentDiv.style.display = 'none';
        contentContainer.appendChild(contentDiv);
    });

    if (tickerArray.length > 0) {
        // Only switch/show if no content currently visible?
        // Or default to first
        // Check if any is visible
        const visible = document.querySelector('.broker-sub-content[style*="block"]');
        if (!visible) {
            switchBrokerResearchSubTab(tickerArray[0]);
        }
    }
}

function switchBrokerResearchSubTab(ticker) {
    // Update buttons
    document.querySelectorAll('#brokerResearchTab .sub-tab-btn').forEach(btn => {
        if (btn.dataset.ticker === ticker) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Toggle content
    document.querySelectorAll('.broker-sub-content').forEach(div => {
        div.style.display = 'none';
    });

    const targetDiv = document.getElementById(`broker-content-${ticker}`);
    if (targetDiv) {
        targetDiv.style.display = 'block';
    }
}

async function fetchBrokerResearch(ticker, refresh = false) {
    const contentDiv = document.getElementById(`broker-content-${ticker}`);
    if (!contentDiv) return;

    // Only show loading if empty or refreshing
    if (contentDiv.innerHTML.trim() === '' || refresh) {
        contentDiv.innerHTML = `<div class="loading-local"><div class="loader"></div><div>${refresh ? 'Refetching' : 'Fetching'} Broker Research for ${ticker}...</div></div>`;
    }

    try {
        const url = `/api/v1/data-fetcher/broker-research?ticker=${ticker}&refresh=${refresh}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        brokerResearchResults[ticker] = data;
        renderBrokerResearchContent(ticker, data, contentDiv);
    } catch (err) {
        console.error(err);
        contentDiv.innerHTML = `<div class="error">Failed to load data: ${err.message}</div>`;
    }
}

function renderBrokerResearchContent(ticker, result, container) {
    if (!result || !result.reports || result.reports.length === 0) {
        if (result.error) container.innerHTML = `<div class="error">${result.error}</div>`;
        else container.innerHTML = `<div style="text-align:center; padding:2rem; color:#94a3b8;">No reports found. <br><br><button onclick="fetchBrokerResearch('${ticker}', true)" class="refetch-btn" style="background:var(--primary-color); border:none; padding:0.5rem 1rem; color:white; border-radius:0.5rem; cursor:pointer;">Refresh</button></div>`;
        return;
    }

    const { reports, lastFetched, currentPrice } = result;

    // Filter and Sort Logic
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let processedReports = reports.filter(r => {
        if (!r.date) return false;
        // Parse date. Moneycontrol dates are usually "16 Oct, 2024"
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d >= sixMonthsAgo;
    });

    // Sort Descending
    processedReports.sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        return db - da;
    });

    // Check filtered length
    if (processedReports.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:2rem; color:#94a3b8;">No reports found in the last 6 months. <br><br><button onclick="fetchBrokerResearch('${ticker}', true)" class="refetch-btn" style="background:var(--primary-color); border:none; padding:0.5rem 1rem; color:white; border-radius:0.5rem; cursor:pointer;">Refresh</button></div>`;
        return;
    }

    // Header
    let headerHtml = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:1rem; margin-bottom:1rem;">
       <div>
           <h3 style="margin:0">${ticker}</h3>
           <div style="font-size:0.85rem; color:#94a3b8;">
               Last Updated: ${lastFetched ? new Date(lastFetched).toLocaleString() : 'Just now'}
               ${currentPrice ? ` • CMP: ₹${currentPrice}` : ''}
           </div>
       </div>
       <button onclick="fetchBrokerResearch('${ticker}', true)" class="refetch-btn" style="background:rgba(59,130,246,0.1); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); padding:0.5rem 1rem; border-radius:0.5rem; cursor:pointer; font-weight:600;">🔄 Refetch</button>
    </div>`;

    let html = headerHtml +
        '<div style="overflow-x:auto;">' +
        '<table class="comparison-table" style="width:100%">' +
        '<thead>' +
        '<tr>' +
        '<th style="color:#f1f5f9; font-weight:600; border-bottom:1px solid #334155;">Date</th>' +
        '<th>Broker</th>' +
        '<th>Reco</th>' +
        '<th>Target</th>' +
        '<th>Upside</th>' +
        '<th style="text-align:center;">Report / Summary</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>';

    processedReports.forEach(row => {
        let recoClass = getRecoClass(row.reco);
        let recoStyle = '';
        if (row.reco) {
            const r = row.reco.toUpperCase();
            if (r.includes('BUY') || r.includes('ACCUMULATE')) {
                recoStyle = 'color:#4ade80; font-weight:bold;'; // Green
                recoClass = 'status-badge status-upcoming';
            } else if (r.includes('SELL') || r.includes('REDUCE')) {
                recoStyle = 'color:#f87171; font-weight:bold;'; // Red
                recoClass = 'status-badge status-urgent';
            } else {
                recoClass = 'status-badge status-completed';
            }
        }

        let upsideStyle = '';
        if (row.upside && row.upside !== '-') {
            if (!row.upside.startsWith('-')) upsideStyle = 'color:#4ade80; font-weight:bold;';
            else upsideStyle = 'color:#f87171; font-weight:bold;';
        }

        html += '<tr>' +
            '<td>' + (row.date || '-') + '</td>' +
            '<td>' + (row.broker || '-') + '</td>' +
            '<td><span class="' + recoClass + '" style="' + recoStyle + '">' + (row.reco || '-') + '</span></td>' +
            '<td>₹' + (row.target || '-') + '</td>' +
            '<td style="' + upsideStyle + '">' + (row.upside || '-') + '</td>' +
            '<td>' +
            '<div style="display:flex; align-items:center; justify-content:center; gap:0.5rem;">';

        if (row.link) {
            const brokerClean = (row.broker || '').replace(/'/g, "\\'");

            // PDF Icon: File shape with "PDF" text inside
            html += `<a href="${row.link}" target="_blank" style="text-decoration:none; display:inline-flex; align-items:center;" title="Open PDF">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <text x="5" y="18" font-size="6" fill="#ef4444" stroke="none" font-weight="bold" font-family="sans-serif">PDF</text>
                </svg>
            </a>`;

            html += `<span style="color:#334155;">&nbsp;</span>`;

            // Info Icon: Standard "i" in circle, colored blue/accent
            html += `<button onclick="fetchBrokerReportSummary('${ticker}', '${row.link}', '${brokerClean}')" title="Generate AI Summary" style="background:transparent; border:none; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            </button>`;
        } else {
            html += '-';
        }

        html += '</div></td></tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function getRecoClass(reco) {
    if (!reco) return '';
    reco = reco.toLowerCase();
    if (reco.includes('buy') || reco.includes('accumulate')) return 'status-badge status-upcoming';
    if (reco.includes('sell') || reco.includes('reduce')) return 'status-badge status-urgent';
    return 'status-badge status-completed';
}

// Modal Logic and AI Summary
function closeModal() {
    document.getElementById('infoModal').style.display = 'none';
}

window.onclick = function (event) {
    const modal = document.getElementById('infoModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

async function fetchBrokerReportSummary(ticker, link, broker) {
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    modal.style.display = 'block';
    title.textContent = `AI Summary for ${ticker} - ${broker || 'Unknown Broker'}`;
    body.innerHTML = `<div class="loading-local"><div class="loader"></div><div>Analyzing report with AI... (Takes ~10-20s)</div></div>`;

    try {
        const response = await fetch('/api/v1/data-fetcher/broker-research/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, link })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to generate summary');
        }
        const data = await response.json();

        // Format bullet points
        // Format formatting: Convert newlines to paragraphs or lists
        // If content starts with bullets, make it a list
        let formattedContent = data.summary;

        // Remove "Start every bullet point..." instruction artifacts if present in output
        // Convert "- " to <li>
        if (formattedContent.includes('- ')) {
            const items = formattedContent.split('\n').filter(line => line.trim().length > 0);
            let listHtml = '<ul style="padding-left:1.5rem; line-height:1.6; color:#e2e8f0;">';
            let inList = false;

            items.forEach(line => {
                if (line.trim().startsWith('-')) {
                    listHtml += `<li style="margin-bottom:0.5rem;">${line.replace(/^- /, '')}</li>`;
                    inList = true;
                } else {
                    // Regular paragraph or heading
                    if (inList) {
                        listHtml += '</ul>';
                        inList = false;
                    }
                    listHtml += `<p style="margin-bottom:1rem; line-height:1.6; color:#94a3b8;">${line}</p>`;
                }
            });

            if (inList) listHtml += '</ul>';
            formattedContent = listHtml;
        } else {
            // Just paragraphs
            formattedContent = formattedContent.split('\n').map(p => `<p style="margin-bottom:1rem; line-height:1.6;">${p}</p>`).join('');
        }

        body.innerHTML = formattedContent;
    } catch (e) {
        let msg = e.message;
        // Try to make JSON error prettier if possible
        try {
            const jsonErr = JSON.parse(msg);
            if (jsonErr && jsonErr.error && jsonErr.error.message) {
                msg = jsonErr.error.message;
            } else if (jsonErr && jsonErr.message) {
                msg = jsonErr.message;
            }
        } catch (ignore) { }

        const brokerClean = (broker || '').replace(/'/g, "\\'");
        body.innerHTML = `
            <div class="error" style="text-align:left; color:#f87171; white-space: pre-wrap;">Error: ${msg}</div>
            <div style="text-align:center; margin-top:1rem;">
                <button onclick="fetchBrokerReportSummary('${ticker}', '${link}', '${brokerClean}')" style="background:var(--primary-color); border:none; padding:0.5rem 1rem; color:white; border-radius:0.5rem; cursor:pointer; font-weight:600;">🔄 Retry / Refetch</button>
            </div>
        `;
    }
}
