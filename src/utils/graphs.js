/**
 * Renders a high-resolution text-based trend graph matrix.
 * @param {number[]} history - Array of historical price data points.
 * @param {number} maxPoints - Maximum number of recent points to plot (Default: 15).
 * @param {number} rowsCount - Vertical resolution of the graph (Default: 6).
 * @returns {string} Fully formatted ASCII chart string.
 */
function renderTrendGraph(history, maxPoints = 15, rowsCount = 6) {
    const dataPoints = history.slice(-maxPoints); 
    if (dataPoints.length === 0) return 'Processing Market Timeline...';

    const maxVal = Math.max(...dataPoints);
    const minVal = Math.min(...dataPoints);
    const spread = maxVal - minVal;
    const colsCount = dataPoints.length;

    // Initialize blank grid matrix with clean padding
    let grid = Array(rowsCount)
        .fill(null)
        .map(() => Array(colsCount).fill(' . '));

    // Plot data points into the grid matrix
    dataPoints.forEach((value, index) => {
        let row;
        if (spread === 0) {
            // Center line if price has zero movement
            row = Math.floor(rowsCount / 2);
        } else {
            // Convert price value to a ratio between 0.0 and 1.0
            const ratio = (value - minVal) / spread;
            // Map ratio to row index (highest price -> row 0, lowest price -> last row)
            row = (rowsCount - 1) - Math.floor(ratio * (rowsCount - 1));
        }
        
        // Final safety bounds clamping to prevent indexing crashes
        row = Math.max(0, Math.min(rowsCount - 1, row));
        grid[row][index] = ' o '; 
    });

    // Compile grid rows into final text output with vertical axis labeling
    let textOutput = '';
    for (let r = 0; r < rowsCount; r++) {
        let labelPrice;
        if (spread === 0) {
            labelPrice = maxVal;
        } else {
            labelPrice = maxVal - ((r / (rowsCount - 1)) * spread);
        }
        textOutput += `$${labelPrice.toFixed(1).padEnd(6)} │${grid[r].join('')}\n`;
    }

    // Append horizontal timeline axis labels
    textOutput += `${' '.padEnd(7)}└───${'───'.repeat(colsCount)}\n`;
    textOutput += `${' '.padEnd(9)}20m ago ─────────────────────► Live\n`;

    return textOutput;
}

module.exports = { renderTrendGraph };
