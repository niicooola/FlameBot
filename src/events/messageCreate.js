const { PREFIX, CHAT_INCOME, LEVEL_CHANNEL_ID, SR_MEMBER_ROLE_ID } = require('../config');
const { getUser } = require('../utils/getUser');

// System Imports
const { handleHelp } = require('../systems/help');
const { handlePolls } = require('../systems/polls');
const { handleEconomy } = require('../systems/economy');
const { handleCasino } = require('../systems/casino');
const { handleMarket } = require('../systems/market');
const { handleFun } = require('../systems/fun');
const { handleInfo } = require('../systems/info');
const { handleShop } = require('../systems/shop');
const { handleModeration } = require('../systems/moderation');
const { handleAdminEconomy } = require('../systems/adminEconomy');
const { handleAI } = require('../systems/ai');
const { handleProfile } = require('../systems/profile');
const { handleTasks } = require('../systems/tasks');
const { handleServerTools } = require('../systems/serverTools');
const { handleRobbing } = require('../systems/robbing');

// Synchronize our blacklist data pool with the admin commands handler module
const { ghostList } = require('../systems/AdminCommands');

async function applyXpAndCoins(message, userData, xpAmount) {
    const oldLevel = Math.floor(0.1 * Math.sqrt(userData.xp));
    const income = userData.hasBooster ? CHAT_INCOME * 2 : CHAT_INCOME;

    userData.coins += income;
    userData.xp += xpAmount;

    const newLevel = Math.floor(0.1 * Math.sqrt(userData.xp));

    if (newLevel > oldLevel) {
        const bonus = 100 + newLevel * 50;
        userData.coins += bonus;

        let text = `🎉 <@${message.author.id}> reached **Level ${newLevel}** and earned 🪙 **${bonus}** coins!`;

        if (newLevel >= 10 && SR_MEMBER_ROLE_ID && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
            const role = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
            if (role) {
                await message.member.roles.add(role).catch(() => {});
                text += `\n🏅 Senior Member role unlocked.`;
            }
        }

        const levelChannel = message.guild.channels.cache.get(LEVEL_CHANNEL_ID);
        if (levelChannel) levelChannel.send(text).catch(() => {});
        else message.channel.send(text).catch(() => {});
    }

    await userData.save();
}

module.exports = function(client) {
    client.on('messageCreate', async message => {
        try {
            if (message.author.bot || !message.guild) return;

            // ─── CRITICAL SECURITY GATE ───
            // If the user's ID exists inside the admin-managed ghostList, freeze them.
            if (ghostList && ghostList.has(message.author.id)) {
                return; // Drops cleanly. Zero response, zero database coin/XP gains.
            }

            const userData = await getUser(message.author.id);

            // ─── 1. EXTRACT COMMAND DETAILS IF PREFIX EXISTS ───
            const args = message.content.trim().split(/\s+/);
            const contentHasPrefix = message.content.startsWith(PREFIX);
            const command = contentHasPrefix ? args[0].toLowerCase() : null;
			
            // ─── 2. IF NO PREFIX, STOP AND GIVE CHAT XP ───
            if (!contentHasPrefix || command === '!ask') {
                const handledAI = await handleAI(message, args, command, client); 
                await applyXpAndCoins(message, userData, 2);
                return;
            }
			
            // ─── 3. REGULAR COMMAND ROUTING ENGINE ───
            console.log(`COMMAND RECEIVED: ${command}`);
            await applyXpAndCoins(message, userData, 5); 

            // Include the newly added global system matrix commands routing
            const { handleAdminCommands } = require('../systems/AdminCommands');
            if (await handleAdminCommands(message, args, command, userData)) return;

            if (await handleHelp(message, args, command, userData)) return;
            if (await handlePolls(message, args, command, userData)) return;
            if (await handleEconomy(message, args, command, userData)) return;
            if (await handleCasino(message, args, command, userData)) return;
            if (await handleMarket(message, args, command, userData)) return;
            if (await handleFun(message, args, command, userData)) return;
            if (await handleInfo(message, args, command, userData)) return;
            if (await handleShop(message, args, command, userData)) return;
            if (await handleModeration(message, args, command, userData)) return;
            if (await handleAdminEconomy(message, args, command, userData)) return;
            if (await handleRobbing(message, args, command, userData)) return; 
            if (await handleProfile(message, args, command, userData)) return;
            if (await handleTasks(message, args, command, userData)) return;
            if (await handleServerTools(message, args, command, userData)) return;

            return message.reply('❌ Unknown command. Use `!help`.');
        } catch (err) {
            console.error('MESSAGE CREATE ERROR:', err);
            return message.reply('❌ Command crashed. Check Render logs.');
        }
    });
};
