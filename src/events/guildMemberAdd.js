const { PREFIX } = require('../config');

module.exports = function(client) {
    client.on('guildMemberAdd', async member => {
        try {
            await member.send(
                `Welcome to **${member.guild.name}**!\nType \`${PREFIX}help\` in the server to see my commands.`
            );
        } catch {
            console.log(`Could not DM ${member.user.tag}`);
        }
    });
};
