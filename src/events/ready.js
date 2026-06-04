const { startMarketLoop } = require('../systems/market');

module.exports = function(client) {
    client.once('ready', () => {
        console.log(`🔥 FlameBot logged in as ${client.user.tag}`);
        startMarketLoop(client);
    });
};
