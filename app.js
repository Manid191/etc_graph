// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const CONFIG = {
    CHART_ID: 'mainChart',
    ANIMATION_DURATION: 600,
    STATUS_CODES: {
        1: { style: 'circle', color: '#22c55e' },
        2: { style: 'triangle', color: '#3b82f6' },
        3: { style: 'rect', color: '#f59e0b' },
        4: { style: 'rectRot', color: '#ef4444' },
        5: { style: 'star', color: '#a855f7' }
    }
};

// Global App State
const AppState = {
    rawData: [],
    charts: { main: null },
    measure: { active: false, p1: null, p2: null },
    thresholds: { power: null }
};

// Helper to read CSS Variables
function getVar(name) {
    // If running in node/test env without window
    if (typeof getComputedStyle === 'undefined') return '#000';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const COLORS = {
    steam: '#0ea5e9',
    power: '#f59e0b',
    temp1: '#ef4444',
    temp2: '#f59e0b',
    idf: '#0f172a',
    rgf: '#64748b',
    paf: '#94a3b8',
    soot: '#dc2626',
    problem: '#dc2626'
};

/**
 * Creates a solid 5-pointed star on a canvas for use as a Chart.js pointStyle.
 */
function createStarCanvas(color, size = 12) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const spikes = 5;
    const outerRadius = size / 2;
    const innerRadius = size / 5;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        let x = cx + Math.cos(((i * 2 * Math.PI) / spikes) - (Math.PI / 2)) * outerRadius;
        let y = cy + Math.sin(((i * 2 * Math.PI) / spikes) - (Math.PI / 2)) * outerRadius;
        ctx.lineTo(x, y);
        x = cx + Math.cos((((i + 0.5) * 2 * Math.PI) / spikes) - (Math.PI / 2)) * innerRadius;
        y = cy + Math.sin((((i + 0.5) * 2 * Math.PI) / spikes) - (Math.PI / 2)) * innerRadius;
        ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    return canvas;
}

const uploadInput = document.getElementById('uploadCsv');
const applyDateBtn = document.getElementById('applyDateRange');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');

document.addEventListener('DOMContentLoaded', init);

// Helper functions for Loading Overlay
window.showLoading = () => {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'flex';
};
window.hideLoading = () => {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
};

// Deleted old state vars, unified into AppState

window.toggleThresholdPanel = function () {
    const panel = document.getElementById('thresholdPanel');
    // Toggle flex/none
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'flex' : 'none';
};

window.updateThresholds = function () {
    const val = document.getElementById('powerThresholdInput').value;
    AppState.thresholds.power = val ? parseFloat(val) : null;
    if (AppState.charts.main) {
        AppState.charts.main.update();
    }
};

window.toggleMeasureMode = function () {
    AppState.measure.active = !AppState.measure.active;
    AppState.measure.p1 = null;
    AppState.measure.p2 = null;

    const btn = document.getElementById('timeDiffBtn'); // Correct ID for the button
    const output = document.getElementById('measureOutput');

    if (AppState.measure.active) {
        btn.classList.remove('btn-outline'); // Remove outline style
        btn.style.backgroundColor = 'var(--primary)'; // Active Blue
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--primary)';
        output.style.display = 'inline-block';
        output.textContent = 'Click on chart to start...';
        // Optional: Change cursor
        document.getElementById('mainChart').style.cursor = 'crosshair';
    } else {
        btn.classList.add('btn-outline'); // Revert to outline
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        output.style.display = 'none';
        output.textContent = '';
        document.getElementById('mainChart').style.cursor = 'default';
    }

    if (AppState.charts.main) {
        AppState.charts.main.update('none');
    }
};

async function init() {
    uploadInput.addEventListener('change', handleFileUpload);
    if (applyDateBtn) applyDateBtn.addEventListener('click', handleDateRange);
    if (document.getElementById('kpiSelector3')) {
        document.getElementById('kpiSelector3').addEventListener('change', () => {
            if (AppState.charts.main) updateVisibleRange(AppState.charts.main);
        });
    }

    // Try to load default data from JS store first (bypasses local CORS)
    if (window.DEFAULT_CSV_DATA) {
        console.log('Loading data from data-store.js');
        Papa.parse(window.DEFAULT_CSV_DATA, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                processData(results.data, results.meta.fields);
            }
        });
    } else {
        // Fallback to fetching data.csv (works on servers)
        loadInitialData();
    }
}

async function loadInitialData() {
    const DATA_FILE = 'data.csv?v=' + new Date().getTime();
    Papa.parse(DATA_FILE, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            processData(results.data, results.meta.fields);
        },
        error: function (err) {
            console.warn('Auto-load failed (likely CORS or file missing).');
            document.getElementById('dateRange').textContent = 'Please open a CSV file to begin analysis';
        }
    });
}

/**
 * Resets the application to a clean, no-data state.
 */
window.resetApp = function () {
    if (!confirm('Are you sure you want to clear all data and reset the dashboard?')) return;

    // Clear State
    AppState.rawData = [];
    AppState.measure = { active: false, p1: null, p2: null };
    AppState.thresholds = { power: null };

    // Destroy Scale & Chart
    if (AppState.charts.main) {
        AppState.charts.main.destroy();
        AppState.charts.main = null;
    }

    // Reset UI Elements
    document.getElementById('dateRange').textContent = 'Dashboard Reset. Please open a CSV file.';
    document.getElementById('kpiPower').textContent = '-';
    document.getElementById('kpiSteam').textContent = '-';

    const val3 = document.getElementById('kpiValue3');
    if (val3) val3.textContent = '-';

    const container = document.getElementById('legendToggles');
    if (container) container.innerHTML = '';

    // Clear Canvas
    const canvas = document.getElementById('mainChart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function handleDateRange() {
    if (!AppState.charts.main || !startDateInput.value) return;

    const start = new Date(startDateInput.value);
    start.setHours(0, 0, 0, 0);

    let end;
    if (endDateInput.value) {
        end = new Date(endDateInput.value);
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
    } else {
        // If no end date selected, set to next day 00:00 for full 24h cycle (Start 00:01 - End 24:00)
        end = new Date(start);
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
    }

    if (start > end) {
        alert("Start Date must be before End Date");
        return;
    }

    AppState.charts.main.options.scales.x.time.unit = 'day';
    // If range is small (< 3 days), switch to hour view
    if ((end - start) < (3 * 24 * 60 * 60 * 1000)) {
        AppState.charts.main.options.scales.x.time.unit = 'hour';
    }

    // User Requirement: Start at 01:00, End at 24:00 (Next Day 00:00)
    // Add 1 hour to start time for the VIEW
    const viewMin = start.getTime() + (1 * 60 * 60 * 1000); // 01:00
    AppState.charts.main.zoomScale('x', { min: viewMin, max: end.getTime() }, 'default');
    updateVisibleRange(AppState.charts.main);
}

function handleFileUpload(evt) {
    const file = evt.target.files[0];
    if (!file) return;

    showLoading(); // Show loader immediately

    // Use setTimeout to allow UI to render spinner before heavy parsing
    setTimeout(() => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                processData(results.data, results.meta.fields);
                document.getElementById('dateRange').textContent = `Loaded: ${file.name}`;
                evt.target.value = '';
                hideLoading(); // Hide loader
            },
            error: function (err) {
                console.error(err);
                alert('Error parsing file');
                hideLoading(); // Hide loader
            }
        });
    }, 50);
}

function processData(data, fields) {
    const cleanFields = fields.map(f => ({
        original: f,
        norm: f.replace(/[\r\n]+/g, ' ').toLowerCase().trim()
    }));

    const keys = {};
    cleanFields.forEach(f => {
        if (f.norm.includes('date') || f.norm.includes('time')) keys.date = f.original;
        else if (f.norm.includes('steam')) keys.steam = f.original;
        else if (f.norm.includes('export power')) keys.power = f.original;
        else if (f.norm.includes('post combustion') || f.norm.includes('fire temp')) keys.tempComb = f.original;
        else if (f.norm.includes('inlet bag') || f.norm.includes('flue temp')) keys.tempFlue = f.original;
        else if (f.norm.includes('idf')) keys.idf = f.original;
        else if (f.norm.includes('rgf')) keys.rgf = f.original;
        else if (f.norm.includes('paf running') || f.norm.includes('pv control')) keys.paf = f.original;
        else if (f.norm.includes('soot')) keys.soot = f.original;
        else if (f.norm.includes('problem') || f.norm.includes('alarm') || f.norm.includes('trip') || f.norm.includes('error')) keys.problem = f.original;
    });

    AppState.rawData = data.map(row => {
        const dateStr = row[keys.date] || '';
        const date = parseFlexDate(dateStr);

        return {
            date: date,
            steam: parseFloat(row[keys.steam]) || 0,
            power: parseFloat(row[keys.power]) || 0,
            tempComb: parseFloat(row[keys.tempComb]) || 0,
            tempFlue: parseFloat(row[keys.tempFlue]) || 0,
            idf: parseFloat(row[keys.idf]) || 0,
            rgf: parseFloat(row[keys.rgf]) || 0,
            paf: parseFloat(row[keys.paf]) || 0,
            soot: parseFloat(row[keys.soot]) || 0,
            problemVal: (() => {
                const raw = row[keys.problem];
                if (!raw || raw.trim() === '') return 0;
                const trimmed = raw.trim();
                if (['-', '.', '_', 'n/a', 'null'].includes(trimmed.toLowerCase())) return 0;
                const num = parseFloat(trimmed);
                if (!isNaN(num)) return num > 0 ? 1.05 : 0;
                return 1.05; // Treat valid text as problem
            })(),
            problemText: (() => {
                const raw = row[keys.problem];
                if (!raw || raw.trim() === '') return "";
                const trimmed = raw.trim();
                if (['-', '.', '_', 'n/a', 'null'].includes(trimmed.toLowerCase())) return "";
                const num = parseFloat(trimmed);
                if (!isNaN(num)) return num > 0 ? "Problem" : "";
                return trimmed; // Return the text code (S, B, F, etc.)
            })(),
            problemCodes: (() => {
                const raw = row[keys.problem];
                if (!raw || raw.trim() === '') return [];
                const trimmed = raw.trim();
                // Match all digits 1-5
                const matches = trimmed.match(/[1-5]/g);
                if (matches) {
                    return matches.map(m => parseInt(m));
                }
                return [];
            })()
        };
    }).filter(d => d.date && !isNaN(d.date.getTime()) && !isNaN(d.power));

    AppState.rawData.sort((a, b) => a.date - b.date);

    if (AppState.rawData.length === 0) {
        alert("No valid data found. Please check CSV format.");
        return;
    }

    updateKPIs();
    renderMainChart();
    updateHeader();

    setTimeout(() => {
        window.zoomTime('all');
    }, 100);
}

function formatUserDate(date) {
    if (date.getHours() === 0 && date.getMinutes() === 0) {
        const prev = new Date(date);
        prev.setDate(prev.getDate() - 1);
        const d = String(prev.getDate()).padStart(2, '0');
        const m = String(prev.getMonth() + 1).padStart(2, '0');
        const y = prev.getFullYear();
        return `${d}/${m}/${y} 24:00`;
    }
    return null;
}

function parseFlexDate(str) {
    if (!str) return null;

    // Try D/M/YYYY H:mm
    const matchDMY = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (matchDMY) {
        const d = new Date(parseInt(matchDMY[3]), parseInt(matchDMY[2]) - 1, parseInt(matchDMY[1]), parseInt(matchDMY[4]), parseInt(matchDMY[5]));
        if (d.getHours() === 0 && d.getMinutes() === 0) {
            d.setDate(d.getDate() + 1);
        }
        return d;
    }

    // Try YYYY-MM-DD HH:mm
    const matchYMD = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (matchYMD) {
        const d = new Date(parseInt(matchYMD[1]), parseInt(matchYMD[2]) - 1, parseInt(matchYMD[3]), parseInt(matchYMD[4]), parseInt(matchYMD[5]));
        if (d.getHours() === 0 && d.getMinutes() === 0) {
            d.setDate(d.getDate() + 1);
        }
        return d;
    }

    const d = new Date(str);
    const result = isNaN(d.getTime()) ? null : d;

    if (result && result.getHours() === 0 && result.getMinutes() === 0) {
        result.setDate(result.getDate() + 1);
    }
    return result;
}

function updateHeader() {
    if (AppState.rawData.length === 0) return;
    const start = AppState.rawData[0].date.toLocaleDateString();
    const end = AppState.rawData[AppState.rawData.length - 1].date.toLocaleDateString();
    if (!document.getElementById('dateRange').textContent.includes('Sample')) {
        document.getElementById('dateRange').textContent = `Data Range: ${start} - ${end} (${AppState.rawData.length} points)`;
    }
}

function updateKPIs(startTime = null, endTime = null) {
    let dataToCalc = AppState.rawData;

    if (startTime !== null && endTime !== null) {
        dataToCalc = AppState.rawData.filter(d => {
            const t = d.date.getTime();
            // User Logic: Start 00:01, End 00:00 (Next Day)
            // Value at StartTime (00:00) is excluded (belongs to prev day)
            // Value at EndTime (00:00 next day) is included
            return t > startTime && t <= endTime;
        });
    }

    if (dataToCalc.length === 0) {
        document.getElementById('kpiPower').textContent = '-';
        document.getElementById('kpiSteam').textContent = '-';
        const val3 = document.getElementById('kpiValue3');
        if (val3) val3.textContent = '-';
        return;
    }

    // Helper to calculate average ignoring zero, negative, NaN, or empty values
    const calcAvg = (data, key) => {
        const valid = data.map(d => d[key]).filter(v => !isNaN(v) && v > 0);
        if (valid.length === 0) return 0;
        return (valid.reduce((acc, val) => acc + val, 0) / valid.length);
    };

    const avgPower = calcAvg(dataToCalc, 'power').toFixed(2);
    const avgSteam = calcAvg(dataToCalc, 'steam').toFixed(2);

    document.getElementById('kpiPower').textContent = avgPower + ' MW';
    document.getElementById('kpiSteam').textContent = avgSteam + ' t/h';

    const selector = document.getElementById('kpiSelector3');
    const valEl = document.getElementById('kpiValue3');

    if (selector && valEl) {
        const type = selector.value;
        let val = 0;
        let unit = '';
        if (type === 'temp') {
            val = calcAvg(dataToCalc, 'tempComb').toFixed(1);
            unit = '°C';
        } else if (type === 'idf') {
            val = calcAvg(dataToCalc, 'idf').toFixed(1);
            unit = '%';
        } else if (type === 'rgf') {
            val = calcAvg(dataToCalc, 'rgf').toFixed(1);
            unit = '%';
        } else if (type === 'paf') {
            val = calcAvg(dataToCalc, 'paf').toFixed(1);
            unit = '%';
        }
        valEl.textContent = val + ' ' + unit;
    }
}

function renderMainChart() {
    if (AppState.charts.main) {
        AppState.charts.main.destroy();
    }

    const ctx = document.getElementById('mainChart').getContext('2d');

    // Mappings for Problem CODES (1-5)
    const starCanvas = createStarCanvas('#a855f7', 10);
    const PROBLEM_CONFIG = {
        1: { style: 'circle', color: '#22c55e' },   // Green Circle
        2: { style: 'triangle', color: '#3b82f6' }, // Blue Triangle
        3: { style: 'rect', color: '#f59e0b' },     // Orange Square
        4: { style: 'rectRot', color: '#ef4444' },  // Red Diamond
        5: { style: starCanvas, color: '#a855f7' }  // Purple Solid Star
    };

    // Flatten problem data so each code in a row gets its own point
    const problemDataPoints = [];
    AppState.rawData.forEach(d => {
        if (d.problemCodes.length > 0) {
            d.problemCodes.forEach((code, idx) => {
                problemDataPoints.push({
                    x: d.date,
                    // Stack symbols vertically: Base 1.1 + small offset per symbol in the same time point
                    y: 1.1 + (idx * 0.05),
                    code: code,
                    customLabel: d.problemText
                });
            });
        }
    });

    const datasets = [
        {
            label: 'Steam to Turbine (t/h)',
            data: AppState.rawData.map(d => ({ x: d.date, y: d.steam })),
            borderColor: COLORS.steam,
            backgroundColor: COLORS.steam,
            yAxisID: 'y_steam',
            borderWidth: 2,
            pointRadius: 0,
            hidden: false,
            order: 10
        },
        {
            label: 'Export Power (MW)',
            data: AppState.rawData.map(d => ({ x: d.date, y: d.power })),
            borderColor: COLORS.power,
            backgroundColor: COLORS.power,
            yAxisID: 'y_power',
            borderWidth: 2,
            pointRadius: 0,
            order: 10
        },
        {
            label: 'RGF Running (%)',
            data: AppState.rawData.map(d => ({ x: d.date, y: d.rgf })),
            borderColor: COLORS.rgf,
            backgroundColor: COLORS.rgf,
            yAxisID: 'y_percent',
            borderWidth: 2,
            borderDash: [4, 2],
            pointRadius: 0,
            hidden: true,
            order: 10
        },
        {
            label: 'PAF Running (%)',
            data: AppState.rawData.map(d => ({ x: d.date, y: d.paf })),
            borderColor: COLORS.paf,
            backgroundColor: COLORS.paf,
            yAxisID: 'y_percent',
            borderWidth: 2,
            borderDash: [4, 2],
            pointRadius: 0,
            hidden: true,
            order: 10
        },
        {
            label: 'Post Combustion Temp (°C)',
            data: AppState.rawData.map(d => ({ x: d.date, y: d.tempComb })),
            borderColor: COLORS.temp1,
            backgroundColor: COLORS.temp1,
            yAxisID: 'y_temp',
            borderWidth: 2,
            pointRadius: 0,
            hidden: true,
            order: 2
        },
        {
            label: 'IDF Running (%)',
            data: AppState.rawData.map(d => ({ x: d.date, y: d.idf })),
            borderColor: COLORS.idf,
            backgroundColor: COLORS.idf,
            yAxisID: 'y_percent',
            borderWidth: 2,
            pointRadius: 0,
            hidden: true,
            order: 1
        },
        {
            label: 'Soot Blow',
            data: AppState.rawData
                .filter(d => d.soot === 1)
                .map(d => ({ x: d.date, y: 0.05 })), // Bottom near X-axis
            borderColor: COLORS.soot,
            backgroundColor: COLORS.soot,
            yAxisID: 'y_soot',
            type: 'scatter',
            pointStyle: 'triangle',
            pointRadius: 2,
            pointRadius: 2,
            borderWidth: 2,
            hidden: true,
            order: 0
        },
        {
            label: 'Problem',
            data: problemDataPoints,
            // Map styles based on code.
            pointStyle: problemDataPoints.map(p => PROBLEM_CONFIG[p.code]?.style || 'crossRot'),
            backgroundColor: problemDataPoints.map(p => PROBLEM_CONFIG[p.code]?.color || COLORS.problem),
            borderColor: '#64748b',
            yAxisID: 'y_soot',
            type: 'scatter',
            pointRadius: 3,
            borderWidth: 1,
            hidden: false,
            order: 50
        }
    ];

    const shiftBackgroundPlugin = {
        id: 'shiftBackground',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
            if (!x || x.min === undefined) return;
            const unit = x.options.time ? x.options.time.unit : null;
            const rangeInfo = x.max - x.min;
            // Allow background shifts if range is less than 3 days (approx)
            const showShifts = rangeInfo < (3 * 24 * 60 * 60 * 1000);

            if (!showShifts) return;

            const shifts = [
                { name: 'Night Shift', start: 0, end: 8, color: getVar('--shift-night') },   // 00:00 - 08:00
                { name: 'Morning Shift', start: 8, end: 16, color: getVar('--shift-morning') },  // 08:00 - 16:00
                { name: 'Afternoon Shift', start: 16, end: 24, color: getVar('--shift-afternoon') } // 16:00 - 24:00
            ];

            const startDate = new Date(x.min);
            startDate.setHours(0, 0, 0, 0);
            // Start 1 day before to ensure edge overlap
            startDate.setDate(startDate.getDate() - 1);

            const endDate = new Date(x.max);
            endDate.setHours(0, 0, 0, 0);
            // End 1 day after
            endDate.setDate(endDate.getDate() + 1);

            ctx.save();
            // Clip to chart area to prevent bleeding into axes
            ctx.beginPath();
            ctx.rect(chart.chartArea.left, chart.chartArea.top, chart.chartArea.right - chart.chartArea.left, chart.chartArea.bottom - chart.chartArea.top);
            ctx.clip();

            // Loop through each day in the range
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const baseTime = d.getTime();

                shifts.forEach(shift => {
                    const t1 = baseTime + (shift.start * 3600 * 1000);
                    const t2 = baseTime + (shift.end * 3600 * 1000);

                    // Skip if out of view
                    if (t2 < x.min || t1 > x.max) return;

                    const startPixel = x.getPixelForValue(t1);
                    const endPixel = x.getPixelForValue(t2);
                    const width = endPixel - startPixel;

                    ctx.fillStyle = shift.color;
                    ctx.fillRect(startPixel, top, width, bottom - top);

                    // Draw label if wide enough
                    if (width > 60) {
                        ctx.fillStyle = '#64748b';
                        ctx.font = '600 11px Outfit';
                        ctx.textAlign = 'center';
                        ctx.fillText(shift.name, startPixel + width / 2, top + 15);
                    }
                });
            }
            ctx.restore();
        }
    };

    // Plugins
    const thresholdPlugin = {
        id: 'thresholdPlugin',
        afterDraw: (chart) => {
            if (AppState.thresholds.power === null) return;
            const { ctx, chartArea: { left, right }, scales: { y_power } } = chart;

            // Safety check: verify axis exists and value is within somewhat reasonable drawing bounds
            if (!y_power) return;

            const yPos = y_power.getPixelForValue(AppState.thresholds.power);

            // Only draw if within chart logic (Chart.js usually handles clipping, but we can double check)
            if (yPos < chart.chartArea.top || yPos > chart.chartArea.bottom) return;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(left, yPos);
            ctx.lineTo(right, yPos);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ef4444'; // Red alert color
            ctx.setLineDash([6, 4]);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 12px Outfit';
            ctx.textAlign = 'right';
            ctx.fillText(`Lim: ${AppState.thresholds.power} MW`, right - 5, yPos - 5);

            ctx.restore();
        }
    };

    const measurementPlugin = {
        id: 'measurementPlugin',
        afterDraw: (chart) => {
            if (!AppState.measure.active || !AppState.measure.p1) return;
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;

            ctx.save();
            ctx.beginPath();
            ctx.rect(chart.chartArea.left, chart.chartArea.top, chart.chartArea.right - chart.chartArea.left, chart.chartArea.bottom - chart.chartArea.top);
            ctx.clip();

            const drawLine = (time) => {
                const xPos = x.getPixelForValue(time);
                ctx.beginPath();
                ctx.moveTo(xPos, top);
                ctx.lineTo(xPos, bottom);
                ctx.strokeStyle = '#3b82f6'; // Primary Blue
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            };

            drawLine(AppState.measure.p1);

            if (AppState.measure.p2) {
                drawLine(AppState.measure.p2);

                const x1 = x.getPixelForValue(AppState.measure.p1);
                const x2 = x.getPixelForValue(AppState.measure.p2);
                const width = Math.abs(x2 - x1);
                ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
                ctx.fillRect(Math.min(x1, x2), top, width, bottom - top);

                // Draw Time Diff Text on Chart
                let diffMs = Math.abs(AppState.measure.p2 - AppState.measure.p1);

                // Round to nearest minute
                diffMs = Math.round(diffMs / 60000) * 60000;

                const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const mins = Math.round((diffMs % (60 * 60 * 1000)) / (60 * 1000));

                let text = `${days}d ${hours}h`;
                if (days === 0 && hours === 0) text = `${mins} mins`;
                else if (days === 0) text = `${hours}h ${mins}m`;

                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 12px Outfit';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                // Draw a small background pill for the text
                const textX = (x1 + x2) / 2;
                const textY = top + 25;
                const textWidth = ctx.measureText(text).width + 12;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(textX - textWidth / 2, textY - 14, textWidth, 18, 4);
                } else {
                    ctx.rect(textX - textWidth / 2, textY - 14, textWidth, 18);
                }
                ctx.fill();

                ctx.fillStyle = '#0ea5e9'; // Primary Blue
                ctx.fillText(text, textX, textY);
            }

            ctx.restore();
        }
    };

    // Safe Max/Min calc to avoid stack overflow with large arrays
    const maxSteamVal = AppState.rawData.reduce((max, d) => Math.max(max, d.steam), 0);
    const maxPowerVal = AppState.rawData.reduce((max, d) => Math.max(max, d.power), 0);

    // Fan speed max (IDF, RGF, PAF)
    const maxIDF = AppState.rawData.reduce((max, d) => Math.max(max, d.idf), 0);
    const maxRGF = AppState.rawData.reduce((max, d) => Math.max(max, d.rgf), 0);
    const maxPAF = AppState.rawData.reduce((max, d) => Math.max(max, d.paf), 0);
    const maxFanVal = Math.max(maxIDF, maxRGF, maxPAF, 100); // Default to 100 if data is lower

    // Combustion Temp Scaling
    const tempVals = AppState.rawData.map(d => d.tempComb).filter(v => v > 0);
    let maxTempVal, minTempVal;

    if (tempVals.length > 0) {
        maxTempVal = tempVals.reduce((max, v) => Math.max(max, v), -Infinity);
        minTempVal = tempVals.reduce((min, v) => Math.min(min, v), Infinity);
    } else {
        maxTempVal = 1000;
        minTempVal = 800;
    }

    // 10% padding for Temp (10% of the Range)
    const tempPadding = (maxTempVal - minTempVal) * 0.1;

    // Register the plugin if available (for CDN usage it might be auto-registered or need explicit registration)

    AppState.charts.main = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        plugins: [shiftBackgroundPlugin, measurementPlugin, thresholdPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (e, elements, chart) => {
                const canvasPosition = Chart.helpers.getRelativePosition(e, chart);
                const clickTime = chart.scales.x.getValueForPixel(canvasPosition.x);

                // Measurement Mode Logic
                if (AppState.measure.active && clickTime) {
                    if (!AppState.measure.p1 || (AppState.measure.p1 && AppState.measure.p2)) {
                        AppState.measure.p1 = clickTime;
                        AppState.measure.p2 = null;
                        document.getElementById('measureOutput').textContent = 'Select end point...';
                    } else {
                        AppState.measure.p2 = clickTime;
                        const diffMs = Math.abs(AppState.measure.p2 - AppState.measure.p1);
                        const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                        const hours = Math.round((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        const mins = Math.round((diffMs % (60 * 60 * 1000)) / (60 * 1000));

                        let text = `Diff: ${days}d ${hours}h`;
                        if (days === 0 && hours === 0) text = `Diff: ${mins} mins`;

                        document.getElementById('measureOutput').textContent = text;
                    }
                    chart.update('none');
                    return;
                }

                // Normal Zoom Logic
                if (chart.options.scales.x.time.unit === 'day') {
                    if (clickTime) {
                        const d = new Date(clickTime);
                        d.setHours(0, 0, 0, 0);
                        const min = d.getTime();
                        const max = min + (24 * 60 * 60 * 1000);
                        chart.options.scales.x.min = min;
                        chart.options.scales.x.max = max;
                        chart.options.scales.x.time.unit = 'hour';
                        chart.update();
                        updateVisibleRange(chart);
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            hour: 'HH:mm',
                            day: 'dd/MM/yyyy',
                            month: 'MMM yyyy'
                        },
                        tooltipFormat: 'dd/MM/yyyy HH:mm'
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                    ticks: {
                        color: '#64748b',
                        font: { family: 'Outfit' },
                        callback: function (val, index, ticks) {
                            const min = this.chart.scales.x.min;
                            const max = this.chart.scales.x.max;
                            const range = max - min;
                            const dayMs = 26 * 3600 * 1000; // Small buffer for > 24h

                            const date = new Date(val);

                            // Day View (Time Only)
                            if (range <= dayMs) {
                                // Check for 00:00 -> 24:00 (Special Case)
                                if (date.getHours() === 0 && date.getMinutes() === 0) {
                                    // If it's the "end" of the previous day, show 24:00
                                    // Visual trick: 00:00 is usually shown as 24:00 of prev day.
                                    return '24:00';
                                }
                                const hh = String(date.getHours()).padStart(2, '0');
                                const mm = String(date.getMinutes()).padStart(2, '0');
                                return `${hh}:${mm}`;
                            }

                            // Long View (Date Only)
                            const d = String(date.getDate()).padStart(2, '0');
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const y = date.getFullYear();
                            return `${d}/${m}/${y}`;
                        }
                    }
                },
                y_steam: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Steam (t/h)', color: COLORS.steam },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                    max: Math.ceil(maxSteamVal * 1.1), // Fixed 10% padding
                    min: 0,
                    ticks: {
                        precision: 0,
                        callback: (v) => Math.round(v)
                    }
                },
                y_power: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Power (MW)', color: COLORS.power },
                    grid: { drawOnChartArea: false },
                    max: Math.ceil(maxPowerVal * 1.1), // Fixed 10% padding
                    min: 0,
                    ticks: {
                        precision: 0,
                        callback: (v) => Math.round(v)
                    }
                },
                y_percent: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    // Fixed scale for Fans (Max data + 10%)
                    min: 0,
                    max: 120,
                    title: { display: true, text: 'Fan Speed (%)', color: COLORS.idf },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        precision: 0,
                        callback: (v) => Math.round(v) + '%'
                    }
                },
                y_temp: {
                    type: 'linear',
                    display: true, // Show axis
                    position: 'right',
                    title: { display: true, text: 'Post Combustion Temp (°C)', color: COLORS.temp1 },
                    grid: { drawOnChartArea: false },
                    min: 0,
                    max: Math.ceil(maxTempVal + tempPadding), // Fixed scale
                    ticks: {
                        precision: 0,
                        callback: (v) => Math.round(v)
                    }
                },
                y_soot: {
                    type: 'linear',
                    display: false,
                    min: 0,
                    max: 1.3 // Increased to prevent marker/text overlap
                }
            },
            plugins: {
                tooltip: {
                    position: 'nearest',
                    callbacks: {
                        label: function (context) {
                            // User requested NOT to show problem text OR Soot Blow in the tooltip box
                            if (context.dataset.label === 'Problem' || context.dataset.label === 'Soot Blow') {
                                return null;
                            }
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y;
                            }
                            return label;
                        },
                        title: function (context) {
                            if (context.length > 0) {
                                const date = new Date(context[0].parsed.x);
                                const custom = formatUserDate(date);
                                if (custom) return custom;

                                // Default format matching tooltipFormat
                                const d = String(date.getDate()).padStart(2, '0');
                                const m = String(date.getMonth() + 1).padStart(2, '0');
                                const y = date.getFullYear();
                                const hh = String(date.getHours()).padStart(2, '0');
                                const mm = String(date.getMinutes()).padStart(2, '0');
                                return `${d}/${m}/${y} ${hh}:${mm}`;
                            }
                            return '';
                        }
                    }
                },
                legend: { display: false },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        onPan: ({ chart }) => updateVisibleRange(chart)
                    },
                    zoom: {
                        wheel: { enabled: false },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoom: ({ chart }) => updateVisibleRange(chart)
                    }
                }
            }
        }
    });

    ctx.canvas.addEventListener('wheel', handleWheel);

    // Direct call, chart object is ready
    if (AppState.charts.main) {
        generateCustomLegend(AppState.charts.main);
    }

    document.getElementById('resetZoomBtn').onclick = () => window.zoomTime('all');
}

// handleWheel: See definition below (after captureDashboard)

window.zoomTime = function (hours) {
    const chart = AppState.charts.main;
    if (!chart || AppState.rawData.length === 0) return;

    chart.resetZoom('none');
    const firstDataTime = AppState.rawData[0].date.getTime();
    const lastDataTime = AppState.rawData[AppState.rawData.length - 1].date.getTime();

    let centerTime;
    const currentMin = chart.scales.x.min;
    const currentMax = chart.scales.x.max;

    if (currentMin && currentMax && !isNaN(currentMin)) {
        centerTime = (currentMin + currentMax) / 2;
    } else {
        centerTime = lastDataTime;
    }

    let newMin, newMax, newUnit;

    if (hours === 'all') {
        const totalDuration = lastDataTime - firstDataTime;
        const pad = Math.max(totalDuration * 0.02, 3600000);
        newMin = firstDataTime - pad;
        newMax = lastDataTime + pad;
        newUnit = 'day';
    } else if (hours === 720) {
        const anchorDate = new Date(centerTime);
        const startOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
        const endOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
        newMin = startOfMonth.getTime();
        newMax = endOfMonth.getTime();
        newUnit = 'day';
    } else if (hours === 24) {
        const anchorDate = new Date(centerTime);
        anchorDate.setHours(0, 0, 0, 0);
        newMin = anchorDate.getTime() + (3600 * 1000); // Start at 01:00
        newMax = anchorDate.getTime() + (24 * 3600 * 1000); // End at 24:00 (Next Day 00:00)
        newUnit = 'hour';
    } else {
        const rangeMs = hours * 3600 * 1000;
        newMin = centerTime - rangeMs / 2;
        const d = new Date(newMin);
        d.setHours(0, 0, 0, 0);
        newMin = d.getTime();
        newMax = newMin + rangeMs;
        newUnit = 'day';
    }

    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    chart.options.scales.x.time.unit = newUnit;
    chart.update();
    updateVisibleRange(chart);
};

function generateCustomLegend(chart) {
    const container = document.getElementById('legendToggles');
    if (!container) return;
    container.innerHTML = '';

    if (!chart || !chart.data || !chart.data.datasets) return;

    chart.data.datasets.forEach((dataset, index) => {
        // Create an item for EVERY dataset, even if label is missing (use fallback)
        // This ensures at least something shows up if logic is correct

        const item = document.createElement('div');
        const isHidden = !chart.isDatasetVisible(index);
        item.className = `legend-item ${isHidden ? 'hidden' : ''}`;

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        // Use background color if border isn't clear, or fallback
        colorBox.style.backgroundColor = dataset.borderColor || dataset.backgroundColor || '#94a3b8';

        const label = document.createElement('span');
        label.textContent = dataset.label || `Series ${index + 1}`;

        item.appendChild(colorBox);
        item.appendChild(label);

        item.onclick = () => {
            chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
            item.classList.toggle('hidden');
            chart.update();
        };

        container.appendChild(item);
    });
}

function updateVisibleRange(chart) {
    const min = chart.scales.x.min;
    const max = chart.scales.x.max;
    if (!min || !max) return;

    const d1 = new Date(min);
    const d2 = new Date(max);
    const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    if (!document.getElementById('dateRange').textContent.includes('Sample')) {
        document.getElementById('dateRange').textContent = `Range: ${fmt(d1)} - ${fmt(d2)}`;
    }

    updateKPIs(min, max);

}



window.captureDashboard = function () {
    const element = document.getElementById('dashboard');
    if (!element) return;

    html2canvas(element, {
        backgroundColor: '#f1f5f9',
        scale: 2, // Higher resolution
        logging: false,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `PowerPlant_Report_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });



}

function handleWheel(e) {
    e.preventDefault();
    const chart = AppState.charts.main;
    const scale = chart.scales.x;
    const currentRange = scale.max - scale.min;
    const hourMs = 3600 * 1000;
    const dayMs = 24 * hourMs;

    // "Day View" is approx 23h (01:00-24:00) or 24h. Let's say 22h to 26h.
    const isDayView = currentRange > (22 * hourMs) && currentRange < (26 * hourMs);
    const isMonthView = currentRange > (25 * dayMs) && currentRange < (35 * dayMs);

    let newMin, newMax;

    if (isDayView) {
        const direction = Math.sign(e.deltaY);
        // Find anchor "Midnight" from current view.
        let anchor = new Date(scale.min);

        // Compensate if we are starting at 01:00 to find the true "Day"
        if (anchor.getHours() === 1) {
            anchor.setHours(0, 0, 0, 0);
        } else {
            // General snap to midnight
            anchor.setHours(0, 0, 0, 0);
        }

        // Move by 1 Day
        anchor.setDate(anchor.getDate() + direction);

        // Set New Range: 01:00 to 24:00 (Next Day 00:00)
        newMin = anchor.getTime() + hourMs; // 01:00
        newMax = anchor.getTime() + dayMs;  // 24:00 (Next Day 00:00) 

    } else if (isMonthView) {
        const direction = Math.sign(e.deltaY);
        const d = new Date(scale.min);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        d.setMonth(d.getMonth() + direction);
        newMin = d.getTime();
        const d2 = new Date(d);
        d2.setMonth(d2.getMonth() + 1);
        newMax = d2.getTime();
    } else {
        const shift = currentRange * 0.1 * Math.sign(e.deltaY);
        newMin = scale.min + shift;
        newMax = scale.max + shift;
    }

    if (AppState.rawData.length > 0) {
        const dataMin = AppState.rawData[0].date.getTime();
        const dataMax = AppState.rawData[AppState.rawData.length - 1].date.getTime();
        if (newMax < dataMin || newMin > dataMax) return;
    }

    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    chart.update('none');
    updateVisibleRange(chart);
}

