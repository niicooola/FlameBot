const { EmbedBuilder } = require('discord.js');
const {
    VIP_ROLE_ID,
    VIP_PRICE,
    BOOSTER_PRICE,
    COLOR_PRICE,
    ORACLE_PRICE,
    TITLE_PRICE,
    SHIELD_PRICE
} = require('../config');

const { eightBallAnswers } = require('./fun');

async function handleShop(message, args, command, userData) {
    if (command === '!shop') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('🏪 FlameBot Shop')
                    .addFields(
                        {
                            name: '💎 VIP',
                            value: `\`!buy vip\` — 🪙 ${VIP_PRICE}`
                        },
                        {
                            name: '💸 Booster',
                            value: `\`!buy booster\` — 🪙 ${BOOSTER_PRICE}`
                        },
                        {
                            name: '🎨 Color Role',
                            value: `\`!buy color #FF0000\` — 🪙 ${COLOR_PRICE}`
                        },
                        {
                            name: '🔮 8Ball Answer',
                            value: `\`!buy 8ball text\` — 🪙 ${ORACLE_PRICE}`
                        },
                        {
                            name: '🎭 Title',
                            value: `\`!buy title text\` — 🪙 ${TITLE_PRICE}`
                        },
                        {
                            name: '🛡️ Shield',
                            value: `\`!buy shield\` — 🪙 ${SHIELD_PRICE}`
                        }
                    )
            ]
        });
    }

    if (command !== '!buy') return false;

    const item = args[1]?.toLowerCase();

    if (!item) {
        return message.reply('❌ Usage: `!buy <item>`');
    }

    if (item === 'vip') {
        if (userData.coins < VIP_PRICE) {
            return message.reply(`❌ Need 🪙 **${VIP_PRICE}**.`);
        }

        const role = message.guild.roles.cache.get(VIP_ROLE_ID);

        if (!role) {
            return message.reply('❌ VIP role not found. Check `VIP_ROLE_ID` in Render.');
        }

        await message.member.roles.add(role);

        userData.coins -= VIP_PRICE;
        await userData.save();

        return message.reply('💎 VIP purchased.');
    }

    if (item === 'booster') {
        if (userData.hasBooster) {
            return message.reply('❌ Booster already active.');
        }

        if (userData.coins < BOOSTER_PRICE) {
            return message.reply(`❌ Need 🪙 **${BOOSTER_PRICE}**.`);
        }

        userData.hasBooster = true;
        userData.coins -= BOOSTER_PRICE;

        await userData.save();

        return message.reply('💸 Booster purchased. Passive income doubled.');
    }

    if (item === 'color') {
        const hex = args[2];

        if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) {
            return message.reply('❌ Usage: `!buy color #FF0000`');
        }

        if (userData.coins < COLOR_PRICE) {
            return message.reply(`❌ Need 🪙 **${COLOR_PRICE}**.`);
        }

        const role = await message.guild.roles.create({
            name: `🎨 Color: ${message.author.username}`,
            color: hex,
            reason: 'Shop color purchase'
        });

        await message.member.roles.add(role);

        userData.coins -= COLOR_PRICE;
        await userData.save();

        return message.reply(`🎨 Color role created: **${hex}**`);
    }

    if (item === '8ball') {
        const text = args.slice(2).join(' ');

        if (!text || text.length < 3) {
            return message.reply('❌ Usage: `!buy 8ball <answer>`');
        }

        if (userData.coins < ORACLE_PRICE) {
            return message.reply(`❌ Need 🪙 **${ORACLE_PRICE}**.`);
        }

        eightBallAnswers.push(text);

        userData.coins -= ORACLE_PRICE;
        await userData.save();

        return message.reply(`🔮 Added custom 8ball answer: **${text}**`);
    }

    if (item === 'title') {
        const title = args.slice(2).join(' ');

        if (!title || title.length > 20) {
            return message.reply('❌ Title must be 1-20 characters.');
        }

        if (userData.coins < TITLE_PRICE) {
            return message.reply(`❌ Need 🪙 **${TITLE_PRICE}**.`);
        }

        userData.customTitle = `[${title}]`;
        userData.coins -= TITLE_PRICE;

        await userData.save();

        return message.reply(`🎭 Title set to **[${title}]**.`);
    }

    if (item === 'shield') {
        if (userData.hasShield) {
            return message.reply('❌ Shield already active.');
        }

        if (userData.coins < SHIELD_PRICE) {
            return message.reply(`❌ Need 🪙 **${SHIELD_PRICE}**.`);
        }

        userData.hasShield = true;
        userData.coins -= SHIELD_PRICE;

        await userData.save();

        return message.reply('🛡️ Shield purchased.');
    }

    return message.reply('❌ Unknown shop item.');
}

module.exports = {
    handleShop
};
