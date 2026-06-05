const { EmbedBuilder } = require('discord.js');
const { MARKET_BOARD_CHANNEL_ID } = require('../config');
const { cleanAmount } = require('../utils/amounts');
const { renderTrendGraph } = require('../utils/graphs'); 

const VALID_TICKERS = ['$FLME'];

let liveDisplayMessageInstance = null;

// 🛠️ PERSISTENT ENGINE STATE CONTROLLER WITH TREND STREAK TRACKERS
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
        minuteOpen: 100,
        upStreak: 0,   // Tracks consecutive interval gains
        downStreak: 0  // Tracks consecutive interval losses
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

    // Cache the previous interval price as the open baseline before doing calculations
    stock.minuteOpen = stock.price;

    let percentMovement = 0;
    const historyLen = stock.history.length;

    // 🏎️ TREND ANALYSIS LOGIC STEP: Compare past actual closes inside the array
    if (historyLen >= 2) {
        const standardLast = stock.history[historyLen - 1];
        const standardPrev = stock.history[historyLen - 2];

        if (standardLast < standardPrev) {
            stock.downStreak++;
            stock.upStreak = 0; // Break consecutive gains
        } else if (standardLast > standardPrev) {
            stock.upStreak++;
            stock.downStreak = 0; // Break consecutive losses
        } else {
            // Flatline edge case: clear streaks to prevent stuck states
            stock.upStreak = 0;
            stock.downStreak = 0;
        }
    }

    // 💥 HIGH-VOLATILITY DEGENERACY ENGINE (TRIGGERS AT 2 STEPS)
    if (stock.downStreak >= 2) {
        // 🚀 2 LOSSES IN A ROW: PARABOLIC SHORT SQUEEZE PUMP (Gain 100% to 300% value)
        percentMovement = 1.0 + (Math.random() * 2.0);
        stock.downStreak = 0; // Flash reset streak counter
    } else if (stock.upStreak >= 2) {
        // 📉 2 GAINS IN A ROW: MASSIVE LIQUIDATION MARKET CRASH (Lose 70% to 90% value)
        percentMovement = -(0.70 + (Math.random() * 0.20));
        stock.upStreak = 0; // Flash reset streak counter
    } else {
        // Unhinged flat-market background noise (Up to ±20% wild swings per minute)
        percentMovement = (Math.random() * 0.20) * stock.modifier * (Math.random() > 0.5 ? 1 : -1);
    }

    // Apply compounding percentage movement calculation
    let targetPrice = stock.price * (1 + percentMovement);

    // 🛡️ ECONOMIC LIMIT CEILINGS & FLOORS ($10.00 to $4,000.00)
    if (targetPrice < 10) {
        targetPrice = 10;
    } else if (targetPrice > 4000) {
        targetPrice = 4000;
    }

    // Format new price state and append to active ledger array
    stock.price = parseFloat(targetPrice.toFixed(2));
    stock.history.push(stock.price);

    // Maintain historical buffer array capacity limits
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

function startMarketLoop(client) {
    // Initial delayed boot trigger loop
    setTimeout(() => {
        updateMarketBoard(client);
    }, 5000);

    // Persistent 60-second execution interval ticker
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
    marketTickersState
};
