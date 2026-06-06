const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../utils/getUser');

async function handleInfo(message, args, command, userData) {
    if (command === '!ping') {
        return message.reply(`🏓 Pong. Latency: \`${Date.now() - message.createdTimestamp}ms\`.`);
    }

    if (command === '!uptime') {
        const total = Math.floor(process.uptime());
        const hours = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);

        return message.reply(`⏱️ Uptime: **${hours}h ${mins}m**`);
    }

    if (command === '!botinfo') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🤖 Bot Info')
                    .addFields(
                        {
                            name: 'Servers',
                            value: `${message.client.guilds.cache.size}`,
                            inline: true
                        },
                        {
                            name: 'Cached Users',
                            value: `${message.client.users.cache.size}`,
                            inline: true
                        },
                        {
                            name: 'Stack',
                            value: 'Node.js + Discord.js + MongoDB + Render'
                        }
                    )
            ]
        });
    }

    if (command === '!serverinfo') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#32CD32')
                    .setTitle(`🏰 ${message.guild.name}`)
                    .addFields(
                        {
                            name: 'Members',
                            value: `${message.guild.memberCount}`,
                            inline: true
                        },
                        {
                            name: 'Boosts',
                            value: `${message.guild.premiumSubscriptionCount || 0}`,
                            inline: true
                        },
                        {
                            name: 'Server ID',
                            value: message.guild.id
                        }
                    )
            ]
        });
    }

    if (command === '!membercount') {
        return message.reply(`👥 Members: **${message.guild.memberCount}**`);
    }

    if (command === '!whois' || command === '!userinfo') {
        const target = message.mentions.members.first() || message.member;

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle(`🔍 ${target.user.username}`)
                    .setThumbnail(target.user.displayAvatarURL({ size: 1024 }))
                    .addFields(
                        {
                            name: 'Account Created',
                            value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>`
                        },
                        {
                            name: 'Joined Server',
                            value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>`
                        },
                        {
                            name: 'User ID',
                            value: target.id
                        }
                    )
            ]
        });
    }

    if (command === '!avatar' || command === '!av') {
        const target = message.mentions.members.first() || message.member;

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`${target.user.username}'s Avatar`)
                    .setImage(target.user.displayAvatarURL({ size: 1024 }))
            ]
        });
    }

    if (command === '!channelinfo') {
        return message.reply(`📺 Channel: **${message.channel.name}**\nID: \`${message.channel.id}\``);
    }

    if (command === '!stats' || command === '!rank') {
        const target = message.mentions.members.first() || message.member;
        const data = target.id === message.author.id ? userData : await getUser(target.id);

        const level = Math.floor(0.1 * Math.sqrt(data.xp));
        const nextXp = Math.pow((level + 1) / 0.1, 2);
        const needed = Math.ceil(nextXp - data.xp);

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`👤 ${target.user.username} ${data.customTitle || ''}`)
                    .addFields(
                        {
                            name: '🪙 Coins',
                            value: `${data.coins}`,
                            inline: true
                        },
                        {
                            name: '⭐ XP',
                            value: `${data.xp}`,
                            inline: true
                        },
                        {
                            name: '📈 Level',
                            value: `${level}`,
                            inline: true
                        },
                        {
                            name: 'Next Level',
                            value: `${needed} XP needed`,
                            inline: true
                        },
                        {
                            name: 'Bio',
                            value: data.bio || 'No bio set.',
                            inline: false
                        }
                    )
            ]
        });
    }

    if (command === '!links') {
        return message.channel.send(
            '🔥 **Community Links**\n' +
            'YouTube: https://www.youtube.com/@redflamingarrowliven' +
            'Twitch: https://twitch.tv/redflamingarrow_'
        );
    }

    return false;
}

module.exports = {
    handleInfo
};
