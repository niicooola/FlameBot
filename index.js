require('dotenv').config();

const { client } = require('./src/client');
const { connectDatabase } = require('./src/database');
const { startKeepAlive } = require('./src/keepAlive');

require('./src/events/ready')(client);
require('./src/events/guildMemberAdd')(client);
require('./src/events/messageCreate')(client);

startKeepAlive();
connectDatabase();

client.login(process.env.DISCORD_TOKEN);
