
// Verification Helper
window.verifyData = function (dateStr) {
    // dateStr format: 'YYYY-MM-DD' e.g. '2026-02-09'
    const parts = dateStr.split('-');
    const target = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    target.setHours(0, 0, 0, 0);

    // Logic matches updateKPIs: > start && <= end
    const start = target.getTime();
    const end = start + (24 * 60 * 60 * 1000); // Next day 00:00

    console.log(`Verifying Data for ${dateStr}`);
    console.log(`Range: > ${new Date(start).toLocaleString()} AND <= ${new Date(end).toLocaleString()}`);

    const points = AppState.rawData.filter(d => {
        const t = d.date.getTime();
        return t > start && t <= end;
    });

    console.log(`Found ${points.length} points.`);
    if (points.length > 0) {
        // Steam
        const sumSteam = points.reduce((acc, d) => acc + d.steam, 0);
        const avgSteam = sumSteam / points.length;
        console.log(`Average Steam: ${avgSteam.toFixed(2)}`);

        // Power
        const sumPower = points.reduce((acc, d) => acc + d.power, 0);
        const avgPower = sumPower / points.length;
        console.log(`Average Power: ${avgPower.toFixed(2)}`);

        console.log('--- First 3 Points ---');
        points.slice(0, 3).forEach(p => console.log(`${p.date.toLocaleString()} : Steam ${p.steam}`));
        console.log('--- Last 3 Points ---');
        points.slice(-3).forEach(p => console.log(`${p.date.toLocaleString()} : Steam ${p.steam}`));
    } else {
        console.log('No data found for this date.');
    }
};
