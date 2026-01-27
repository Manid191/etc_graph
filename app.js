// Config & State
let rawData = [];
let charts = {};

// Colors - Updated for Premium Theme
const COLORS = {
    steam: '#0ea5e9', // Sky 500
    power: '#f59e0b', // Amber 500
    temp1: '#ef4444', // Red 500
    temp2: '#a855f7', // Purple 500
    idf: '#22c55e',   // Green 500
    rgf: '#ec4899',   // Pink 500
    soot: '#dc2626'   // Red 600
};

const uploadInput = document.getElementById('uploadCsv');
const applyDateBtn = document.getElementById('applyDateRange');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');

document.addEventListener('DOMContentLoaded', init);

async function init() {
    uploadInput.addEventListener('change', handleFileUpload);
    uploadInput.addEventListener('change', handleFileUpload);
    if (applyDateBtn) applyDateBtn.addEventListener('click', handleDateRange);
    if (document.getElementById('kpiSelector3')) {
        document.getElementById('kpiSelector3').addEventListener('change', () => {
            if (charts.main) updateVisibleRange(charts.main);
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
    const DATA_FILE = 'data.csv';
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
    rawData = [];

    // Destroy Scale & Chart
    if (charts.main) {
        charts.main.destroy();
        charts.main = null;
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
    if (!charts.main || !startDateInput.value) return;

    const start = new Date(startDateInput.value);
    start.setHours(0, 0, 0, 0);

    let end;
    if (endDateInput.value) {
        end = new Date(endDateInput.value);
        end.setHours(23, 59, 59, 999);
    } else {
        // If no end date selected, default to single day view (Start Date 00:00 to 23:59)
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
    }

    if (start > end) {
        alert("Start Date must be before End Date");
        return;
    }

    charts.main.options.scales.x.time.unit = 'day';
    // If range is small (< 3 days), switch to hour view
    if ((end - start) < (3 * 24 * 60 * 60 * 1000)) {
        charts.main.options.scales.x.time.unit = 'hour';
    }

    charts.main.zoomScale('x', { min: start.getTime(), max: end.getTime() }, 'default');
    updateVisibleRange(charts.main);
}

function handleFileUpload(evt) {
    const file = evt.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            processData(results.data, results.meta.fields);
            document.getElementById('dateRange').textContent = `Loaded: ${file.name}`;
            evt.target.value = '';
        },
        error: function (err) {
            console.error(err);
            alert('Error parsing file');
        }
    });
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
        else if (f.norm.includes('soot')) keys.soot = f.original;
    });

    rawData = data.map(row => {
        const dateStr = row[keys.date] || '';
        const date = parseFlexDate(dateStr);

        return {
            date: date,
            steam: parseFloat(row[keys.steam]),
            power: parseFloat(row[keys.power]),
            tempComb: parseFloat(row[keys.tempComb]),
            tempFlue: parseFloat(row[keys.tempFlue]),
            idf: parseFloat(row[keys.idf]),
            rgf: parseFloat(row[keys.rgf]),
            soot: parseFloat(row[keys.soot]) || 0
        };
    }).filter(d => d.date && !isNaN(d.date.getTime()) && !isNaN(d.power));

    rawData.sort((a, b) => a.date - b.date);

    if (rawData.length === 0) {
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

function parseFlexDate(str) {
    if (!str) return null;

    // Try D/M/YYYY H:mm
    const matchDMY = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (matchDMY) {
        return new Date(parseInt(matchDMY[3]), parseInt(matchDMY[2]) - 1, parseInt(matchDMY[1]), parseInt(matchDMY[4]), parseInt(matchDMY[5]));
    }

    // Try YYYY-MM-DD HH:mm
    const matchYMD = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (matchYMD) {
        return new Date(parseInt(matchYMD[1]), parseInt(matchYMD[2]) - 1, parseInt(matchYMD[3]), parseInt(matchYMD[4]), parseInt(matchYMD[5]));
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function updateHeader() {
    if (rawData.length === 0) return;
    const start = rawData[0].date.toLocaleDateString();
    const end = rawData[rawData.length - 1].date.toLocaleDateString();
    if (!document.getElementById('dateRange').textContent.includes('Sample')) {
        document.getElementById('dateRange').textContent = `Data Range: ${start} - ${end} (${rawData.length} points)`;
    }
}

function updateKPIs(startTime = null, endTime = null) {
    let dataToCalc = rawData;

    if (startTime !== null && endTime !== null) {
        dataToCalc = rawData.filter(d => {
            const t = d.date.getTime();
            return t >= startTime && t <= endTime;
        });
    }

    if (dataToCalc.length === 0) {
        document.getElementById('kpiPower').textContent = '-';
        document.getElementById('kpiSteam').textContent = '-';
        const val3 = document.getElementById('kpiValue3');
        if (val3) val3.textContent = '-';
        return;
    }

    const avgPower = (dataToCalc.reduce((acc, r) => acc + r.power, 0) / dataToCalc.length).toFixed(2);
    const avgSteam = (dataToCalc.reduce((acc, r) => acc + r.steam, 0) / dataToCalc.length).toFixed(2);

    document.getElementById('kpiPower').textContent = avgPower;
    document.getElementById('kpiSteam').textContent = avgSteam;

    const selector = document.getElementById('kpiSelector3');
    const unitEl = document.getElementById('kpiUnit3');
    const valEl = document.getElementById('kpiValue3');

    if (selector && unitEl && valEl) {
        const type = selector.value;
        let val = 0;
        if (type === 'temp') {
            val = Math.max(...dataToCalc.map(r => r.tempComb)).toFixed(1);
            unitEl.textContent = '°C';
        } else if (type === 'idf') {
            val = (dataToCalc.reduce((acc, r) => acc + r.idf, 0) / dataToCalc.length).toFixed(1);
            unitEl.textContent = '%';
        } else if (type === 'rgf') {
            val = (dataToCalc.reduce((acc, r) => acc + r.rgf, 0) / dataToCalc.length).toFixed(1);
            unitEl.textContent = '%';
        }
        valEl.textContent = val;
    }
}

function renderMainChart() {
    if (charts.main) {
        charts.main.destroy();
    }

    const ctx = document.getElementById('mainChart').getContext('2d');

    const datasets = [
        {
            label: 'Steam Flow (t/h)',
            data: rawData.map(d => ({ x: d.date, y: d.steam })),
            borderColor: COLORS.steam,
            backgroundColor: COLORS.steam,
            yAxisID: 'y_steam',
            borderWidth: 2,
            pointRadius: 0,
            hidden: false
        },
        {
            label: 'Export Power (MW)',
            data: rawData.map(d => ({ x: d.date, y: d.power })),
            borderColor: COLORS.power,
            backgroundColor: COLORS.power,
            yAxisID: 'y_power',
            borderWidth: 2,
            pointRadius: 0
        },
        {
            label: 'Combustion Temp (°C)',
            data: rawData.map(d => ({ x: d.date, y: d.tempComb })),
            borderColor: COLORS.temp1,
            backgroundColor: COLORS.temp1,
            yAxisID: 'y_temp',
            borderWidth: 1.5,
            pointRadius: 0,
            hidden: true
        },
        {
            label: 'IDF Running (%)',
            data: rawData.map(d => ({ x: d.date, y: d.idf })),
            borderColor: COLORS.idf,
            backgroundColor: COLORS.idf,
            yAxisID: 'y_percent',
            borderWidth: 1.5,
            pointRadius: 0,
            hidden: true
        },
        {
            label: 'RGF Running (%)',
            data: rawData.map(d => ({ x: d.date, y: d.rgf })),
            borderColor: COLORS.rgf,
            backgroundColor: COLORS.rgf,
            yAxisID: 'y_percent',
            pointRadius: 0,
            hidden: true
        },
        {
            label: 'Soot Blow (On/Off)',
            data: rawData
                .filter(d => d.soot === 1)
                .map(d => ({ x: d.date, y: 1 })),
            borderColor: COLORS.soot,
            backgroundColor: COLORS.soot,
            yAxisID: 'y_soot',
            type: 'scatter',
            pointStyle: 'crossRot',
            pointRadius: 6,
            borderWidth: 2,
            hidden: true
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
                { name: 'Night Shift', start: 0, end: 8, color: 'rgba(59, 130, 246, 0.1)' },   // 00:00 - 08:00
                { name: 'Morning Shift', start: 8, end: 16, color: 'rgba(234, 179, 8, 0.1)' },  // 08:00 - 16:00
                { name: 'Afternoon Shift', start: 16, end: 24, color: 'rgba(249, 115, 22, 0.1)' } // 16:00 - 24:00
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

    const maxSteamVal = Math.max(...rawData.map(d => d.steam));
    const maxPowerVal = Math.max(...rawData.map(d => d.power));

    // Combustion Temp Scaling
    const tempVals = rawData.map(d => d.tempComb).filter(v => v > 0); // Filter zeros if any
    const maxTempVal = tempVals.length ? Math.max(...tempVals) : 1000;
    const minTempVal = tempVals.length ? Math.min(...tempVals) : 800;
    const tempPadding = (maxTempVal - minTempVal) * 0.1; // 10% padding

    charts.main = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        plugins: [shiftBackgroundPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (e, elements, chart) => {
                if (chart.options.scales.x.time.unit === 'day') {
                    const canvasPosition = Chart.helpers.getRelativePosition(e, chart);
                    const clickTime = chart.scales.x.getValueForPixel(canvasPosition.x);
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
                        font: { family: 'Outfit' }
                    }
                },
                y_steam: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Steam (t/h)', color: COLORS.steam },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                    suggestedMax: maxSteamVal * 1.1, // 10% padding
                    suggestedMin: 0,
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
                    suggestedMax: maxPowerVal * 1.1, // 10% padding
                    suggestedMin: 0,
                    ticks: {
                        precision: 0,
                        callback: (v) => Math.round(v)
                    }
                },
                y_percent: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    suggestedMin: 0,
                    suggestedMax: 100,
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
                    title: { display: true, text: 'Combustion Temp (°C)', color: COLORS.temp1 },
                    grid: { drawOnChartArea: false },
                    suggestedMin: Math.max(0, minTempVal - tempPadding),
                    suggestedMax: maxTempVal + tempPadding, // Already applied padding in calculation
                    ticks: {
                        precision: 0,
                        callback: (v) => Math.round(v)
                    }
                },
                y_soot: {
                    type: 'linear',
                    display: false,
                    min: 0,
                    max: 1.2
                }
            },
            plugins: {
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
    generateCustomLegend(charts.main);

    document.getElementById('resetZoomBtn').onclick = () => window.zoomTime('all');
}

function handleWheel(e) {
    e.preventDefault();
    const chart = charts.main;
    const scale = chart.scales.x;
    const currentRange = scale.max - scale.min;
    const dayMs = 24 * 60 * 60 * 1000;
    const isDayView = Math.abs(currentRange - dayMs) < 100000;
    const isMonthView = currentRange > (25 * dayMs) && currentRange < (35 * dayMs);

    let newMin, newMax;

    if (isDayView) {
        const direction = Math.sign(e.deltaY);
        const currentStart = new Date(scale.min);
        currentStart.setHours(0, 0, 0, 0);
        newMin = currentStart.getTime() + (direction * dayMs);
        newMax = newMin + dayMs;
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

    if (rawData.length > 0) {
        const dataMin = rawData[0].date.getTime();
        const dataMax = rawData[rawData.length - 1].date.getTime();
        if (newMax < dataMin || newMin > dataMax) return;
    }

    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    chart.update('none');
    updateVisibleRange(chart);
}

window.zoomTime = function (hours) {
    const chart = charts.main;
    if (!chart || rawData.length === 0) return;

    chart.resetZoom('none');
    const firstDataTime = rawData[0].date.getTime();
    const lastDataTime = rawData[rawData.length - 1].date.getTime();

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
        newMin = anchorDate.getTime();
        newMax = newMin + (24 * 3600 * 1000);
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
    container.innerHTML = '';

    chart.data.datasets.forEach((dataset, index) => {
        const item = document.createElement('div');
        item.className = `legend-item ${dataset.hidden ? 'hidden' : ''}`;

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = dataset.borderColor;

        const label = document.createElement('span');
        label.textContent = dataset.label;

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
    updateDynamicScales(chart, min, max);
}

function updateDynamicScales(chart, minTime, maxTime) {
    // Filter visible data
    const visibleData = rawData.filter(d => {
        const t = d.date.getTime();
        return t >= minTime && t <= maxTime;
    });

    if (visibleData.length === 0) return;

    // Calculate max values directly from visible data
    // Use fallback to global max or default 100 if range is empty/flat
    const maxSteam = Math.max(...visibleData.map(d => d.steam));
    const maxPower = Math.max(...visibleData.map(d => d.power));

    // Calculate max for Fan Speed (IDF/RGF) to apply padding
    const maxIDF = Math.max(...visibleData.map(d => d.idf));
    const maxRGF = Math.max(...visibleData.map(d => d.rgf));
    const maxFan = Math.max(maxIDF, maxRGF, 100); // Default to at least 100 base

    // For Temp, handle potential partial data

    // For Temp, handle potential partial data
    const tempVals = visibleData.map(d => d.tempComb).filter(v => v > 0);
    const maxTemp = tempVals.length > 0 ? Math.max(...tempVals) : 0;

    // Apply 20% padding (Value * 1.2) as requested for day view comfort
    // Ensure we don't shrink below a reasonable minimum if data is flat zero
    if (chart.options.scales.y_steam) chart.options.scales.y_steam.max = Math.ceil((maxSteam > 0 ? maxSteam : 100) * 1.2);
    if (chart.options.scales.y_power) chart.options.scales.y_power.max = Math.ceil((maxPower > 0 ? maxPower : 10) * 1.2);
    if (chart.options.scales.y_percent) chart.options.scales.y_percent.max = Math.ceil(maxFan * 1.2);

    if (chart.options.scales.y_temp && maxTemp > 0) {
        // Find visible min for better scaling window
        const minTemp = Math.min(...tempVals);
        const padding = (maxTemp - minTemp) * 0.1;
        // Use Value * 1.2
        chart.options.scales.y_temp.max = maxTemp * 1.2;
    }

    chart.update('none');
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
};

