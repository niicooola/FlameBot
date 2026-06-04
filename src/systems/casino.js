const User = require('../models/User');
const { getUser } = require('../utils/getUser');
const { cleanAmount } = require('../utils/amounts');

const lastWorked = {};
const lastDaily = {};

async function handleEconomy(message, args, command, userData) {
    if (command === '!bal' || command === '!balance') {
        const target = message.mentions.members.first();

        if (target) {
            const targetData = await getUser(target.id);
            return message.reply(`🔍 **${target.user.username}** has 🪙 **${targetData.coins}** coins.`);
        }

        return message.reply(`🪙 You have **${userData.coins} coins**.`);
    }

    if (command === '!daily') {
        const now = Date.now();

        if (lastDaily[message.author.id] && now - lastDaily[message.author.id] < 86400000) {
            return message.reply('❌ You already claimed daily today.');
        }

        userData.coins += 100;
        lastDaily[message.author.id] = now;
        await userData.save();

        return message.reply('📆 Daily claimed. 🪙 **+100 coins**');
    }

    if (command === '!work') {
        const now = Date.now();

        if (lastWorked[message.author.id] && now - lastWorked[message.author.id] < 3600000) {
            return message.reply('❌ Work is on cooldown.');
        }

        const pay = Math.floor(Math.random() * 101) + 50;

        userData.coins += pay;
        lastWorked[message.author.id] = now;
        await userData.save();

        return message.reply(`💼 Work complete. Earned 🪙 **${pay} coins**.`);
    }

    if (command === '!pay') {
        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || !amount || amount <= 0) {
            return message.reply('❌ Usage: `!pay @user <amount>`');
        }

        if (target.id === message.author.id) {
            return message.reply('❌ You cannot pay yourself.');
        }

        if (userData.coins < amount) {
            return message.reply('❌ Not enough coins.');
        }

        const targetData = await getUser(target.id);

        userData.coins -= amount;
        targetData.coins += amount;

        await userData.save();
        await targetData.save();

        return message.reply(`💸 Sent 🪙 **${amount} coins** to **${target.user.username}**.`);
    }

    if (command === '!leaderboard' || command === '!lb') {
        const topUsers = await User.find().sort({ coins: -1 }).limit(10);

        const lines = topUsers.map((u, i) => {
            return `**#${i + 1}** <@${u.id}> — 🪙 ${u.coins}`;
        }).join('\n') || 'No users yet.';

        return message.channel.send(`🏆 **Leaderboard**\n${lines}`);
    }

    return false;
}

module.exports = { handleEconomy };
