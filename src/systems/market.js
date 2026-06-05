const { EmbedBuilder } = require('discord.js');
const { MARKET_BOARD_CHANNEL_ID } = require('../config');
const { cleanAmount } = require('../utils/amounts');
const { renderTrendGraph } = require('../utils/graphs'); 

const VALID_TICKERS = ['$FLME'];

let liveDisplayMessageInstance = null;

// 🛠️ UPGRADED STATE WITH PERSISTENT TREND COUNTERS
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
        upStreak: 0,   // Tracks consecutive gains
        downStreak: 0  // Tracks consecutive losses
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

    // Cache baseline
    stock.minuteOpen = stock.price;

    let percentMovement = 0;
    let triggeredShock = false;

    // 🏎️ PERSISTENT ENGINE STEP: Check last movement direction before calculation
    if (stock.history.length > 0) {
        const lastPrice = stock.history[stock.history.length - 1];
        
        if (stock.price <= lastPrice) {
            stock.downStreak++;
            stock.upStreak = 0; // Break up trend
        } else {
            stock.upStreak++;
            stock.downStreak = 0; // Break down trend
        }
    }

    // 💥 EVALUATE STREAK TRIGGERS
    if (stock.downStreak >= 3) {
        // 🚀 3 LOSSES IN A ROW: SKYROCKET (Gain 25% to 50%)
        percentMovement = 0.25 + (Math.random() * 0.25);
        stock.downStreak = 0; // Reset counter immediately!
        triggeredShock = true;
    } else if (stock.upStreak >= 3) {
        // 📉 3 GAINS IN A ROW: MARKET CRASH (Lose 25% to 50%)
        percentMovement = -(0.25 + (Math.random() * 0.25));
        stock.upStreak = 0; // Reset counter immediately!
        triggeredShock = true;
    } else {
        // Standard normal distribution noise (Up to ±6% variation)
        percentMovement = (Math.random() * 0.06) * stock.modifier * (Math.random() > 0.5 ? 1 : -1);
    }

    // Calculate absolute target value
    let targetPrice = stock.price * (1 + percentMovement);

    // 🛡️ HARD LIMIT CEILINGS & FLOORS ($10.00 to $4,000.00)
    if (targetPrice < 10) {
        targetPrice = 10;
        stock.downStreak = 0; // Halt streak at floor
    } else if (targetPrice > 4000) {
        targetPrice = 4000;
        stock.upStreak = 0; // Halt streak at ceiling
    }

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
    // Immediate initial lifecycle invocation offset
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
