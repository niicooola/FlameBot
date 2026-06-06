const User = require('../models/User');
const { getUser } = require('../utils/getUser');
const { cleanAmount } = require('../utils/amounts');

const lastWorked = {};
const lastDaily = {};

const ECON_SHOP = {
    'shield': {
        name: '🛡️ Protection Shield',
        price: 350,
        description: 'Mutes active !rob theft attempts on your wallet balance for 24 hours.'
    },
    'title': {
        name: '🏷️ Custom Profile Title',
        price: 2500,
        description: 'Set a custom status badge or title text on your active user profile display!'
    },
    'ping': {
        name: '📢 Stream Hype Alert Ping',
        price: 8000,
        description: 'Purchase a one-time global broadcast ping tracking permission card to drop hype.'
    },
    'vip': {
        name: '💎 Elite VIP Server Role Upgrade',
        price: 25000, 
        description: 'Unlock permanent VIP status tier permissions, private channels, and chat color.'
    }
};

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

        return message.channel.send({
            content: `🏆 **Leaderboard**\n${lines}`,
            allowedMentions: { users: [] }
        });
    }

    if (command === '!shop') {
        let shopMenu = '🛒 **FlameBot Server Utility Shop**\n───────────────\n';
        for (const [id, item] of Object.entries(ECON_SHOP)) {
            shopMenu += `🔹 **${item.name}** (\`!buy ${id}\`)\n💰 Price: 🪙 **${item.price} coins**\n📝 *${item.description}*\n\n`;
        }
        return message.channel.send(shopMenu);
    }

    if (command === '!buy') {
        const itemId = args[1]?.toLowerCase();
        const item = ECON_SHOP[itemId];

        if (!item) {
            return message.reply('❌ Item not found. Use `!shop` to see valid IDs.');
        }

        if (userData.coins < item.price) {
            return message.reply(`❌ You need 🪙 **${item.price} coins** to finalize this transaction.`);
        }

        if (itemId === 'vip') {
            const vipRoleId = process.env.VIP_ROLE_ID;
            if (!vipRoleId) {
                return message.reply('❌ Configuration Error: VIP_ROLE_ID is missing from the environment configuration framework.');
            }

            const member = message.member;
            if (member.roles.cache.has(vipRoleId)) {
                return message.reply('❌ You are already a certified VIP member in this community space, king.');
            }

            try {
                await member.roles.add(vipRoleId);
                userData.coins -= item.price;
                await userData.save();
                return message.reply(`🎉 **HOLY FLEX!** You purchased the **${item.name}** for 🪙 **${item.price} coins**! Your account has been promoted.`);
            } catch (err) {
                console.error('Role addition breakdown:', err);
                return message.reply('❌ Permissions Failure: Make sure FlameBot has a higher hierarchical position assignment than the target role to execute this change.');
            }
        }

        if (!userData.inventory || typeof userData.inventory.get === 'function') {
            userData.inventory = {};
        }

        const currentCount = userData.inventory[itemId] || 0;
        userData.coins -= item.price;
        userData.inventory[itemId] = currentCount + 1;
        
        userData.markModified('inventory');
        await userData.save();

        return message.reply(`✅ Successfully bought **${item.name}** for 🪙 **${item.price} coins**! Type \`!inv\` to view your tracking assets.`);
    }

    if (command === '!inv' || command === '!inventory') {
        if (!userData.inventory || typeof userData.inventory.get === 'function') {
            userData.inventory = {};
        }

        let invDescription = '🎒 **Your FlameBot Assets Inventory**\n───────────────\n';
        let hasItems = false;

        for (const [itemId, count] of Object.entries(userData.inventory)) {
            const itemDetails = ECON_SHOP[itemId];
            if (itemDetails && count > 0) {
                invDescription += `🔹 **${itemDetails.name}** x${count}\n📝 *${itemDetails.description}*\n\n`;
                hasItems = true;
            }
        }

        if (!hasItems) {
            invDescription += '*Your inventory is completely empty, bro. Go check out the `!shop`!*';
        }

        return message.reply(invDescription);
    }

    return false;
}

module.exports = {
    handleEconomy
};
