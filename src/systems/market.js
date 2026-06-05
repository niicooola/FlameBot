const { EmbedBuilder } = require('discord.js');
const { MARKET_BOARD_CHANNEL_ID } = require('../config');
const { cleanAmount } = require('../utils/amounts');
const { renderTrendGraph } = require('../utils/graphs');

const VALID_TICKERS = ['$FLME'];

let liveDisplayMessageInstance = null;

const marketTickersState = {
    '$FLME': {
        price: 100,
        modifier: 1,
        history: Array(20).fill(100),
        minuteOpen: 100
    }
};

async function renderMarketBoardEmbed() {
    const stock = marketTickersState['$FLME'];

    return new EmbedBuilder()
        .setColor(stock.price >= stock.minuteOpen ? '#00FF00' : '#FF0000')
        .setTitle('📈 FlameBot Exchange')
        .setDescription(
            `**$FLME**\n` +
            `💰 Price: **$${stock.price.toFixed(2)}**\n` +
            `⚙️ Stability Mode: **ON**`
        )
        .addFields({
            name: '📊 Stable Performance Matrix',
            value: `\`\`\`\n${renderTrendGraph(stock.history)}\n\`\`\``
        })
        .setFooter({
            text: '!market | !portfolio | !buyshares | !sellshares'
        })
        .setTimestamp();
}

async function updateMarketBoard(client) {
    const stock = marketTickersState['$FLME'];

    stock.minuteOpen = stock.price;

    const targetValue = 100;

    // Pulls the price back toward $100 every update
    const correction = (targetValue - stock.price) * 0.10;

    // Small random movement so it does not look frozen
    const randomNoise = (Math.random() - 0.5) * 4;

    let targetPrice = stock.price + correction + randomNoise;

    // Stable safety range
    if (targetPrice < 90) targetPrice = 90;
    if (targetPrice > 110) targetPrice = 110;

    stock.price = parseFloat(targetPrice.toFixed(2));
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
            const oldBoardMessage = recentMessages.find(
                m => m.author.id === client.user.id && m.embeds.length > 0
            );

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
        if (!userData.portfolios || typeof userData.portfolios.get !== 'function') {
            userData.portfolios = new Map();
        }

        const dbKey = 'FLME';
        const shares = userData.portfolios.get(dbKey) || 0;
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
            await message.reply('❌ Usage: `!buyshares $FLME <amount>`');
            return true;
        }

        const price = marketTickersState[ticker].price;
        const cost = Math.ceil(price * amount);

        if (userData.coins < cost) {
            await message.reply(`❌ Need 🪙 **${cost}**`);
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

        await message.reply(`✅ Bought **${amount} ${ticker}** shares for 🪙 **${cost}**`);
        return true;
    }

    if (command === '!sellshares') {
        const ticker = args[1]?.toUpperCase();
        const amount = cleanAmount(args[2]);

        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            await message.reply('❌ Usage: `!sellshares $FLME <amount>`');
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

        await message.reply(`✅ Sold **${amount} ${ticker}** for 🪙 **${payout}**`);
        return true;
    }

    return false;
}

module.exports = {
    handleMarket,
    startMarketLoop,
    marketTickersState
};
