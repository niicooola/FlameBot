require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    EmbedBuilder
} = require('discord.js');
const Groq = require('groq-sdk');

// ==========================================
//          CONFIGURATION CONSTANTS          
// ==========================================
const TOKEN = process.env.DISCORD_TOKEN;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

// DEVELOPER GATEWAY ROUTING ID
const DEV_USER_ID = 'YOUR_DISCORD_USER_ID_HERE'; // <-- Nico, right-click your profile and paste your exact numeric ID string here!

// CHANNEL & ROLE CONTEXT CONFIGURATIONS
const VIP_ROLE_ID = process.env.VIP_ROLE_ID || '1511458646348009573';
const MUTE_ROLE_ID = process.env.MUTE_ROLE_ID || '1509040670801789019';
const STREAM_PING_ROLE_ID = process.env.STREAM_PING_ROLE_ID || '1503627239713935452';
const LEVEL_CHANNEL_ID = '1511569329949380668';

// REVENUE ARCHITECTURE RATES
const PREFIX = '!';
const VIP_PRICE = 10000;
const CHAT_INCOME = 5;

// CLIENT CONTEXT MATRIX
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// ==========================================
//             DATABASE DATA SCHEMA           
// ==========================================
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    coins: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    afk: { type: String, default: null },
    hasBooster: { type: Boolean, default: false }, 
    customTitle: { type: String, default: null },   
    hasShield: { type: Boolean, default: false }    
});

const User = mongoose.model('User', userSchema);

// GLOBAL CUSTOM 8BALL MEMORY POOL
const customEightBallAnswers = [
    'Yes.', 'No.', 'Probably.', 'Definitely.', 'Bro is cooked.', 'Ask again later.', 'Absolutely not.', 'Looks good.'
];

// ACTIVITY COOL DOWN DICTIONARIES
const lastWorked = {};
const lastDaily = {};
const lastGambled = {};
const lastRobbed = {};

// ==========================================
//               HELPER FUNCTIONS            
// ==========================================
async function getUser(id) {
    let user = await User.findOne({ id });
    if (!user) {
        try {
            user = await User.create({ id });
        } catch (err) {
            user = await User.findOne({ id });
        }
    }
    return user;
}

function isStaff(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.roles.cache.some(r =>
            ['Trial Mod', 'Mod', 'Lower Admin', 'Admin', 'Owner/Streamer'].includes(r.name)
        );
}

function isMod(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.roles.cache.some(r =>
            ['Mod', 'Lower Admin', 'Admin', 'Owner/Streamer'].includes(r.name)
        );
}

function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.id === member.guild.ownerId ||
        member.roles.cache.some(r =>
            ['Lower Admin', 'Admin', 'Owner/Streamer'].includes(r.name)
        );
}

function cleanAmount(value) {
    const n = parseInt(value);
    return Number.isFinite(n) ? n : null;
}

async function dmServerLeadership(guild, embed) {
    try {
        const members = await guild.members.fetch();
        const management = members.filter(m => 
            m.id === guild.ownerId || 
            m.roles.cache.some(r => ['Admin', 'Owner/Streamer'].includes(r.name))
        );
        management.forEach(async (admin) => {
            if (!admin.user.bot) {
                await admin.send({ embeds: [embed] }).catch(() => {});
            }
        });
    } catch (err) {
        console.error('Leadership DM pipeline failed:', err);
    }
}

// ==========================================
//          SERVER INFRASTRUCTURE HOST        
// ==========================================
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('💾 MongoDB connected.'))
        .catch(err => console.error('❌ MongoDB error:', err));
} else {
    console.warn('⚠️ MONGO_URI missing.');
}

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔥 FlameBot is online!');
}).listen(PORT, () => {
    console.log(`🌐 Render web server running on port ${PORT}`);
});

client.once('ready', () => {
    console.log(`🔥 FlameBot logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
    try {
        await member.send(
            `👋 Welcome to **${member.guild.name}**!\nUse \`${PREFIX}help\` in the server to see commands.`
        );
    } catch {
        console.log(`Could not DM ${member.user.tag}`);
    }
});

// ==========================================
//             LIVE MESSAGE HANDLER          
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userData = await getUser(message.author.id);

    // --- AFK RETURN CHECKER ---
    if (userData.afk) {
        userData.afk = null;
        await userData.save();
        message.reply('👋 Welcome back! I have removed your AFK status.').then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }

    // --- AFK MENTION CHECKER ---
    if (message.mentions.members.size > 0) {
        message.mentions.members.forEach(async (member) => {
            const mentionedData = await User.findOne({ id: member.id });
            if (mentionedData && mentionedData.afk) {
                message.reply(`💤 **${member.user.username}** is currently AFK: ${mentionedData.afk}`);
            }
        });
    }

    // --- PASSIVE INCOME SYSTEM & SMART CONVERSATION TRIGGER ---
    if (!message.content.startsWith(PREFIX)) {
        const oldLevel = Math.floor(0.1 * Math.sqrt(userData.xp));

        const actualIncome = userData.hasBooster ? (CHAT_INCOME * 2) : CHAT_INCOME;
        userData.coins += actualIncome;
        userData.xp += 2; 

        const newLevel = Math.floor(0.1 * Math.sqrt(userData.xp));

        // Level Up Alert Checks
        if (newLevel > oldLevel) {
            const coinPrize = 100 + (newLevel * 50);
            userData.coins += coinPrize;

            const levelChannel = message.guild.channels.cache.get(LEVEL_CHANNEL_ID);
            let levelMessage = `🎉 **LEVEL UP!** <@${message.author.id}> leveled up to **Level ${newLevel}**!! Payout: 🪙 **+${coinPrize}** Flame Coins.`;

            // SENIOR MEMBER AUTOROLE SYSTEM (Requires Level 10 / 5,000 messages)
            const SR_MEMBER_ROLE_ID = 'YOUR_SR_MEMBER_ROLE_ID_HERE'; 
            if (newLevel >= 10 && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
                const srRole = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
                if (srRole) {
                    try {
                        await message.member.roles.add(srRole);
                        levelMessage += `\n🏅 **PROMOTION!** You have earned the **${srRole.name}** role for reaching the Level 10 grind milestone!`;
                        await message.author.send(`🏅 **Congratulations, bro!** You officially unlocked the **Senior Member** role in **${message.guild.name}**! Thanks for keeping the chat active, gng!`).catch(() => {});
                    } catch {}
                }
            }

            if (levelChannel) {
                levelChannel.send(levelMessage);
            } else {
                message.channel.send(levelMessage);
            }
        }

        await userData.save();

        // Smart Talking Logic via Groq Check Matrix
        if (message.content.trim().split(/\s+/).length >= 3) {
            try {
                const filterCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a message filter for a Discord bot. Analyze the user message. If the message is a question, a call for help, a hot take, or an interesting topic (like Minecraft, gaming, tech, coding), reply with exactly the word "TRIGGER". If it is just general chat hype, a basic greeting, an emoji, or uninteresting filler (e.g., "yooo redflames stream is fire", "wsp", "lol"), reply with exactly the word "IGNORE". Do not include any other text.'
                        },
                        { role: 'user', content: message.content }
                    ],
                    model: 'llama-3.1-8b-instant',
                    temperature: 0.1,
                    max_tokens: 10
                });

                const decision = filterCompletion.choices[0]?.message?.content?.trim().toUpperCase();

                if (decision.includes('TRIGGER')) {
                    const CHANCE_PERCENT = 30;
                    const randomRoll = Math.floor(Math.random() * 100) + 1;

                    if (randomRoll <= CHANCE_PERCENT) {
                        await message.channel.sendTyping();

                        const replyCompletion = await groq.chat.completions.create({
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are FlameBot, the high-energy AI core for streamer RedFlame. Chime into this Discord conversation naturally. Address what the user said with a witty, helpful, or slightly roasting response using community slang like gng, cooked, bro, or wsp. Keep it very short—maximum 1 or 2 sentences.'
                                },
                                { role: 'user', content: `Someone just said this in the server: "${message.content}". Drop a quick response to it.` }
                            ],
                            model: 'llama-3.1-8b-instant',
                            temperature: 0.8,
                            max_tokens: 150
                        });

                        const replyText = replyCompletion.choices[0]?.message?.content;
                        if (replyText) {
                            return message.reply(replyText);
                        }
                    }
                }
            } catch (err) {
                console.error('Groq Smart Chat Error:', err);
            }
        }
        return; 
    }

    // --- COMMAND PARSING MATRIX ENGINE ---
    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    const oldLevelCmd = Math.floor(0.1 * Math.sqrt(userData.xp));

    const actualIncomeCmd = userData.hasBooster ? (CHAT_INCOME * 2) : CHAT_INCOME;
    userData.coins += actualIncomeCmd;
    userData.xp += 5; 

    const newLevelCmd = Math.floor(0.1 * Math.sqrt(userData.xp));

    if (newLevelCmd > oldLevelCmd) {
        const coinPrizeCmd = 100 + (newLevelCmd * 50);
        userData.coins += coinPrizeCmd;

        const levelChannelCmd = message.guild.channels.cache.get(LEVEL_CHANNEL_ID);
        let cmdLevelMessage = `🎉 **LEVEL UP!** <@${message.author.id}> leveled up to **Level ${newLevelCmd}**!! Payout: 🪙 **+${coinPrizeCmd}** Flame Coins.`;

        const SR_MEMBER_ROLE_ID = 'YOUR_SR_MEMBER_ROLE_ID_HERE';
        if (newLevelCmd >= 10 && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
            const srRole = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
            if (srRole) {
                try {
                    await message.member.roles.add(srRole);
                    cmdLevelMessage += `\n🏅 **PROMOTION!** You have earned the **${srRole.name}** role for reaching the Level 10 grind milestone!`;
                    await message.author.send(`🏅 **Congratulations, bro!** You officially unlocked the **Senior Member** role in **${message.guild.name}**! Thanks for keeping the chat active, gng!`).catch(() => {});
                } catch {}
            }
        }

        if (levelChannelCmd) {
            levelChannelCmd.send(cmdLevelMessage);
        } else {
            message.channel.send(cmdLevelMessage);
        }
    }

    await userData.save();

    // ==========================================
    //               COMMAND REPERTOIRE          
    // ==========================================

    // HELP HUB MENU
    if (command === '!help') {
        const embed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🔥 FlameBot Command Hub')
            .setDescription('Yo bro, here are the commands.')
            .addFields(
                { name: '🤖 AI', value: '`!ask <question>`' },
                { name: '🪙 Economy', value: '`!bal`, `!daily`, `!work`, `!pay @user <amount>`, `!leaderboard`, `!shop`, `!buy <item>`, `!rank`' },
                { name: '🎰 Casino', value: '`!blackjack <bet>`, `!coinflip <heads/tails> <bet>`, `!gamble slots/dice <bet>`, `!rob @user`' },
                { name: '🎉 Fun', value: '`!8ball`, `!rps`, `!roll`, `!choose`, `!coin`, `!dice`, `!poll`, `!bananabread`' },
                { name: '📊 Info', value: '`!stats`, `!serverinfo`, `!whois`, `!avatar`, `!ping`, `!uptime`, `!botinfo`, `!membercount`, `!channelinfo`' },
                { name: '📣 Utility', value: '`!links`, `!suggest`, `!afk`, `!say`, `!announce`' },
                { name: '🛡️ Staff', value: '`!staffhelp`' }
            )
            .setFooter({ text: 'FlameBot Render Edition' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!staffhelp') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const embed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle('🛡️ Staff Command Hub')
            .addFields(
                { name: '⚠️ Moderation', value: '`!warn @user <reason>`, `!warnings @user`, `!clearwarns @user`, `!mute @user`, `!unmute @user`, `!tempmute @user <mins>`, `!kick @user [time] [reason]`, `!ban @user [time] [reason]`' },
                { name: '🧹 Channel Control', value: '`!clear <1-100>`, `!slowmode <seconds/off>`, `!lockchannel`, `!unlockchannel`' },
                { name: '💰 Economy Admin', value: '`!addcoins @user <amount>`, `!removecoins @user <amount>`, `!setcoins @user <amount>`, `!resetcoins @user`, `!baltable`, `!approvesuggest <userId>`, `!rejectsuggest <userId> <reason>`' }
            );

        return message.channel.send({ embeds: [embed] });
    }

    // BACKUP JSON SNAPSHOT
    if (command === '!backupjson') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        try {
            const users = await User.find().sort({ coins: -1 });
            const backupData = users.map(u => ({ userId: u.id, coins: u.coins, warnings: u.warnings, xp: u.xp }));
            const jsonBuffer = Buffer.from(JSON.stringify(backupData, null, 4), 'utf-8');

            return message.channel.send({
                content: '📥 **BALANCES.JSON complete backup compile generated successfully.** Live architecture records maintained securely.',
                files: [{ attachment: jsonBuffer, name: 'BALANCES.JSON' }]
            });
        } catch (err) {
            return message.reply('❌ Failed to compile snapshot file.');
        }
    }

    // AI GROQ RUNTIME
    if (command === '!ask') {
        const question = args.slice(1).join(' ');
        if (!question) return message.reply('❌ Usage: `!ask <question>`');

        const loading = await message.reply('🧠 Thinking...');
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are FlameBot, the official high-energy AI core for streamer RedFlame. Be helpful, concise, and match the community vibe using slang like gng, cooked, bro, and wsp. Links: Twitch: https://twitch.tv/redflamingarrow_ YouTube: https://www.youtube.com/@redflamingarrowlive.' 
                    },
                    { role: 'user', content: question }
                ],
                model: 'llama-3.1-8b-instant',
                temperature: 0.7,
                max_tokens: 500
            });

            const replyText = chatCompletion.choices[0]?.message?.content || '⚠️ No response generated.';
            return loading.edit(replyText.substring(0, 1999));
        } catch (err) {
            console.error('Groq AI Engine Error:', err);
            return loading.edit('⚠️ AI core failed to generate a response.');
        }
    }

    // METRIC PACKET INFO COMMANDS
    if (command === '!ping') {
        return message.reply(`🏓 Pong! \`${Date.now() - message.createdTimestamp}ms\``);
    }

    if (command === '!uptime') {
        const seconds = Math.floor(process.uptime());
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return message.reply(`⏱️ Uptime: **${hours}h ${minutes}m**`);
    }

    if (command === '!botinfo') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🤖 FlameBot Info')
                    .addFields(
                        { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
                        { name: 'Users Cached', value: `${client.users.cache.size}`, inline: true },
                        { name: 'Runtime', value: 'Node.js + Discord.js + MongoDB + Render' }
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
                        { name: '👥 Members', value: `${message.guild.memberCount}`, inline: true },
                        { name: '📈 Boosts', value: `${message.guild.premiumSubscriptionCount || 0}`, inline: true },
                        { name: '🆔 Server ID', value: message.guild.id }
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
                        { name: 'Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>` },
                        { name: 'Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>` },
                        { name: 'ID', value: target.id }
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
                    .setTitle(`🖼️ ${target.user.username}'s Avatar`)
                    .setImage(target.user.displayAvatarURL({ size: 1024 }))
            ]
        });
    }

    if (command === '!channelinfo') {
        return message.reply(
            `📺 Channel: **${message.channel.name}**\n🆔 ID: \`${message.channel.id}\``
        );
    }

    if (command === '!links') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🔥 Links')
                    .setDescription(
                        '🎥 YouTube: https://www.youtube.com/@redflamingarrowlive\n🔮 Twitch: https://twitch.tv/redflamingarrow_'
                    )
            ]
        });
    }

    // ECONOMY SYSTEM ENGINE
    if (command === '!bal' || command === '!balance') {
        const target = message.mentions.members.first();

        if (target) {
            if (!isStaff(message.member)) return message.reply('❌ Staff only.');
            const targetData = await getUser(target.id);
            return message.reply(`🔍 **${target.user.username}** has 🪙 **${targetData.coins}** coins.`);
        }

        return message.reply(`🪙 You have **${userData.coins} Flame Coins**.`);
    }

    if (command === '!stats') {
        const target = message.mentions.members.first() || message.member;
        const data = await getUser(target.id);
        const level = Math.floor(0.1 * Math.sqrt(data.xp));

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`👤 ${target.user.username}'s Profile ${data.customTitle ? data.customTitle : ''}`) 
                    .addFields(
                        { name: '🪙 Coins', value: `${data.coins}`, inline: true },
                        { name: '⭐ XP', value: `${data.xp}`, inline: true },
                        { name: '📈 Level', value: `${level}`, inline: true },
                        { name: '🛡️ Shield Installed', value: data.hasShield ? '✅ Yes' : '❌ No', inline: true },
                        { name: '💸 Active Booster', value: data.hasBooster ? '✅ 2x Multiplier' : '❌ None', inline: true },
                        { name: '⚠️ Warnings', value: `${data.warnings}/3`, inline: true }
                    )
            ]
        });
    }

    if (command === '!rank') {
        const level = Math.floor(0.1 * Math.sqrt(userData.xp));
        const nextLevelXp = Math.pow((level + 1) / 0.1, 2);
        const xpNeeded = Math.ceil(nextLevelXp - userData.xp);

        return message.reply(`📈 ${userData.customTitle ? `${userData.customTitle} ` : ''}Level **${level}** | XP **${userData.xp}** (Need **${xpNeeded}** more XP to level up!)`);
    }

    if (command === '!daily') {
        const now = Date.now();
        if (lastDaily[message.author.id] && now - lastDaily[message.author.id] < 86400000) {
            return message.reply('📆 Daily already claimed. Try again later.');
        }

        userData.coins += 100;
        lastDaily[message.author.id] = now;
        await userData.save();

        message.reply('📆 Daily claimed: 🪙 **+100**');

        setTimeout(async () => {
            const userObj = await client.users.fetch(message.author.id).catch(() => null);
            if (userObj) {
                await userObj.send('📆 **Yo bro! Your daily reward timer just reset.** Head back into the server and run `!daily` to grab your free 🪙 **100 coins**, gng!').catch(() => {});
            }
        }, 86400000);
        return;
    }

    if (command === '!work') {
        const now = Date.now();
        if (lastWorked[message.author.id] && now - lastWorked[message.author.id] < 3600000) {
            return message.reply('💼 Work is on cooldown.');
        }

        const pay = Math.floor(Math.random() * 101) + 50;
        userData.coins += pay;
        lastWorked[message.author.id] = now;
        await userData.save();

        message.reply(`💼 You worked and earned 🪙 **${pay}**.`);

        setTimeout(async () => {
            const userObj = await client.users.fetch(message.author.id).catch(() => null);
            if (userObj) {
                await userObj.send('💼 **Your work shift is ready!** Run `!work` right now to earn more coins, bro!').catch(() => {});
            }
        }, 3600000);
        return;
    }

    if (command === '!pay') {
        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || !amount || amount <= 0) return message.reply('❌ Usage: `!pay @user <amount>`');
        if (target.id === message.author.id) return message.reply('❌ You cannot pay yourself.');
        if (userData.coins < amount) return message.reply('❌ You are too broke, bro.');

        const targetData = await getUser(target.id);
        userData.coins -= amount;
        targetData.coins += amount;

        await userData.save();
        await targetData.save();

        return message.reply(`💸 Sent 🪙 **${amount}** to **${target.user.username}**.`);
    }

    if (command === '!leaderboard' || command === '!lb') {
        const top = await User.find().sort({ coins: -1 }).limit(10);
        const desc = top.map((u, i) => `**#${i + 1}** <@${u.id}> — 🪙 ${u.coins}`).join('\n') || 'No data.';

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 Coin Leaderboard')
                    .setDescription(desc)
            ]
        });
    }

    // --- MARKET SHOP CATALOGS ---
    if (command === '!shop') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('🏪 FlameBot Premium Token Shop')
                    .setDescription('Spend your Flame Coins to unlock profile perks, custom aesthetics, and defensive tools, gng!')
                    .addFields(
                        { name: '💎 VIP Role (`!buy vip`)', value: `Cost: 🪙 **${VIP_PRICE}**\nGrants exclusive access to server VIP configurations.` },
                        { name: '💸 2x Multiplier Booster (`!buy booster`)', value: 'Cost: 🪙 **5,000**\nPermanently doubles all passive message and command coin rewards!' },
                        { name: '🎨 Custom Chat Color (`!buy color <hex>`)', value: 'Cost: 🪙 **15,000**\nCreates your own personal colored role (e.g., `!buy color #FF0000`).' },
                        { name: '🔮 Custom 8-Ball Phrase (`!buy 8ball <text>`)', value: 'Cost: 🪙 **8,000**\nPermanently adds your custom text response into the `!8ball` pool!' },
                        { name: '🎭 Custom Profile Title (`!buy title <text>`)', value: 'Cost: 🪙 **12,000**\nAppends a customized vanity title tag directly inside your profile metrics.' },
                        { name: '🛡️ Defensive Robbery Shield (`!buy shield`)', value: 'Cost: 🪙 **3,500**\nInstalls a one-time invisible shield. Completely blocks the next `!rob` attempt and fines the thief!' }
                    )
            ]
        });
    }

    if (command === '!buy') {
        const item = args[1]?.toLowerCase();
        if (!item) return message.reply('❌ Usage: `!buy <item_name> [parameters]`');

        if (item === 'vip') {
            if (userData.coins < VIP_PRICE) return message.reply('❌ Not enough coins.');
            const role = message.guild.roles.cache.get(VIP_ROLE_ID);
            if (!role) return message.reply('❌ VIP role structure unlinked.');
            try {
                await message.member.roles.add(role);
                userData.coins -= VIP_PRICE;
                await userData.save();
                return message.reply('🎉 **VIP Status Acquired!** Role successfully attached.');
            } catch {
                return message.reply('❌ Role assignment hierarchy exception logged.');
            }
        }

        if (item === 'booster') {
            if (userData.hasBooster) return message.reply('❌ You already have a double income multiplier booster activated, bro.');
            if (userData.coins < 5000) return message.reply('❌ Booster cost requires 🪙 **5,000 coins**.');

            userData.hasBooster = true;
            userData.coins -= 5000;
            await userData.save();
            return message.reply('💸 **BOOSTER PURCHASED!** You will now permanently earn **double coins** for typing and running commands, gng! 🚀');
        }

        if (item === 'color') {
            const hex = args[2];
            if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return message.reply('❌ Usage: `!buy color <#HEXCODE>` (Example: `!buy color #FF4500`)');
            if (userData.coins < 15000) return message.reply('❌ Custom hex colors require 🪙 **15,000 coins**.');

            try {
                userData.coins -= 15000;
                await userData.save();

                const newRole = await message.guild.roles.create({
                    name: `🎨 ${message.author.username}'s Tint`,
                    color: hex,
                    reason: 'Premium custom color hex role store item execution.'
                });

                await message.member.roles.add(newRole);
                return message.reply(`🎨 **COLOR UNLOCKED!** Created and assigned your custom hex role targeting color **${hex}**! Clean aesthetic, fr.`);
            } catch (err) {
                console.error(err);
                return message.reply('❌ Error spinning up custom text roles. Check bot configuration settings permissions.');
            }
        }

        if (item === '8ball') {
            const injectedPhrase = args.slice(2).join(' ');
            if (!injectedPhrase || injectedPhrase.length < 3) return message.reply('❌ Usage: `!buy 8ball <Your custom response here>`');
            if (userData.coins < 8000) return message.reply('❌ Adding 8-ball variables requires 🪙 **8,000 coins**.');

            customEightBallAnswers.push(injectedPhrase);
            userData.coins -= 8000;
            await userData.save();
            return message.reply(`🔮 **8-BALL POOL INJECTED!** Your custom answer: *"${injectedPhrase}"* is now live in global memory storage records for anyone to hit!`);
        }

        if (item === 'title') {
            const inputTitle = args.slice(2).join(' ');
            if (!inputTitle || inputTitle.length > 20) return message.reply('❌ Usage: `!buy title <text>` (Max 20 characters length constraints)');
            if (userData.coins < 12000) return message.reply('❌ Vanity titles require 🪙 **12,000 coins**.');

            userData.customTitle = `[${inputTitle}]`;
            userData.coins -= 12000;
            await userData.save();
            return message.reply(`🎭 **PROFILE TITLE ATTACHED!** Your identity tag has been set to **[${inputTitle}]**. Check it via \`!stats\`!`);
        }

        if (item === 'shield') {
            if (userData.hasShield) return message.reply('❌ Defensive perimeter active. You already have a shield protection matrix deployed, bro.');
            if (userData.coins < 3500) return message.reply('❌ Rob shields require 🪙 **3,500 coins**.');

            userData.hasShield = true;
            userData.coins -= 3500;
            await userData.save();
            return message.reply('🛡️ **DEFENSIVE SHIELD DEPLOYED!** The next person who tries to run `!rob` on your balance profile is getting completely shutdown and counter-fined, fr.');
        }

        return message.reply('❌ Shop module indexing signature not found. Use `!shop` for catalog item references.');
    }

    // SUGGESTIONS FLOW INBOX PIPELINE RE-ROUTE (ROUTES DIRECTLY TO NICO)
    if (command === '!suggest') {
        const idea = args.slice(1).join(' ');
        if (!idea) return message.reply('❌ Usage: `!suggest <idea>`');

        if (DEV_USER_ID === 'YOUR_DISCORD_USER_ID_HERE') {
            return message.reply('⚠️ **Developer Error:** The Lead Dev needs to config his numeric Discord profile ID at the top of the file before this routing pipeline can bridge data packets, bro.');
        }

        try {
            const developerObj = await client.users.fetch(DEV_USER_ID);
            if (developerObj) {
                const suggestEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('🎟️ New Bot Infrastructure Suggestion')
                    .addFields(
                        { name: 'Submitted By', value: `<@${message.author.id}> (ID: \`${message.author.id}\`)`, inline: true },
                        { name: 'Channel Source', value: `<#${message.channel.id}>`, inline: true },
                        { name: 'Idea Proposal', value: idea }
                    )
                    .setFooter({ text: 'FlameBot Dev Pipeline Portfolio' })
                    .setTimestamp();

                await developerObj.send({ embeds: [suggestEmbed] });
            }
        } catch (err) {
            console.error('Failed to route suggestion packet to developer DMs:', err);
        }

        return message.reply('✅ **Suggestion logged!** It has been transmitted straight to the Lead Developer\'s desk for review, gng.');
    }

    if (command === '!approvesuggest') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
        const targetId = args[1];
        if (!targetId) return message.reply('❌ Usage: `!approvesuggest <userId>`');

        const userObj = await client.users.fetch(targetId).catch(() => null);
        if (userObj) {
            await userObj.send(`🎟️ **Suggestion Approved!** Yo gng, an admin reviewed your suggestion in **${message.guild.name}** and officially approved it! Keep the fire ideas coming, bro!`).catch(() => {});
            return message.reply('✅ User notified of approval via secure DM.');
        }
        return message.reply('❌ Could not locate user object file records.');
    }

    if (command === '!rejectsuggest') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
        const targetId = args[1];
        const reason = args.slice(2).join(' ') || 'No specific reason given.';
        if (!targetId) return message.reply('❌ Usage: `!rejectsuggest <userId> <reason>`');

        const userObj = await client.users.fetch(targetId).catch(() => null);
        if (userObj) {
            await userObj.send(`🎟️ **Suggestion Update:** Your recent suggestion in **${message.guild.name}** was reviewed. Unfortunately, it was turned down for this reason:\n📝 *"${reason}"*\nAppreciate you dropping ideas though, gng!`).catch(() => {});
            return message.reply('✅ User notified of denial metrics.');
        }
        return message.reply('❌ User records unreached.');
    }

    // ==========================================
    //                 FUN MODULES               
    // ==========================================
    
    // 🍌 CHAOTIC BANANA BREAD RECIPE GENERATOR
    if (command === '!bananabread') {
        const units = ['cups', 'tsp', 'tbsp', 'pieces', 'kilograms', 'drops'];
        const getChaoticIngredient = (name) => {
            const amount = Math.floor(Math.random() * 100) + 1; 
            const unit = units[Math.floor(Math.random() * units.length)];
            return `* 🍌 **${amount} ${unit}** of ${name}`;
        };

        const embed = new EmbedBuilder()
            .setColor('#FFE4C4')
            .setTitle('🍌 FlameBot\'s Definitive Chaotic Banana Bread Recipe')
            .setDescription('Follow this exactly if you wanna get completely baked, gng. No substitutions.')
            .addFields(
                {
                    name: '📋 Ingredients List',
                    value: [
                        getChaoticIngredient('Ripe Bananas'),
                        getChaoticIngredient('Melted Butter'),
                        getChaoticIngredient('Baking Soda'),
                        getChaoticIngredient('Salt'),
                        getChaoticIngredient('Sugar'),
                        getChaoticIngredient('Large Egg (Beaten)'),
                        getChaoticIngredient('Vanilla Extract'),
                        getChaoticIngredient('All-Purpose Flour')
                    ].join('\n')
                }
            )
            .setFooter({ text: 'Bake at 180°C... or maybe 4000°C, good luck bro.' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!8ball') {
        const q = args.slice(1).join(' ');
        if (!q) return message.reply('🎱 Ask a question.');

        const selectedAnswer = customEightBallAnswers[Math.floor(Math.random() * customEightBallAnswers.length)];
        return message.reply(`🎱 ${selectedAnswer}`);
    }

    if (command === '!rps') {
        const choice = args[1]?.toLowerCase();
        if (!['rock', 'paper', 'scissors'].includes(choice)) {
            return message.reply('❌ Usage: `!rps rock/paper/scissors`');
        }

        const options = ['rock', 'paper', 'scissors'];
        const bot = options[Math.floor(Math.random() * options.length)];

        let result = 'Tie.';
        if (
            (choice === 'rock' && bot === 'scissors') ||
            (choice === 'paper' && bot === 'rock') ||
            (choice === 'scissors' && bot === 'paper')
        ) { result = 'You win.'; } else if (choice !== bot) { result = 'I win.'; }

        return message.reply(`✊ You: **${choice}** | Bot: **${bot}**\n${result}`);
    }

    if (command === '!roll' || command === '!dice') {
        const max = cleanAmount(args[1]) || 6;
        return message.reply(`🎲 Rolled **${Math.floor(Math.random() * max) + 1}**.`);
    }

    if (command === '!coin') {
        return message.reply(`🪙 ${Math.random() > 0.5 ? 'Heads' : 'Tails'}`);
    }

    if (command === '!choose') {
        const text = args.slice(1).join(' ');
        if (!text.includes('|')) return message.reply('❌ Use `!choose option 1 | option 2`');

        const options = text.split('|').map(x => x.trim()).filter(Boolean);
        return message.reply(`🔮 I choose: **${options[Math.floor(Math.random() * options.length)]}**`);
    }

    if (command === '!poll') {
        const text = args.slice(1).join(' ');
        if (!text) return message.reply('❌ Usage: `!poll question here`');

        const poll = await message.channel.send(`📊 **Poll:** ${text}\n✅ = yes\n❌ = no`);
        await poll.react('✅');
        await poll.react('❌');
        return;
    }

    // ==========================================
    //                 CASINO HOUSING            
    // ==========================================
    if (command === '!coinflip') {
        const choice = args[1]?.toLowerCase();
        const bet = cleanAmount(args[2]);

        if (!['heads', 'tails'].includes(choice) || !bet || bet <= 0) {
            return message.reply('❌ Usage: `!coinflip <heads/tails> <bet>`');
        }

        if (userData.coins < bet) return message.reply('❌ Not enough coins.');

        const result = Math.random() > 0.5 ? 'heads' : 'tails';

        if (result === choice) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🪙 It landed **${result}**. You won 🪙 **${bet}**.`);
        }

        userData.coins -= bet;
        await userData.save();
        message.reply(`🪙 It landed **${result}**. You lost 🪙 **${bet}**.`);

        if (bet >= 5000) {
            try {
                await message.author.send(`💀 **HIGH ROLLER RIP:** Bro, you just blew 🪙 **${bet} coins** on a coinflip in **${message.guild.name}**... Absolute devastating throw, you are completely cooked gng. Go run some commands and get that bag back!`);
            } catch {}
        }
        return;
    }

    if (command === '!blackjack' || command === '!bj') {
        const bet = cleanAmount(args[1]);
        if (!bet || bet <= 0 || userData.coins < bet) return message.reply('❌ Invalid bet.');

        const player = Math.floor(Math.random() * 11) + 10;
        const dealer = Math.floor(Math.random() * 11) + 10;

        if (player > dealer || dealer > 21) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**\n🎉 You won 🪙 **${bet}**.`);
        }

        if (player === dealer) {
            return message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**\n🤝 Push.`);
        }

        userData.coins -= bet;
        await userData.save();
        message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**\n💀 You lost 🪙 **${bet}**.`);

        if (bet >= 5000) {
            try {
                await message.author.send(`🃏 **CASINO BANKRUPT:** You really let the dealer crush you for 🪙 **${bet} coins** in blackjack?? Bro is down tremendous, absolute tragedy, fr. Go grind some text chats to rebuild!`);
            } catch {}
        }
        return;
    }

    if (command === '!gamble') {
        const mode = args[1]?.toLowerCase();
        const bet = cleanAmount(args[2]);

        if (!['slots', 'dice'].includes(mode) || !bet || bet <= 0) {
            return message.reply('❌ Usage: `!gamble slots/dice <bet>`');
        }

        if (userData.coins < bet) return message.reply('❌ Not enough coins.');

        if (mode === 'slots') {
            const icons = ['🍒', '🍋', '🍇', '💎', '🔥'];
            const roll = [
                icons[Math.floor(Math.random() * icons.length)],
                icons[Math.floor(Math.random() * icons.length)],
                icons[Math.floor(Math.random() * icons.length)]
            ];

            if (roll[0] === roll[1] && roll[1] === roll[2]) {
                userData.coins += bet * 3;
                await userData.save();
                return message.reply(`🎰 [ ${roll.join(' | ')} ]\n🔥 Jackpot! Won 🪙 **${bet * 3}**.`);
            }

            userData.coins -= bet;
            await userData.save();
            message.reply(`🎰 [ ${roll.join(' | ')} ]\n💀 Lost 🪙 **${bet}**.`);

            if (bet >= 5000) {
                try { await message.author.send(`🎰 **SLOTS DEVASTATION:** The slot machine just scammed you out of 🪙 **${bet} coins** in **${message.guild.name}**. Bro is down astronomical!`); } catch {}
            }
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= 4) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🎲 Rolled **${roll}**. You won 🪙 **${bet}**.`);
        }

        userData.coins -= bet;
        await userData.save();
        message.reply(`🎲 Rolled **${roll}**. You lost 🪙 **${bet}**.`);

        if (bet >= 5000) {
            try { await message.author.send(`🎲 **DICE ROAST:** You bet 🪙 **${bet}** on a dice rolling system and rolled a tiny **${roll}**?? Complete throw, you are baked, bro.`); } catch {}
        }
        return;
    }

    if (command === '!rob') {
        const target = message.mentions.members.first();
        if (!target || target.id === message.author.id) return message.reply('❌ Invalid target.');

        const now = Date.now();
        if (lastRobbed[message.author.id] && now - lastRobbed[message.author.id] < 600000) {
            return message.reply('🥷 Rob cooldown active.');
        }

        const targetData = await getUser(target.id);
        if (targetData.coins < 50) return message.reply('❌ Target is too broke.');

        lastRobbed[message.author.id] = now;

        if (targetData.hasShield) {
            targetData.hasShield = false; 
            userData.coins = Math.max(0, userData.coins - 100); 
            targetData.coins += 100; 

            await targetData.save();
            await userData.save();

            try { await target.send(`🛡️ **SHIELD DEFLECT DETECTED:** Someone just tried to run \`!rob\` on your account balance in **${message.guild.name}**! Your shield shattered, completely blocked the theft, and automatically counter-fined them 🪙 **100 coins**! Clean catch, gng.`); } catch {}
            
            return message.reply(`🚨 **ROBBERY FAULT SHIELD BLOCK:** You tried to steal from <@${target.id}> but their active **Defensive Shield** completely deflected your lockpicks! Your toolkit broke and you were counter-fined 🪙 **100 coins** transferred straight to their pockets, bro! Cooked.`);
        }

        if (Math.random() < 0.35) {
            const stolen = Math.min(targetData.coins, Math.floor(Math.random() * 100) + 25);
            targetData.coins -= stolen;
            userData.coins += stolen;
            await targetData.save();
            await userData.save();
            return message.reply(`🥷 Success. Stole 🪙 **${stolen}**.`);
        }

        userData.coins = Math.max(0, userData.coins - 30);
        await userData.save();
        return message.reply('🚨 Caught. Paid 🪙 **30** fine.');
    }

    // ==========================================
    //             MODERATION PIPELINES          
    // ==========================================
    if (command === '!clear' || command === '!purge') {
        if (!isStaff(message.member)) return message.reply('❌ Trial Mod+ only.');

        const amount = cleanAmount(args[1]);
        if (!amount || amount < 1 || amount > 100) return message.reply('❌ Enter 1-100.');

        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(amount, true);

        const msg = await message.channel.send(`🧹 Deleted **${deleted.size}** messages.`);
        setTimeout(() => msg.delete().catch(() => {}), 4000);
        return;
    }

    if (command === '!warn') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');

        const targetData = await getUser(target.id);
        targetData.warnings += 1;
        await targetData.save();

        const reason = args.slice(2).join(' ') || 'No reason provided.';

        try { await target.send(`⚠️ **You have received an official warning in ${message.guild.name}**\n📝 **Reason:** ${reason}\n📊 **Active Warnings:** ${targetData.warnings}/3`); } catch {}

        await message.channel.send(`⚠️ ${target} warned. Active warnings: **${targetData.warnings}/3**`);

        const auditEmbed = new EmbedBuilder().setColor('#FFA500').setTitle('🚨 Staff Action Ledger: Warning Logged').addFields({ name: 'Staff Member', value: `<@${message.author.id}>`, inline: true }, { name: 'Target User', value: `<@${target.id}>`, inline: true }, { name: 'Reason Given', value: reason }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);

        if (targetData.warnings >= 3) {
            if (!target.kickable) return message.channel.send('❌ Cannot auto-kick this user.');
            try { await target.send(`🥾 **You have been auto-kicked from ${message.guild.name}** for reaching 3 active warnings.`); } catch {}
            await target.kick('Reached 3 warnings.');
            targetData.warnings = 0;
            await targetData.save();
            return message.channel.send('🥾 User auto-kicked for 3 warnings.');
        }
        return;
    }

    if (command === '!warnings') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');

        const targetData = await getUser(target.id);
        return message.reply(`📋 ${target.user.username} has **${targetData.warnings}** warnings.`);
    }

    if (command === '!clearwarns') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');

        await User.updateOne({ id: target.id }, { $set: { warnings: 0 } }, { upsert: true });
        return message.reply('✅ Warnings cleared.');
    }

    if (command === '!mute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !role) return message.reply('❌ Missing target or mute role.');
        await target.roles.add(role);
        message.reply(`🤫 Muted ${target}.`);

        try { await target.send(`🤫 **You have been muted in ${message.guild.name}** by a staff member.`); } catch {}
        const auditEmbed = new EmbedBuilder().setColor('#FF8C00').setTitle('🤫 Staff Action: User Muted').addFields({ name: 'Staff', value: `<@${message.author.id}>`, inline: true }, { name: 'Target', value: `<@${target.id}>`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);
        return;
    }

    if (command === '!unmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !role) return message.reply('❌ Missing target or mute role.');
        await target.roles.remove(role);
        message.reply(`🔊 Unmuted ${target}.`);

        try { await target.send(`🔊 **You have been unmuted in ${message.guild.name}**.`); } catch {}
        return;
    }

    if (command === '!tempmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const minutes = cleanAmount(args[2]);
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !minutes || !role) return message.reply('❌ Usage: `!tempmute @user <minutes>`');

        await target.roles.add(role);
        message.reply(`🤫 Muted ${target} for **${minutes}m**.`);

        try { await target.send(`🤫 **You have been temporarily muted in ${message.guild.name}** for **${minutes}m**.`); } catch {}

        setTimeout(async () => {
            try {
                await target.roles.remove(role);
                message.channel.send(`🔊 ${target} was automatically unmuted.`);
                await target.send(`🔊 Your temporary mute in **${message.guild.name}** has expired.`);
            } catch {}
        }, minutes * 60000);
        return;
    }

    if (command === '!kick') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        if (!target.kickable) return message.reply('❌ I cannot kick that user.');

        let timeArg = args[2];
        let duration = null;
        let reasonIndex = 2;

        if (timeArg && (timeArg.endsWith('m') || timeArg.endsWith('h') || timeArg.endsWith('d'))) {
            const timeValue = parseInt(timeArg);
            if (!isNaN(timeValue)) {
                reasonIndex = 3;
                if (timeArg.endsWith('m')) duration = timeValue * 60000;
                if (timeArg.endsWith('h')) duration = timeValue * 3600000;
                if (timeArg.endsWith('d')) duration = timeValue * 86400000;
            }
        }

        const reason = args.slice(reasonIndex).join(' ') || 'No reason provided.';

        try { await target.send(`⚠️ **You have been kicked from ${message.guild.name}**\n📝 **Reason:** ${reason}${duration ? `\n⏱️ **Invite Hold Duration:** ${timeArg}` : ''}`); } catch {}

        await target.kick(reason);
        message.reply(`🥾 Kicked **${target.user.username}**.`);

        const auditEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('🥾 Staff Action: User Kicked').addFields({ name: 'Staff Member', value: `<@${message.author.id}>`, inline: true }, { name: 'Target User', value: `${target.user.tag} (${target.id})`, inline: true }, { name: 'Hold Timer', value: duration ? timeArg : 'None', inline: true }, { name: 'Reason', value: reason }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);

        if (duration) {
            const targetUser = target.user;
            setTimeout(async () => {
                try {
                    const invite = await message.guild.channels.cache.filter(c => c.type === 0).first().createInvite({ maxAge: 86400, maxUses: 1, reason: 'Temporary kick expiration gateway.' });
                    await targetUser.send(`👋 Yo bro, your kick hold window for **${message.guild.name}** has passed. You can join back up via this link: ${invite.url}`);
                } catch {}
            }, duration);
        }
        return;
    }

    if (command === '!ban' || command === '!tempban') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        if (!target.bannable) return message.reply('❌ I cannot ban that user.');

        let timeArg = args[2];
        let duration = null;
        let reasonIndex = 2;

        if (timeArg && (timeArg.endsWith('m') || timeArg.endsWith('h') || timeArg.endsWith('d'))) {
            const timeValue = parseInt(timeArg);
            if (!isNaN(timeValue)) {
                reasonIndex = 3;
                if (timeArg.endsWith('m')) duration = timeValue * 60000;
                if (timeArg.endsWith('h')) duration = timeValue * 3600000;
                if (timeArg.endsWith('d')) duration = timeValue * 86400000;
            }
        }

        const reason = args.slice(reasonIndex).join(' ') || 'No reason provided.';
        const targetUser = target.user;

        try { await target.send(`🔨 **You have been BANNED from ${message.guild.name}**\n📝 **Reason:** ${reason}\n⏱️ **Type:** ${duration ? `Temporary Ban (${timeArg})` : 'Permanent Ban'}`); } catch {}

        await target.ban({ reason });
        message.reply(`🔨 Banned **${targetUser.username}**.`);

        const auditEmbed = new EmbedBuilder().setColor('#8B0000').setTitle('🔨 Staff Action: Server Ban Issued').addFields({ name: 'Staff', value: `<@${message.author.id}>`, inline: true }, { name: 'Target User', value: `${targetUser.tag}`, inline: true }, { name: 'Type/Duration', value: duration ? `Temp (${timeArg})` : 'Permanent', inline: true }, { name: 'Reason', value: reason }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);

        if (duration) {
            setTimeout(async () => {
                try {
                    const banList = await message.guild.bans.fetch();
                    if (banList.has(targetUser.id)) {
                        await message.guild.members.unban(targetUser.id, 'Temporary ban matrix expired.');
                        const invite = await message.guild.channels.cache.filter(c => c.type === 0).first().createInvite({ maxAge: 86400, maxUses: 1, reason: 'Temporary ban entry release re-invite.' });
                        await targetUser.send(`🔓 Yo bro, your temp ban from **${message.guild.name}** has expired completely! Use this link to get back in: ${invite.url}`);
                    }
                } catch {}
            }, duration);
        }
        return;
    }

    if (command === '!slowmode') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');

        const rate = args[1]?.toLowerCase();
        if (!rate) return message.reply('❌ Usage: `!slowmode <seconds/off>`');

        if (rate === 'off') {
            await message.channel.setRateLimitPerUser(0);
            return message.reply('✅ Slowmode disabled.');
        }

        const seconds = cleanAmount(rate);
        if (seconds === null || seconds < 0 || seconds > 21600) return message.reply('❌ Invalid seconds.');

        await message.channel.setRateLimitPerUser(seconds);
        return message.reply(`📶 Slowmode set to **${seconds}s**.`);
    }

    if (command === '!lockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 Channel locked.');
    }

    if (command === '!unlockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.reply('🔓 Channel unlocked.');
    }

    // ECONOMY MODERATION ADMINS
    if (command === '!addcoins' || command === '!givecoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);
        if (!target || !amount || amount <= 0) return message.reply('❌ Usage: `!addcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $inc: { coins: amount } }, { upsert: true });
        message.reply(`💸 Added 🪙 **${amount}** to ${target.user.username}.`);

        const auditEmbed = new EmbedBuilder().setColor('#00FF7F').setTitle('💰 Secret Ledger Audit: Coins Injected').addFields({ name: 'Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Recipient User', value: `<@${target.id}>`, inline: true }, { name: 'Amount Transferred', value: `🪙 ${amount} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);
        return;
    }

    if (command === '!removecoins' || command === '!deductcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);
        if (!target || !amount || amount <= 0) return message.reply('❌ Usage: `!removecoins @user <amount>`');

        const targetData = await getUser(target.id);
        targetData.coins = Math.max(0, targetData.coins - amount);
        await targetData.save();

        message.reply(`📉 Removed 🪙 **${amount}** from ${target.user.username}.`);

        const auditEmbed = new EmbedBuilder().setColor('#FF4500').setTitle('💰 Secret Ledger Audit: Coins Deducted').addFields({ name: 'Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target User', value: `<@${target.id}>`, inline: true }, { name: 'Amount Removed', value: `🪙 ${amount} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);
        return;
    }

    if (command === '!setcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);
        if (!target || amount === null || amount < 0) return message.reply('❌ Usage: `!setcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $set: { coins: amount } }, { upsert: true });
        message.reply(`🔧 Set ${target.user.username}'s coins to 🪙 **${amount}**.`);

        const auditEmbed = new EmbedBuilder().setColor('#1E90FF').setTitle('💰 Secret Ledger Audit: Balance Overridden').addFields({ name: 'Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target User', value: `<@${target.id}>`, inline: true }, { name: 'New Set Balance', value: `🪙 ${amount} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);
        return;
    }

    if (command === '!resetcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Usage: `!resetcoins @user`');

        await User.updateOne({ id: target.id }, { $set: { coins: 0 } }, { upsert: true });
        message.reply(`🧹 Reset ${target.user.username}'s coins.`);

        const auditEmbed = new EmbedBuilder().setColor('#DCDCDC').setTitle('💰 Secret Ledger Audit: Balance Purged').addFields({ name: 'Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target User', value: `<@${target.id}>`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, auditEmbed);
        return;
    }

    if (command === '!baltable' || command === '!balancetable') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const users = await User.find().sort({ coins: -1 }).limit(30);
        const lines = users.map((u, i) => `#${i + 1} <@${u.id}> — ${u.coins}`).join('\n') || 'No users.';

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 Balance Table')
                    .setDescription(lines)
            ]
        });
    }
});

// LOGIN
if (!TOKEN) {
    console.error('❌ Missing DISCORD_TOKEN.');
} else {
    client.login(TOKEN);
}
