const { EmbedBuilder } = require('discord.js');
const { MARKET_BOARD_CHANNEL_ID } = require('../config');
const { cleanAmount } = require('../utils/amounts');

const VALID_TICKERS = ['$FLME'];

let liveDisplayMessageInstance = null;

const marketTickersState = {
    '$FLME': {
        price: 100,
        modifier: 1,
        history: [
            100, 99, 101, 102, 98,
            103, 104, 102, 105, 107,
            106, 108, 107, 109, 110,
            108, 111, 109, 112, 110
        ],
        minuteOpen: 100
    }
};

function renderTrendGraph(history) {
    const dataPoints = history.slice(-15); 
    if (dataPoints.length === 0) return 'Processing Market Timeline...';

    const maxVal = Math.max(...dataPoints);
    const minVal = Math.min(...dataPoints);
    const spread = maxVal - minVal || 1;

    const rowsCount = 6; 
    const colsCount = dataPoints.length;

    let grid = Array(rowsCount)
        .fill(null)
        .map(() => Array(colsCount).fill(' . '));

    dataPoints.forEach((value, index) => {
        const row = Math.min(
            rowsCount - 1,
            Math.floor(((maxVal - value) / spread) * (rowsCount - 1))
        );
        grid[row][index] = ' o '; 
    });

    let textOutput = '';
    for (let r = 0; r < rowsCount; r++) {
        const labelPrice = maxVal - ((r / (rowsCount - 1)) * spread);
        textOutput += `$${labelPrice.toFixed(1).padEnd(6)} │${grid[r].join('')}\n`;
    }

    textOutput += `${' '.padEnd(7)}└───${'───'.repeat(colsCount)}\n`;
    textOutput += `${' '.padEnd(9)}20m ago ─────────────────────► Live\n`;

    return textOutput;
}

async function renderMarketBoardEmbed() {
    const stock = marketTickersState['$FLME'];

    return new EmbedBuilder()
        .setColor(stock.price >= stock.minuteOpen ? '#00FF00' : '#FF0000')
        .setTitle('📈 FlameBot Exchange')
        .setDescription(
            `**$FLME**\n` +
            `💰 Price: **$${stock.price.toFixed(2)}**\n` +
            `⚙️ Modifier: **${stock.modifier.toFixed(2)}x**`
        )
        .addFields({
            name: '📊 High-Resolution Performance Matrix',
            value: `\`\`\`\n${renderTrendGraph(stock.history)}\n\`\`\``
        })
        .setFooter({
            text: '!market | !portfolio | !buyshares | !sellshares'
        })
        .setTimestamp();
}

async function updateMarketBoard(client) {
    const stock = marketTickersState['$FLME'];

    const movement =
        (Math.random() * 5) *
        stock.modifier *
        (Math.random() > 0.5 ? 1 : -1);

    stock.price = Math.max(
        1,
        parseFloat((stock.price + movement).toFixed(2))
    );

    stock.history.push(stock.price);

    if (stock.history.length > 25) {
        stock.history.shift();
    }

    if (!MARKET_BOARD_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(MARKET_BOARD_CHANNEL_ID);
        if (!channel) return;

        const embed = await renderMarketBoardEmbed();

        if (!liveDisplayMessageInstance) {
            const recentMessages = await channel.messages.fetch({ limit: 15 });
            const oldBoardMessage = recentMessages.find(m => m.author.id === client.user.id && m.embeds.length > 0);

            if (oldBoardMessage) {
                liveDisplayMessageInstance = oldBoardMessage;
                await liveDisplayMessageInstance.edit({ embeds: [embed] });
            } else {
                liveDisplayMessageInstance = await channel.send({ embeds: [embed] });
            }
        } else {
            await liveDisplayMessageInstance.edit({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Market board loop error:', err);
    }
}

// ─── ⚡ NEW MARKET MANIPULATION PUMP ENGINE ───
async function pumpMarketOnChat(client) {
    const stock = marketTickersState['$FLME'];
    
    // Add a solid, positive jump between $0.50 and $2.50 per chat message
    const pumpAmount = parseFloat((Math.random() * 2.0 + 0.50).toFixed(2));
    stock.price = parseFloat((stock.price + pumpAmount).toFixed(2));
    
    // Smooth out the history plot data line
    if (stock.history.length > 0) {
        stock.history[stock.history.length - 1] = stock.price;
    }

    // Refresh the live text graph board embed instantly
    if (!MARKET_BOARD_CHANNEL_ID) return;
    try {
        const channel = await client.channels.fetch(MARKET_BOARD_CHANNEL_ID);
        if (!channel) return;
        
        const embed = await renderMarketBoardEmbed();
        if (liveDisplayMessageInstance) {
            await liveDisplayMessageInstance.edit({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Pump refresh error:', err);
    }
}

function startMarketLoop(client) {
    setTimeout(() => {
        updateMarketBoard(client);
    }, 5000);

    setInterval(() => {
        updateMarketBoard(client);
    }, 60000);
}

async function handleMarket(message, args, command, userData) {
    if (command === '!market' || command === '!stock') {
        const embed = await renderMarketBoardEmbed();
        await message.channel.send({ embeds: [embed] });
        return true;
    }

    if (command === '!portfolio') {
        // Fallback optimization if portfolio Map doesn't exist
        if (!userData.portfolios || typeof userData.portfolios.get !== 'function') {
            userData.portfolios = new Map();
        }

        const dbKey = 'FLME';
        const shares = userData.portfolios?.get(dbKey) || 0;
        const value = shares * marketTickersState['$FLME'].price;

        await message.reply(
            `📁 Portfolio\n` +
            `Shares: **${shares}**\n` +
            `Value: 🪙 **${Math.floor(value)}**`
        );
        return true;
    }

    if (command === '!buyshares') {
        const ticker = args[1]?.toUpperCase();
        const amount = cleanAmount(args[2]);

        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            await message.reply('❌ Usage: !buyshares $FLME <amount>');
            return true;
        }

        const price = marketTickersState[ticker].price;
        const cost = Math.ceil(price * amount);

        if (userData.coins < cost) {
            await message.reply(`❌ Need 🪙 ${cost}`);
            return true;
        }

        if (!userData.portfolios || typeof userData.portfolios.get !== 'function') {
            userData.portfolios = new Map();
        }

        const dbKey = ticker.replace('$', '');
        const current = userData.portfolios.get(dbKey) || 0;
        
        userData.coins -= cost;
        userData.portfolios.set(dbKey, current + amount);
        await userData.save();

        await message.reply(`✅ Bought ${amount} ${ticker} shares for 🪙 ${cost}`);
        return true;
    }

    if (command === '!sellshares') {
        const ticker = args[1]?.toUpperCase();
        const amount = cleanAmount(args[2]);

        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            await message.reply('❌ Usage: !sellshares $FLME <amount>');
            return true;
        }

        if (!userData.portfolios || typeof userData.portfolios.get !== 'function') {
            userData.portfolios = new Map();
        }

        const dbKey = ticker.replace('$', '');
        const current = userData.portfolios.get(dbKey) || 0;
        if (current < amount) {
            await message.reply('❌ Not enough shares.');
            return true;
        }

        const payout = Math.floor(marketTickersState[ticker].price * amount);
        userData.coins += payout;
        userData.portfolios.set(dbKey, current - amount);
        await userData.save();

        await message.reply(`✅ Sold ${amount} ${ticker} for 🪙 ${payout}`);
        return true;
    }

    return false;
}

module.exports = {
    handleMarket,
    startMarketLoop,
    pumpMarketOnChat,
    marketTickersState
};
// the secret factor is that everytime flame messages in chat the stock goes up \\
