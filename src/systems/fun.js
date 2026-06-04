const { EmbedBuilder } = require('discord.js');
const { MARKET_BOARD_CHANNEL_ID } = require('../config');
const { cleanAmount } = require('../utils/amounts');

const VALID_TICKERS = ['$FLME'];
let liveDisplayMessageInstance = null;

let marketTickersState = {
    '$FLME': {
        price: 100.0,
        modifier: 1.0,
        history: [100, 98.5, 101.2, 103, 99.1, 102.4, 101, 103.5, 102.1, 104, 102.5, 101.8, 103.2, 105, 103.9, 106.2, 104.8, 105.5, 104.2, 107],
        minuteOpen: 100.0
    }
};

function renderTrendGraph(history) {
    const dataPoints = [...history].slice(-20);
    const maxVal = Math.max(...dataPoints);
    const minVal = Math.min(...dataPoints);
    const spread = maxVal - minVal === 0 ? 1 : maxVal - minVal;

    let gridMatrix = Array(15).fill(null).map(() => Array(20).fill(' │ '));

    for (let c = 0; c < dataPoints.length; c++) {
        const row = Math.min(14, Math.floor(((maxVal - dataPoints[c]) / spread) * 14));
        gridMatrix[row][c] = c > 0 && dataPoints[c] < dataPoints[c - 1] ? ' 🟥 ' : ' 🟩 ';
    }

    let out = '';

    for (let r = 0; r < 15; r++) {
        out += `$${(maxVal - (r / 14 * spread)).toFixed(2).padEnd(6)} 📈${gridMatrix[r].join('')}\n`;
    }

    return out + `${' '.padEnd(8)} ╚${'════'.repeat(20)}\n`;
}

async function renderMarketBoardEmbed() {
    const flme = marketTickersState['$FLME'];

    return new EmbedBuilder()
        .setColor(flme.price >= flme.minuteOpen ? '#00FF00' : '#FF0000')
        .setTitle('📈 Live Asset Exchange ($FLME)')
        .setDescription(`💰 **Price:** $${flme.price.toFixed(2)} | ⚙️ **Modifier:** ${flme.modifier}x`)
        .addFields({
            name: '📊 Matrix',
            value: `\`\`\`py\n${renderTrendGraph(flme.history)}\n\`\`\``
        })
        .setFooter({ text: 'Commands: !stock | !portfolio | !buyshares $FLME <amount> | !sellshares $FLME <amount>' })
        .setTimestamp();
}

async function updateMarketBoard(client) {
    const flme = marketTickersState['$FLME'];

    flme.price = Math.max(
        1,
        parseFloat((flme.price + ((Math.random() * 4.9 + 0.1) * flme.modifier * (Math.random() > 0.48 ? 1 : -1))).toFixed(2))
    );

    flme.history.push(flme.price);
    if (flme.history.length > 25) flme.history.shift();

    if (!MARKET_BOARD_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(MARKET_BOARD_CHANNEL_ID);
        const embed = await renderMarketBoardEmbed();

        if (!liveDisplayMessageInstance) {
            liveDisplayMessageInstance = await channel.send({ embeds: [embed] });
        } else {
            await liveDisplayMessageInstance.edit({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Market update failed:', err.message);
    }
}

function startMarketLoop(client) {
    updateMarketBoard(client);
    setInterval(() => updateMarketBoard(client), 60000);
}

async function handleMarket(message, args, command, userData) {
    if (command === '!market' || command === '!stock') {
        const embed = await renderMarketBoardEmbed();
        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!portfolio') {
        const shares = userData.portfolios?.get('$FLME') || 0;
        const price = marketTickersState['$FLME'].price;
        const value = Math.floor(shares * price);

        return message.reply(`📁 **Portfolio**\n$FLME Shares: **${shares}**\nValue: 🪙 **${value} coins**`);
    }

    if (command === '!buyshares') {
        const ticker = args[1]?.toUpperCase();
        const amount = cleanAmount(args[2]);

        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            return message.reply('❌ Usage: `!buyshares $FLME <amount>`');
        }

        const cost = Math.ceil(marketTickersState[ticker].price * amount);

        if (userData.coins < cost) {
            return message.reply(`❌ Not enough coins. Cost: 🪙 **${cost}**`);
        }

        const current = userData.portfolios.get(ticker) || 0;

        userData.coins -= cost;
        userData.portfolios.set(ticker, current + amount);
        await userData.save();

        return message.reply(`✅ Bought **${amount} ${ticker}** for 🪙 **${cost} coins**.`);
    }

    if (command === '!sellshares') {
        const ticker = args[1]?.toUpperCase();
        const amount = cleanAmount(args[2]);

        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            return message.reply('❌ Usage: `!sellshares $FLME <amount>`');
        }

        const current = userData.portfolios.get(ticker) || 0;

        if (current < amount) return message.reply('❌ You do not own enough shares.');

        const payout = Math.floor(marketTickersState[ticker].price * amount);

        userData.coins += payout;
        userData.portfolios.set(ticker, current - amount);
        await userData.save();

        return message.reply(`✅ Sold **${amount} ${ticker}** for 🪙 **${payout} coins**.`);
    }

    return false;
}

module.exports = { handleMarket, startMarketLoop };
