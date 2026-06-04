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

// Generates an unbreakable, single fluid line graph with continuous step connectors
function renderTrendGraph(history) {
    const dataPoints = history.slice(-20); // Maintain 20-interval scale
    if (dataPoints.length === 0) return 'Processing Market Timeline...';

    const maxVal = Math.max(...dataPoints);
    const minVal = Math.min(...dataPoints);
    const spread = maxVal - minVal || 1;

    const rowsCount = 6; // Perfect height for text line scaling
    const colsCount = dataPoints.length;

    // Create a blank grid using empty space tracking matrix elements
    let grid = Array(rowsCount)
        .fill(null)
        .map(() => Array(colsCount).fill('   '));

    let mappedRows = dataPoints.map(value => 
        Math.min(rowsCount - 1, Math.floor(((maxVal - value) / spread) * (rowsCount - 1)))
    );

    for (let i = 0; i < colsCount; i++) {
        const currRow = mappedRows[i];
        
        if (i === 0) {
            grid[currRow][i] = '───';
        } else {
            const prevRow = mappedRows[i - 1];
            
            if (currRow === prevRow) {
                // Price stayed flat, draw flat continuous connection segment
                grid[currRow][i] = '───';
            } else if (currRow < prevRow) {
                // Price increased (moves UP to lower matrix indexes)
                grid[prevRow][i] = '──┐';
                grid[currRow][i] = '┌──';
                // Fill in the vertical space gap seamlessly if it skips multiple rows
                for (let r = currRow + 1; r < prevRow; r++) {
                    grid[r][i] = '  │';
                }
            } else {
                // Price decreased (moves DOWN to higher matrix indexes)
                grid[prevRow][i] = '──┘';
                grid[currRow][i] = '└──';
                // Fill in the vertical space gap seamlessly if it drops multiple rows
                for (let r = prevRow + 1; r < currRow; r++) {
                    grid[r][i] = '  │';
                }
            }
        }
    }

    // Join the vector elements seamlessly down the grid lines
    return grid.map(r => r.join('')).join('\n');
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
            name: '📊 20-Min Trend Line',
            value:
                '```' +
                '\n' +
                renderTrendGraph(stock.history) +
                '\n```'
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

        // PERSISTENT 1-MESSAGE CACHE RECOVERY LOGIC
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
        const shares = userData.portfolios?.get('$FLME') || 0;
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

        const current = userData.portfolios.get(ticker) || 0;
        userData.coins -= cost;
        userData.portfolios.set(ticker, current + amount);
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

        const current = userData.portfolios.get(ticker) || 0;
        if (current < amount) {
            await message.reply('❌ Not enough shares.');
            return true;
        }

        const payout = Math.floor(marketTickersState[ticker].price * amount);
        userData.coins += payout;
        userData.portfolios.set(ticker, current - amount);
        await userData.save();

        await message.reply(`✅ Sold ${amount} ${ticker} for 🪙 ${payout}`);
        return true;
    }

    return false;
}

module.exports = {
    handleMarket,
    startMarketLoop
};
