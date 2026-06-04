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
    const dataPoints = history.slice(-20);
    if (dataPoints.length === 0) return 'Processing Market Timeline...';

    const maxVal = Math.max(...dataPoints);
    const minVal = Math.min(...dataPoints);
    const spread = maxVal - minVal || 1;

    const rowsCount = 10;
    const colsCount = dataPoints.length;

    // Initialize with empty spacing instead of old block dot arrays
    let grid = Array(rowsCount)
        .fill(null)
        .map(() => Array(colsCount).fill('   '));

    dataPoints.forEach((value, index) => {
        // Find the scaled row position for the current price point
        const currentScaledRow = Math.min(
            rowsCount - 1,
            Math.floor(((maxVal - value) / spread) * (rowsCount - 1))
        );

        if (index === 0) {
            // First point always drops a flat line vector
            grid[currentScaledRow][index] = ' ─ ';
        } else {
            const previousValue = dataPoints[index - 1];
            const previousScaledRow = Math.min(
                rowsCount - 1,
                Math.floor(((maxVal - previousValue) / spread) * (rowsCount - 1))
            );

            // Determine line vector angles based on market direction
            if (currentScaledRow < previousScaledRow) {
                // Price pumped up (row index decreased)
                grid[currentScaledRow][index] = ' ╱ ';
            } else if (currentScaledRow > previousScaledRow) {
                // Price dropped down (row index increased)
                grid[currentScaledRow][index] = ' ╲ ';
            } else {
                // Price stayed perfectly consistent
                grid[currentScaledRow][index] = ' ─ ';
            }
        }
    });

    // Maps rows out cleanly and joins lines down the timeline axis
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
            name: '📊 Trend',
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

    if (!MARKET_BOARD_CHANNEL_ID) {
        return;
    }

    try {
        const channel =
            await client.channels.fetch(MARKET_BOARD_CHANNEL_ID);

        if (!channel) return;

        const embed = await renderMarketBoardEmbed();

        if (!liveDisplayMessageInstance) {
            liveDisplayMessageInstance =
                await channel.send({
                    embeds: [embed]
                });
        } else {
            await liveDisplayMessageInstance.edit({
                embeds: [embed]
            });
        }
    } catch (err) {
        console.error('Market board error:', err);
    }
}

function startMarketLoop(client) {
    updateMarketBoard(client);

    setInterval(() => {
        updateMarketBoard(client);
    }, 60000);
}

async function handleMarket(
    message,
    args,
    command,
    userData
) {
    if (command === '!market' || command === '!stock') {
        const embed = await renderMarketBoardEmbed();

        await message.channel.send({
            embeds: [embed]
        });

        return true;
    }

    if (command === '!portfolio') {
        const shares =
            userData.portfolios?.get('$FLME') || 0;

        const value =
            shares *
            marketTickersState['$FLME'].price;

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

        if (
            !VALID_TICKERS.includes(ticker) ||
            !amount ||
            amount <= 0
        ) {
            await message.reply(
                '❌ Usage: !buyshares $FLME <amount>'
            );
            return true;
        }

        const price =
            marketTickersState[ticker].price;

        const cost = Math.ceil(price * amount);

        if (userData.coins < cost) {
            await message.reply(
                `❌ Need 🪙 ${cost}`
            );
            return true;
        }

        const current =
            userData.portfolios.get(ticker) || 0;

        userData.coins -= cost;
        userData.portfolios.set(
            ticker,
            current + amount
        );

        await userData.save();

        await message.reply(
            `✅ Bought ${amount} ${ticker} shares for 🪙 ${cost}`
        );

        return true;
    }

    if (command === '!sellshares') {
        const ticker = args[1]?.toUpperCase();
        const amount = cleanAmount(args[2]);

        if (
            !VALID_TICKERS.includes(ticker) ||
            !amount ||
            amount <= 0
        ) {
            await message.reply(
                '❌ Usage: !sellshares $FLME <amount>'
            );
            return true;
        }

        const current =
            userData.portfolios.get(ticker) || 0;

        if (current < amount) {
            await message.reply(
                '❌ Not enough shares.'
            );
            return true;
        }

        const payout = Math.floor(
            marketTickersState[ticker].price *
                amount
        );

        userData.coins += payout;

        userData.portfolios.set(
            ticker,
            current - amount
        );

        await userData.save();

        await message.reply(
            `✅ Sold ${amount} ${ticker} for 🪙 ${payout}`
        );

        return true;
    }

    return false;
}

module.exports = {
    handleMarket,
    startMarketLoop
};
