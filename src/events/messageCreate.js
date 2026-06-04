const { PREFIX } = require('../config');
const { getUser } = require('../utils/getUser');

const { handleEconomy } = require('../systems/economy');
const { handleCasino } = require('../systems/casino');
const { handleMarket } = require('../systems/market');

module.exports = function(client) {
    client.on('messageCreate', async message => {
        if (message.author.bot || !message.guild) return;

        const userData = await getUser(message.author.id);

        if (!message.content.startsWith(PREFIX)) {
            userData.coins += userData.hasBooster ? 10 : 5;
            userData.xp += 2;
            await userData.save();
            return;
        }

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();

        userData.coins += userData.hasBooster ? 10 : 5;
        userData.xp += 5;
        await userData.save();

        if (await handleEconomy(message, args, command, userData)) return;
        if (await handleCasino(message, args, command, userData)) return;
        if (await handleMarket(message, args, command, userData)) return;

        if (command === '!help') {
            return message.channel.send(
                '**🔥 FlameBot Help**\n' +
                '`!bal`, `!daily`, `!work`, `!pay`, `!leaderboard`\n' +
                '`!coinflip`, `!blackjack`, `!gamble`\n' +
                '`!market`, `!stock`, `!portfolio`, `!buyshares`, `!sellshares`'
            );
        }
    });
};
