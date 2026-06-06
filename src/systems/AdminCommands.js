const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { marketTickersState } = require('./market');
const { cleanAmount } = require('../utils/amounts');

const ALLOWED_ADMINS = ['379092432614064128']; 
const VALID_TICKERS = ['$FLME'];

function isAdmin(message) {
    if (ALLOWED_ADMINS.includes(message.author.id)) return true;
    return message.member.permissions.has('Administrator');
}

async function handleAdminCommands(message, args, command, userData) {
    const adminTriggers = ['!givecoins', '`!takecoins`', '!resetcooldown', '!setstock', '!givestock'];
    if (!adminTriggers.includes(command)) return false;

    if (!isAdmin(message)) {
        return message.reply('❌ You do not have permission to run administration commands, bro.');
    }

    const target = message.mentions.members.first();

    if (command === '!givecoins') {
        if (!target) return message.reply('❌ Usage: `!givecoins @user <amount>`');
        const amount = cleanAmount(args[2]);
        if (!amount || amount <= 0) return message.reply('❌ Specify a valid positive coin value.');

        try {
            const targetData = await User.findOne({ id: target.id }) || await User.create({ id: target.id });
            targetData.coins += amount;
            await targetData.save();
            return message.reply(`✅ Successfully minted 🪙 **${amount}** coins and deposited them into <@${target.id}>'s asset balance.`);
        } catch (err) {
            console.error(err);
            return message.reply('❌ Failed to update user database profile.');
        }
    }

    if (command === '!takecoins') {
        if (!target) return message.reply('❌ Usage: `!takecoins @user <amount>`');
        const amount = cleanAmount(args[2]);
        if (!amount || amount <= 0) return message.reply('❌ Specify a valid positive coin value.');

        try {
            const targetData = await User.findOne({ id: target.id }) || await User.create({ id: target.id });
            targetData.coins = Math.max(0, targetData.coins - amount);
            await targetData.save();
            return message.reply(`📉 Successfully removed 🪙 **${amount}** coins from <@${target.id}>'s asset balance.`);
        } catch (err) {
            console.error(err);
            return message.reply('❌ Failed to update user database profile.');
        }
    }

    if (command === '!resetcooldown') {
        if (!target) return message.reply('❌ Usage: `!resetcooldown @user`');
        try {
            const targetData = await User.findOne({ id: target.id }) || await User.create({ id: target.id });
            targetData.lastRobbed = null;
            targetData.lastDaily = null; 
            await targetData.save();
            return message.reply(`⚡ All transaction and robbery cooldown parameters have been cleared for <@${target.id}>, bro.`);
        } catch (err) {
            console.error(err);
            return message.reply('❌ Failed to reset cooldown matrix.');
        }
    }

    if (command === '!setstock') {
        const targetPrice = parseFloat(args[1]);
        if (!targetPrice || targetPrice <= 0) return message.reply('❌ Usage: `!setstock <price>` (e.g. `!setstock 98.50`)');
        try {
            const stock = marketTickersState['$FLME'];
            stock.price = parseFloat(targetPrice.toFixed(2));
            stock.history.push(stock.price);
            if (stock.history.length > 25) stock.history.shift();
            return message.reply(`📈 **$FLME** master market valuation manually updated to **$${stock.price.toFixed(2)}**.`);
        } catch (err) {
            console.error(err);
            return message.reply('❌ Failed to override asset market tracking flags.');
        }
    }

    if (command === '!givestock') {
        const ticker = args[2]?.toUpperCase();
        const amount = cleanAmount(args[3]);

        if (!target || !VALID_TICKERS.includes(ticker) || !amount || amount <= 0) {
            return message.reply('❌ Usage: `!givestock @user <ticker> <amount>`\nExample: `!givestock @Nico $FLME 10`');
        }

        try {
            const targetData = await User.findOne({ id: target.id }) || await User.create({ id: target.id });

            if (!targetData.portfolios || typeof targetData.portfolios.get !== 'function') {
                targetData.portfolios = new Map();
            }

            const dbKey = ticker.replace('$', '');
            const currentShares = targetData.portfolios.get(dbKey) || 0;

            targetData.portfolios.set(dbKey, currentShares + amount);
            await targetData.save();

            return message.reply(`📈 **Market Injection:** Granted **${amount}** shares of **${ticker}** directly into <@${target.id}>'s asset portfolio, bro.`);
        } catch (err) {
            console.error('Give stock execution failure:', err);
            return message.reply('❌ Failed to rewrite target asset allocation map rows.');
        }
    }

    return false;
}

module.exports = { handleAdminCommands };
