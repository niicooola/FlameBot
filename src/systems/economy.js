const User = require('../models/User');
const { getUser } = require('../utils/getUser');
const { cleanAmount } = require('../utils/amounts');

const lastWorked = {};
const lastDaily = {};

// ==========================================
//      📉 DEFLATED BALANCED SHOP CONFIG      
// ==========================================
const ECON_SHOP = {
    'shield': {
        name: '🛡️ Protection Shield',
        price: 350, // Reduced from crazy inflation down to a clean, readable price
        description: 'Protects your coins from being stolen by other users.'
    },
    'lucky_dice': {
        name: '🎲 Lucky Dice',
        price: 150,
        description: 'Slightly boosts your luck multiplier in gambling games.'
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

        // Earn between 50 and 150 coins per hour
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

    // ==========================================
    //          🛒 BALANCED SHOP COMMANDS        
    // ==========================================
    if (command === '!shop') {
        let shopMenu = '🛒 **FlameBot Deflated Item Shop**\n───────────────\n';
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
            return message.reply(`❌ You need 🪙 **${item.price} coins** to buy this, broke boy.`);
        }

        // Initialize items inventory map safely if it doesn't exist
        if (!userData.inventory) {
            userData.inventory = new Map();
        }

        const currentCount = userData.inventory.get(itemId) || 0;
        
        userData.coins -= item.price;
        userData.inventory.set(itemId, currentCount + 1);
        
        await userData.save();

        return message.reply(`✅ Successfully bought **${item.name}** for 🪙 **${item.price} coins**!`);
    }

    return false;
}

module.exports = {
    handleEconomy
};
