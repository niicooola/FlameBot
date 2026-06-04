const { DEV_USER_ID } = require('../config');

async function handleServerTools(message, args, command) {
    if (command === '!rules') {
        return message.channel.send(
            '📜 **Server Rules**\n' +
            '1. Be respectful.\n' +
            '2. No spam.\n' +
            '3. No scams.\n' +
            '4. Follow Discord TOS.\n' +
            '5. Listen to staff.'
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
            'YouTube: https://www.youtube.com/@redflamingarrowlive\n' +
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
