const { DEV_USER_ID } = require('../config');

async function handleServerTools(message, args, command) {
    if (command === '!rules') {
        return message.channel.send(
            '📜 **Server Rules**\n' +
            '1. No harassment or hate speech.\n' +
            '2. No spam or encouraging spam.\n' +
            '3. Do not ping staff. The only acceptable time to ping @Mod or @Admin is if you need assistance and have already dm\'ed them and explained your need (subject to change)\n' +
            '4. No threats of violence or S/A toward any member. While this can be thought of as the same as rule 1, i would like to create a seperate rule to ensure no members are uncomfortable\n' +
            '5. Keep all promotion material to ⁠《✧》self-promo《✧》\n'+
            '6. Edgy jokes are fine but stay well within the line of allowed/not allowed\n'+
            '7. Absolutely no slurs! This applies to everyone but flame bc i cant ban him\n'+
            '8. No NSFW Imagery or videos ETC. if you MUST use an nsfw image or video put a spoiler tag on it AND no porn/sexual imagery ever\n'+
            '9. This is a very unpolitic server. If you must talk about Politics keep it respectful and according to other rules\n'+
            '10. No talking about mixing baked beans and maple syrup (iykyk)\n'+
            '11. no being british, it is punishable by British role\n'+
            '12. Please keep all bot commands in ⁠《✧》flamegpt-commands《✧》or ⁠《✧》flamegpt-commands-2《✧》 '
        );
    }

    if (command === '!roles') {
        const roles = message.guild.roles.cache
            .filter(role => role.name !== '@everyone')
            .map(role => role.name)
            .slice(0, 40)
            .join(', ');

        return message.reply(`🎭 Roles: ${roles || 'No roles found.'}`);
    }

    if (command === '!serverlinks') {
        return message.channel.send(
            '🔗 **Server Links**\n' +
            'YouTube: https://www.youtube.com/@redflamingarrowliven' +
            'Twitch: https://twitch.tv/redflamingarrow_'
        );
    }

    if (command === '!report') {
        const text = args.slice(1).join(' ');
        if (!text) return message.reply('❌ Usage: `!report <problem>`');

        const dev = await message.client.users.fetch(DEV_USER_ID).catch(() => null);

        if (dev) {
            await dev.send(
                `🚨 **New Report**\n` +
                `From: <@${message.author.id}> (${message.author.tag})\n` +
                `Server: ${message.guild.name}\n` +
                `Channel: #${message.channel.name}\n` +
                `Report: ${text}`
            ).catch(() => {});
        }

        return message.reply('✅ Report sent.');
    }

    if (command === '!afk') {
        const reason = args.slice(1).join(' ') || 'AFK';
        const { getUser } = require('../utils/getUser');
        const userData = await getUser(message.author.id);

        userData.afk = reason;
        await userData.save();

        return message.reply(`🌙 You are now AFK: **${reason}**`);
    }

    return false;
}

module.exports = { handleServerTools };
