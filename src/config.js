module.exports = {
    PREFIX: '!',

    TOKEN: process.env.DISCORD_TOKEN,
    MONGO_URI: process.env.MONGO_URI,
    PORT: process.env.PORT || 3000,

    GROQ_API_KEY: process.env.GROQ_API_KEY,

    DEV_USER_ID: '1314033520460693635',
    LEVEL_CHANNEL_ID: '1511569329949380668',

    MARKET_BOARD_CHANNEL_ID: process.env.MARKET_BOARD_CHANNEL_ID,

    VIP_ROLE_ID: process.env.VIP_ROLE_ID,
    MUTE_ROLE_ID: process.env.MUTE_ROLE_ID,
    STREAM_PING_ROLE_ID: process.env.STREAM_PING_ROLE_ID,
    SR_MEMBER_ROLE_ID: process.env.SR_MEMBER_ROLE_ID
};
