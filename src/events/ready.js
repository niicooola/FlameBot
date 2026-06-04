const { startMarketLoop } = require('../systems/market');

module.exports = function(client) {
    client.once('ready', () => {
        console.log(`🔥 Logged in as ${client.user.tag}`);
        startMarketLoop(client);
    });
};
