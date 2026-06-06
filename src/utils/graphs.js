let useChartjs = true;
const {CategoryScale, Chart, LinearScale, LineController, LineElement, PointElement} = require('chart.js');
const {Canvas} = require('skia-canvas');
const { AttachmentBuilder } = require('discord.js');

async function renderChartImage(history, maxPoints = 15) {
    Chart.register([
      CategoryScale,
      LineController,
      LineElement,
      LinearScale,
      PointElement
    ]);
    const data = history.slice(-maxPoints);
    let lineColor = [];
    for (let i = 1; i < data.length; ++i) {
        if (data[i] > data[i-1]) lineColor.push('green');
        else lineColor.push('red');
    }
    let i = 0;

    const canvas = new Canvas(800, 600);
    const chart = new Chart(
      canvas,
      {
        type: 'line',
        data: {
          labels: ['15 mins ago','','','','','10 mins ago','','','','','5 mins ago','','','','Now'],
          datasets: [{
            label: 'Price of $FLME\n Current Price: '+data[data.length-1],
            data: data,
            borderColor: 'red',
            segment: {
                borderColor: ctx => lineColor[i++],
            },
            pointBackgroundColor: 'rgb(255,255,255,0.1)',
            pointRadius: 0,
            borderWidth: 6
          }]
        }
      }
    );
    const pngBuffer = await canvas.toBuffer('png');
    const attachment = new AttachmentBuilder(pngBuffer, {
      name: 'image.png',
    });
    chart.destroy();
    return pngBuffer;
}

async function renderTrendGraph(history, maxPoints = 15, rowsCount = 6) {
    if (useChartjs) return await renderChartImage(history);
	
    const dataPoints = history.slice(-maxPoints); 
    if (dataPoints.length === 0) return 'Processing Market Timeline...';

    const maxVal = Math.max(...dataPoints);
    const minVal = Math.min(...dataPoints);
    const spread = maxVal - minVal;
    const colsCount = dataPoints.length;

    let grid = Array(rowsCount)
        .fill(null)
        .map(() => Array(colsCount).fill(' . '));

    dataPoints.forEach((value, index) => {
        let row;
        if (spread === 0) {
            row = Math.floor(rowsCount / 2);
        } else {
            const ratio = (value - minVal) / spread;
            row = (rowsCount - 1) - Math.floor(ratio * (rowsCount - 1));
        }
        
        row = Math.max(0, Math.min(rowsCount - 1, row));
        grid[row][index] = ' o '; 
    });

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

    textOutput += `${' '.padEnd(7)}└───${'───'.repeat(colsCount)}\n`;
    textOutput += `${' '.padEnd(9)}20m ago ─────────────────────► Live\n`;

    return textOutput;
}

module.exports = { renderTrendGraph };
