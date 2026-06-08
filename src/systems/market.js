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
    const attachment = await renderTrendGraph(stock.history);
	
    return {content: '```Current price of $FLME: $'+stock.price+'```', files: [attachment] };
}

async function updateMarketBoard(client) {
    const stock = marketTickersState['$FLME'];

    stock.minuteOpen = stock.price;

    const targetValue = 100;

    const correction = (targetValue - stock.price) * 0.10;

    const randomNoise = (Math.random() - 0.5) * 8;

    let targetPrice = stock.price + correction + randomNoise;

    if (targetPrice < 80) targetPrice = 80;
    if (targetPrice > 120) targetPrice = 120;

    stock.price = parseFloat(targetPrice.toFixed(2));
    stock.history.push(stock.price);

    if (stock.history.length > 25) {
        stock.history.shift();
    }

    if (!MARKET_BOARD_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(MARKET_BOARD_CHANNEL_ID);
        if (!channel) return;

        const graph = await renderMarketBoardEmbed();

        if (!liveDisplayMessageInstance) {
            const recentMessages = await channel.messages.fetch({ limit: 15 });
            const oldBoardMessage = recentMessages.find(m => m.author.id === client.user.id && m.attachments.size > 0);

            if (oldBoardMessage) {
                liveDisplayMessageInstance = oldBoardMessage;
                await liveDisplayMessageInstance.edit(graph);
            } else {
                liveDisplayMessageInstance = await channel.send(graph);
            }
        } else {
            await liveDisplayMessageInstance.edit(graph);
        }
    } catch (err) {
        console.error('Market board loop error:', err);
    }
}

function startMarketLoop(client) {
    for (let i = 0; i < 15; ++i) {
		const stock = marketTickersState['$FLME'];

		stock.minuteOpen = stock.price;

		const targetValue = 100;

		const correction = (targetValue - stock.price) * 0.10;

		const randomNoise = (Math.random() * 2 + 3) * (Math.random() < 0.5 ? -1 : 1);

		let targetPrice = stock.price + correction + randomNoise;

		if (targetPrice < 80) targetPrice = 80;
		if (targetPrice > 120) targetPrice = 120;

		stock.price = parseFloat(targetPrice.toFixed(2));
		stock.history.push(stock.price);

		if (stock.history.length > 25) {
			stock.history.shift();
		}
	}
	
	setTimeout(() => {
        updateMarketBoard(client);
    }, 5000);

    setInterval(() => {
        updateMarketBoard(client);
    }, 60000);
}

async function handleMarket(message, args, command, userData) {
    if (command === '!market' || command === '!stock') {
        const graph = await renderMarketBoardEmbed();
        await message.channel.send(graph);
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
        let amount = cleanAmount(args[2]);
		if (['max', 'all'].includes(args[2]?.toLowerCase()?.trim()) && VALID_TICKERS.includes(ticker)) 
			amount = Math.floor(userData.coins/marketTickersState[ticker].price);
		
        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            await message.reply('❌ Usage: `!buyshares $FLME <amount/max/all>`');
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
        let amount = cleanAmount(args[2]);
		if (['max', 'all'].includes(args[2]?.toLowerCase()?.trim()) && VALID_TICKERS.includes(ticker)) 
			amount = userData.portfolios.get(ticker.replace('$',''));

        if (!VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            await message.reply('❌ Usage: `!sellshares $FLME <amount/max/all>`');
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
