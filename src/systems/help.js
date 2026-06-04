const { EmbedBuilder } = require('discord.js');

async function handleHelp(message, args, command) {
    if (command !== '!help') return false;

    const page = args[1]?.toLowerCase();

    const pages = {
        economy: '`!bal`, `!daily`, `!work`, `!pay`, `!leaderboard`',
        casino: '`!coinflip`, `!blackjack`, `!gamble`',
        market: '`!market`, `!stock`, `!portfolio`, `!buyshares`, `!sellshares`',
        fun: '`!8ball`, `!rps`, `!roll`, `!choose`, `!coin`, `!dice`, `!poll`, `!bananabread`',
        info: '`!stats`, `!rank`, `!serverinfo`, `!whois`, `!avatar`, `!ping`, `!uptime`, `!botinfo`, `!membercount`, `!channelinfo`, `!links`',
        shop: '`!shop`, `!buy`',
        mod: '`!warn`, `!mute`, `!kick`, `!ban`, `!clear`, `!slowmode`, `!lockchannel`',
        ai: '`!ask`',
        profile: '`!profile`, `!setbio`, `!badges`, `!inventory`',
        tasks: '`!todo`, `!notes`',
        server: '`!rules`, `!roles`, `!serverlinks`, `!report`'
    };

    if (page && pages[page]) {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle(`🔥 FlameBot Help: ${page}`)
                    .setDescription(pages[page])
            ]
        });
    }

    return message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle('🔥 FlameBot Commands')
                .setDescription('Use `!help <category>` for details.')
                .addFields(
                    { name: '🪙 Economy', value: '`!help economy`', inline: true },
                    { name: '🎰 Casino', value: '`!help casino`', inline: true },
                    { name: '📈 Market', value: '`!help market`', inline: true },
                    { name: '🎉 Fun', value: '`!help fun`', inline: true },
                    { name: '📊 Info', value: '`!help info`', inline: true },
                    { name: '🏪 Shop', value: '`!help shop`', inline: true },
                    { name: '🛡️ Mod', value: '`!help mod`', inline: true },
                    { name: '🤖 AI', value: '`!help ai`', inline: true },
                    { name: '👤 Profile', value: '`!help profile`', inline: true }
                )
        ]
    });
}

module.exports = { handleHelp };
