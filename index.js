/**
 * @file index.js
 * @description FlameBot Core Engine — Version 1.2
 * @author Silas Benjamin Fawcett (Nico)
 */

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
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// DISCORD IDENTIFIERS
const DEV_USER_ID = '1314033520460693635';
const LEVEL_CHANNEL_ID = '1511569329949380668';
const VIP_ROLE_ID = process.env.VIP_ROLE_ID || '1511458646348009573';
const MUTE_ROLE_ID = process.env.MUTE_ROLE_ID || '1509040670801789019';
const STREAM_PING_ROLE_ID = process.env.STREAM_PING_ROLE_ID || '1503627239713935452';
const SR_MEMBER_ROLE_ID = 'YOUR_SR_MEMBER_ROLE_ID_HERE'; 

// SYSTEM STATE MATRIX
let systemLogsEnabled = true; 

// ECONOMY PARAMS
const PREFIX = '!';
const VIP_PRICE = 10000;
const CHAT_INCOME = 5;

// CLIENT INTENTS
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
//             DATABASE SCHEMA               
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

// 8BALL POOL
const customEightBallAnswers = [
    'Yes.', 'No.', 'Probably.', 'Definitely.', 'Outlook grim.', 'Ask again later.', 'Absolutely not.', 'Looks good.'
];

// COOLDOWNS
const lastWorked = {};
const lastDaily = {};
const lastGambled = {};
const lastRobbed = {};

// ==========================================
//          CORE UTILITY FUNCTIONS            
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
    if (!systemLogsEnabled) return;

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
        console.error('Failed to send log to staff:', err);
    }
}

// ==========================================
//          HTTP SERVER & DATA LINK           
// ==========================================
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('💾 MongoDB connected.'))
        .catch(err => console.error('❌ MongoDB error:', err));
} else {
    console.warn('⚠️ Warning: MONGO_URI missing from environment variables.');
}

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('FlameBot is online');
}).listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

client.once('ready', () => {
    console.log(`🔥 FlameBot logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
    try {
        await member.send(
            `Welcome to **${member.guild.name}**!\nType \`${PREFIX}help\` in the server to see what I can do.`
        );
    } catch {
        console.log(`Could not send welcome DM to ${member.user.tag}`);
    }
});

// ==========================================
//             LIVE MESSAGE DISPATCHER        
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userData = await getUser(message.author.id);

    // --- AFK STATUS ---
    if (userData.afk) {
        userData.afk = null;
        await userData.save();
        message.reply('Welcome back! I removed your AFK status.').then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }

    if (message.mentions.members.size > 0) {
        message.mentions.members.forEach(async (member) => {
            const mentionedData = await User.findOne({ id: member.id });
            if (mentionedData && mentionedData.afk) {
                message.reply(`${member.user.username} is currently AFK: ${mentionedData.afk}`);
            }
        });
    }

    // --- PASSIVE REVENUE & AI CHAT ---
    if (!message.content.startsWith(PREFIX)) {
        const oldLevel = Math.floor(0.1 * Math.sqrt(userData.xp));
        const actualIncome = userData.hasBooster ? (CHAT_INCOME * 2) : CHAT_INCOME;
        
        userData.coins += actualIncome;
        userData.xp += 2; 

        const newLevel = Math.floor(0.1 * Math.sqrt(userData.xp));

        if (newLevel > oldLevel) {
            const coinPrize = 100 + (newLevel * 50);
            userData.coins += coinPrize;

            const levelChannel = message.guild.channels.cache.get(LEVEL_CHANNEL_ID);
            let levelMessage = `🎉 **Level Up!** <@${message.author.id}> reached **Level ${newLevel}**! Here is a bonus of 🪙 **+${coinPrize}** coins.`;

            if (newLevel >= 10 && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
                const srRole = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
                if (srRole) {
                    try {
                        await message.member.roles.add(srRole);
                        levelMessage += `\n🏅 You earned the **${srRole.name}** role for reaching Level 10!`;
                        await message.author.send(`🏅 **Role Unlocked:** You earned the **Senior Member** role in **${message.guild.name}** for staying active!`).catch(() => {});
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

        // GROQ AI INTERACTION CHANCE
        if (message.content.trim().split(/\s+/).length >= 3) {
            try {
                const filterCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a message filter for a Discord bot. Look at the user message. If it is a question, hot take, or an interesting gaming/coding topic (like Minecraft or programming), reply with exactly "TRIGGER". If it is just general greeting, basic hype, or short casual chat, reply with exactly "IGNORE". Do not add any extra text.'
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
                    const roll = Math.floor(Math.random() * 100) + 1;

                    if (roll <= CHANCE_PERCENT) {
                        await message.channel.sendTyping();

                        const replyCompletion = await groq.chat.completions.create({
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are FlameBot, a helpful and casual AI for the RedFlame Discord server. Reply naturally and casually to the user. Keep it very short, maximum 1 or 2 sentences. Sound friendly and normal, not overly corporate or overly formal.'
                                },
                                { role: 'user', content: `Someone just said this in chat: "${message.content}". Drop a quick reply.` }
                            ],
                            model: 'llama-3.1-8b-instant',
                            temperature: 0.7,
                            max_tokens: 150
                        });

                        const replyText = replyCompletion.choices[0]?.message?.content;
                        if (replyText) {
                            return message.reply(replyText);
                        }
                    }
                }
            } catch (err) {
                console.error('Groq Chat Error:', err);
            }
        }
        return; 
    }

    // --- COMMAND PARSING ---
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
        let cmdLevelMessage = `🎉 **Level Up!** <@${message.author.id}> reached **Level ${newLevelCmd}**! Here is a bonus of 🪙 **+${coinPrizeCmd}** coins.`;

        if (newLevelCmd >= 10 && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
            const srRole = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
            if (srRole) {
                try {
                    await message.member.roles.add(srRole);
                    cmdLevelMessage += `\n🏅 You earned the **${srRole.name}** role for reaching Level 10!`;
                    await message.author.send(`🏅 **Role Unlocked:** You earned the **Senior Member** role in **${message.guild.name}** for staying active!`).catch(() => {});
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
    //               SYSTEM MODULES               
    // ==========================================

    // HELP MENU
    if (command === '!help') {
        const embed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🔥 FlameBot Commands')
            .setDescription('Here is a list of all available commands:')
            .addFields(
                { name: '🤖 AI Chat', value: '`!ask <question>`' },
                { name: '🪙 Economy', value: '`!bal`, `!daily`, `!work`, `!pay @user <amount>`, `!leaderboard`, `!shop`, `!buy <item>`, `!rank`' },
                { name: '🎰 Casino', value: '`!blackjack <bet>`, `!coinflip <heads/tails> <bet>`, `!gamble slots/dice <bet>`, `!rob @user`' },
                { name: '🎉 Fun', value: '`!8ball`, `!rps`, `!roll`, `!choose`, `!coin`, `!dice`, `!poll`, `!bananabread`' },
                { name: '📊 Info & Stats', value: '`!stats`, `!serverinfo`, `!whois`, `!avatar`, `!ping`, `!uptime`, `!botinfo`, `!membercount`, `!channelinfo`' },
                { name: '📣 Utilities', value: '`!links`, `!suggest`, `!afk`, `!say`, `!announce`' },
                { name: '🛡️ Staff Only', value: '`!staffhelp`' }
            )
            .setFooter({ text: 'FlameBot | Version 1.2' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!staffhelp') {
        if (!isStaff(message.member)) return message.reply('❌ You do not have permission to use staff commands.');

        const embed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle('🛡️ Staff Command Directory')
            .addFields(
                { name: '⚠️ Moderation', value: '`!warn @user <reason>`, `!warnings @user`, `!clearwarns @user`, `!mute @user`, `!unmute @user`, `!tempmute @user <mins>`, `!kick @user [time] [reason]`, `!ban @user [time] [reason]`' },
                { name: '🧹 Channel Controls', value: '`!clear <1-100>`, `!slowmode <seconds/off>`, `!lockchannel`, `!unlockchannel`' },
                { name: '💰 Economy Admin', value: '`!addcoins @user <amount>`, `!removecoins @user <amount>`, `!setcoins @user <amount>`, `!resetcoins @user`, `!baltable`, `!approvesuggest <userId>`, `!rejectsuggest <userId> <reason>`' },
                { name: '⚙️ Logging Controls', value: '`!enablelogs`, `!disablelogs`' }
            );

        return message.channel.send({ embeds: [embed] });
    }

    // LOGGING TOGGLE COMMANDS
    if (command === '!enablelogs') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        
        if (systemLogsEnabled) {
            return message.reply('Notice: Server logs are already enabled.');
        }

        systemLogsEnabled = true;
        return message.reply('✅ **Logs Enabled:** Staff DM log alerts are now active.');
    }

    if (command === '!disablelogs') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        
        if (!systemLogsEnabled) {
            return message.reply('Notice: Server logs are already disabled.');
        }

        systemLogsEnabled = false;
        return message.reply('⚠️ **Logs Disabled:** Staff DM log alerts have been turned off.');
    }

    // BACKUP EXPOT
    if (command === '!backupjson') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        try {
            const users = await User.find().sort({ coins: -1 });
            const backupData = users.map(u => ({ userId: u.id, coins: u.coins, warnings: u.warnings, xp: u.xp }));
            const jsonBuffer = Buffer.from(JSON.stringify(backupData, null, 4), 'utf-8');

            return message.channel.send({
                content: '📥 Here is the current database backup file:',
                files: [{ attachment: jsonBuffer, name: 'BALANCES.JSON' }]
            });
        } catch (err) {
            return message.reply('❌ Failed to create the backup file.');
        }
    }

    // AI COMMAND
    if (command === '!ask') {
        const query = args.slice(1).join(' ');
        if (!query) return message.reply('❌ Please provide a question. Usage: `!ask <question>`');

        const processingAlert = await message.reply('🧠 Thinking...');
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are FlameBot, a helpful and casual AI companion for the RedFlame Discord community. Answer naturally and directly. Keep it normal and friendly. Twitch: https://twitch.tv/redflamingarrow_ YouTube: https://www.youtube.com/@redflamingarrowlive.' 
                    },
                    { role: 'user', content: query }
                ],
                model: 'llama-3.1-8b-instant',
                temperature: 0.5,
                max_tokens: 500
            });

            const replyText = chatCompletion.choices[0]?.message?.content || '⚠️ Error: No response generated.';
            return processingAlert.edit(replyText.substring(0, 1999));
        } catch (err) {
            console.error('AI Command Error:', err);
            return processingAlert.edit('⚠️ Sorry, I ran into an error processing that question.');
        }
    }

    // STATS & INFRASTRUCTURE COMMANDS
    if (command === '!ping') {
        return message.reply(`🏓 Pong! Latency is \`${Date.now() - message.createdTimestamp}ms\`.`);
    }

    if (command === '!uptime') {
        const totalSeconds = Math.floor(process.uptime());
        const runtimeHours = Math.floor(totalSeconds / 3600);
        const runtimeMinutes = Math.floor((totalSeconds % 3600) / 60);
        return message.reply(`⏱️ Bot Uptime: **${runtimeHours}h ${runtimeMinutes}m**`);
    }

    if (command === '!botinfo') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🤖 Bot Information')
                    .addFields(
                        { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
                        { name: 'Cached Users', value: `${client.users.cache.size}`, inline: true },
                        { name: 'Platform Stack', value: 'Node.js + Discord.js + MongoDB' }
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
                        { name: 'Members', value: `${message.guild.memberCount}`, inline: true },
                        { name: 'Server Boosts', value: `${message.guild.premiumSubscriptionCount || 0}`, inline: true },
                        { name: 'Server ID', value: message.guild.id }
                    )
            ]
        });
    }

    if (command === '!membercount') {
        return message.reply(`👥 Total Members: **${message.guild.memberCount}**`);
    }

    if (command === '!whois' || command === '!userinfo') {
        const target = message.mentions.members.first() || message.member;
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle(`🔍 User Info: ${target.user.username}`)
                    .setThumbnail(target.user.displayAvatarURL({ size: 1024 }))
                    .addFields(
                        { name: 'Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>` },
                        { name: 'Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>` },
                        { name: 'User ID', value: target.id }
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
            `📺 Channel: **${message.channel.name}**\n🆔 Channel ID: \`${message.channel.id}\``
        );
    }

    if (command === '!links') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🔥 Community Links')
                    .setDescription(
                        '🎥 YouTube Channel: https://www.youtube.com/@redflamingarrowliven🔮 Twitch Live: https://twitch.tv/redflamingarrow_'
                    )
            ]
        });
    }

    // ECONOMY COMMANDS
    if (command === '!bal' || command === '!balance') {
        const target = message.mentions.members.first();

        if (target) {
            if (!isStaff(message.member)) return message.reply('❌ Staff only.');
            const targetData = await getUser(target.id);
            return message.reply(`🔍 **${target.user.username}** has 🪙 **${targetData.coins}** coins.`);
        }

        return message.reply(`🪙 Balance Statement: You have **${userData.coins} coins**.`);
    }

    if (command === '!stats') {
        const target = message.mentions.members.first() || message.member;
        const data = await getUser(target.id);
        const level = Math.floor(0.1 * Math.sqrt(data.xp));

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`👤 Profile Summary: ${target.user.username} ${data.customTitle ? data.customTitle : ''}`) 
                    .addFields(
                        { name: '🪙 Coins', value: `${data.coins}`, inline: true },
                        { name: '⭐ XP', value: `${data.xp}`, inline: true },
                        { name: '📈 Level', value: `${level}`, inline: true },
                        { name: '🛡️ Active Shield', value: data.hasShield ? '✅ Yes' : '❌ No', inline: true },
                        { name: '💸 Coin Booster', value: data.hasBooster ? '✅ 2.0x Multiplier Active' : '❌ None', inline: true },
                        { name: '⚠️ Warnings Logged', value: `${data.warnings}/3 Warnings`, inline: true }
                    )
            ]
        });
    }

    if (command === '!rank') {
        const level = Math.floor(0.1 * Math.sqrt(userData.xp));
        const nextLevelXp = Math.pow((level + 1) / 0.1, 2);
        const xpNeeded = Math.ceil(nextLevelXp - userData.xp);

        return message.reply(`📈 Rank Info: ${userData.customTitle ? `${userData.customTitle} ` : ''}Level **${level}** | XP: **${userData.xp}** (You need **${xpNeeded}** more XP to level up!)`);
    }

    if (command === '!daily') {
        const timestampNow = Date.now();
        if (lastDaily[message.author.id] && timestampNow - lastDaily[message.author.id] < 86400000) {
            return message.reply('❌ You already claimed your daily coins today. Check back tomorrow!');
        }

        userData.coins += 100;
        lastDaily[message.author.id] = timestampNow;
        await userData.save();

        message.reply('📆 Daily Reward Claimed! 🪙 **+100 coins** added to your balance.');

        setTimeout(async () => {
            const resolvedUserObj = await client.users.fetch(message.author.id).catch(() => null);
            if (resolvedUserObj) {
                await resolvedUserObj.send('📆 **Daily Reset Notice:** Your daily reward timer is clear. Run `!daily` to grab your next batch of coins!').catch(() => {});
            }
        }, 86400000);
        return;
    }

    if (command === '!work') {
        const timestampNow = Date.now();
        if (lastWorked[message.author.id] && timestampNow - lastWorked[message.author.id] < 3600000) {
            return message.reply('❌ Work is on cooldown. Take a break before trying to work again.');
        }

        const standardWage = Math.floor(Math.random() * 101) + 50;
        userData.coins += standardWage;
        lastWorked[message.author.id] = timestampNow;
        await userData.save();

        message.reply(`💼 Shift finished! You worked and earned 🪙 **+${standardWage} coins**.`);

        setTimeout(async () => {
            const resolvedUserObj = await client.users.fetch(message.author.id).catch(() => null);
            if (resolvedUserObj) {
                await resolvedUserObj.send('💼 **Work Notice:** Your work cooldown has expired. You are clear to run `!work` again.').catch(() => {});
            }
        }, 3600000);
        return;
    }

    if (command === '!pay') {
        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || !amount || amount <= 0) return message.reply('❌ Invalid format. Usage: `!pay @user <amount>`');
        if (target.id === message.author.id) return message.reply('❌ Transaction Error: You cannot pay yourself.');
        if (userData.coins < amount) return message.reply('❌ You do not have enough coins to complete this transfer.');

        const targetData = await getUser(target.id);
        userData.coins -= amount;
        targetData.coins += amount;

        await userData.save();
        await targetData.save();

        return message.reply(`💸 Transfer Confirmed: Sent 🪙 **${amount}** coins to **${target.user.username}**.`);
    }

    if (command === '!leaderboard' || command === '!lb') {
        const highNetWorthRecords = await User.find().sort({ coins: -1 }).limit(10);
        const classificationLines = highNetWorthRecords.map((u, i) => `**#${i + 1}** <@${u.id}> — Balance: 🪙 ${u.coins}`).join('\n') || 'No coin data logged.';

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 Top Balances Leaderboard')
                    .setDescription(classificationLines)
            ]
        });
    }

    // COIN MARKETPLACE SHOP
    if (command === '!shop') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('🏪 FlameBot Token Shop')
                    .setDescription('Spend your coins to unlock profile enhancements and protections:')
                    .addFields(
                        { name: '💎 VIP Access Status (`!buy vip`)', value: `Price: 🪙 **${VIP_PRICE}**\nGrants exclusive access to server VIP channels.` },
                        { name: '💸 2x Passive Income Booster (`!buy booster`)', value: 'Price: 🪙 **5,000**\nPermanently doubles all coins earned from typing messages and running commands.' },
                        { name: '🎨 Custom Color Role (`!buy color <hex>`)', value: 'Price: 🪙 **15,000**\nCreates your own personal colored role (e.g., `!buy color #FF4500`).' },
                        { name: '🔮 Custom 8-Ball Option (`!buy 8ball <text>`)', value: 'Price: 🪙 **8,000**\nPermanently adds your custom text response into the global `!8ball` response pool.' },
                        { name: '🎭 Custom Profile Title (`!buy title <text>`)', value: 'Price: 🪙 **12,000**\nAppends a customized title tag onto your profile card metrics.' },
                        { name: '🛡️ Theft Protection Shield (`!buy shield`)', value: 'Price: 🪙 **3,500**\nDeploys a one-time invisible defense matrix. Blocks the next `!rob` attempt and fines the thief.' }
                    )
            ]
        });
    }

    if (command === '!buy') {
        const productKey = args[1]?.toLowerCase();
        if (!productKey) return message.reply('❌ Missing item label. Usage: `!buy <item_name> [parameters]`');

        if (productKey === 'vip') {
            if (userData.coins < VIP_PRICE) return message.reply('❌ Purchase Error: You do not have enough coins.');
            const targetRole = message.guild.roles.cache.get(VIP_ROLE_ID);
            if (!targetRole) return message.reply('❌ System Error: VIP role mapping missing from configurations.');
            try {
                await message.member.roles.add(targetRole);
                userData.coins -= VIP_PRICE;
                await userData.save();
                return message.reply('🎉 **Purchase Successful:** You unlocked the premium VIP role status.');
            } catch {
                return message.reply('❌ Permissions Error: Failed to append role to your identity card.');
            }
        }

        if (productKey === 'booster') {
            if (userData.hasBooster) return message.reply('❌ Upgrade Error: You already have an active passive multiplier booster.');
            if (userData.coins < 5000) return message.reply('❌ Purchase Error: You need 🪙 **5,000 coins** to purchase a booster.');

            userData.hasBooster = true;
            userData.coins -= 5000;
            await userData.save();
            return message.reply('💸 **Booster Purchased:** You are now earning double coins across message channels permanently.');
        }

        if (productKey === 'color') {
            const hexCodeInput = args[2];
            if (!hexCodeInput || !/^#[0-9A-F]{6}$/i.test(hexCodeInput)) return message.reply('❌ Format Error: Correct usage format: `!buy color <#HEXCODE>` (e.g., `!buy color #FF4500`)');
            if (userData.coins < 15000) return message.reply('❌ Purchase Error: You need 🪙 **15,000 coins** to change your name color.');

            try {
                userData.coins -= 15000;
                await userData.save();

                const newlyMintedRole = await message.guild.roles.create({
                    name: `🎨 Color: ${message.author.username}`,
                    color: hexCodeInput,
                    reason: 'Premium shop color acquisition.'
                });

                await message.member.roles.add(newlyMintedRole);
                return message.reply(`🎨 **Color Created:** Generated and attached your custom tint matching hex code **${hexCodeInput}**.`);
            } catch (err) {
                console.error(err);
                return message.reply('❌ API Error: Internal role creation processing failed.');
            }
        }

        if (productKey === '8ball') {
            const userStringInjection = args.slice(2).join(' ');
            if (!userStringInjection || userStringInjection.length < 3) return message.reply('❌ Argument Error: Correct parameter layout: `!buy 8ball <Your custom answer here>`');
            if (userData.coins < 8000) return message.reply('❌ Purchase Error: You need 🪙 **8,000 coins** to add an answer.');

            customEightBallAnswers.push(userStringInjection);
            userData.coins -= 8000;
            await userData.save();
            return message.reply(`🔮 **Database Injected:** Your custom phrase *"${userStringInjection}"* has been added to the 8-ball array.`);
        }

        if (productKey === 'title') {
            const alphanumericTitle = args.slice(2).join(' ');
            if (!alphanumericTitle || alphanumericTitle.length > 20) return message.reply('❌ Constraint Error: Custom profile titles cannot exceed 20 characters.');
            if (userData.coins < 12000) return message.reply('❌ Purchase Error: You need 🪙 **12,000 coins** to change your title.');

            userData.customTitle = `[${alphanumericTitle}]`;
            userData.coins -= 12000;
            await userData.save();
            return message.reply(`🎭 **Profile Title Fixed:** Your profile title is now set to **[${alphanumericTitle}]**. View it using \`!stats\`.`);
        }

        if (productKey === 'shield') {
            if (userData.hasShield) return message.reply('❌ Upgrade Error: You already have a defensive shield deployed.');
            if (userData.coins < 3500) return message.reply('❌ Purchase Error: You need 🪙 **3,500 coins** to purchase a robbery shield.');

            userData.hasShield = true;
            userData.coins -= 3500;
            await userData.save();
            return message.reply('🛡️ **Shield Deployed:** Your account balance is now protected from the next robbery attempt.');
        }

        return message.reply('❌ Item indexing error: That product does not exist. Use `!shop` to view available catalog inventory items.');
    }

    // PROPOSALS PIPELINE
    if (command === '!suggest') {
        const suggestionContent = args.slice(1).join(' ');
        if (!suggestionContent) return message.reply('❌ Argument Error: Please specify your suggestion idea. Usage: `!suggest <idea>`');

        try {
            const developmentLeadIdentity = await client.users.fetch(DEV_USER_ID);
            if (developmentLeadIdentity) {
                const suggestionTransmissionEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('🎟️ New Feature Modification Proposal')
                    .addFields(
                        { name: 'Author Profile', value: `<@${message.author.id}> (ID: \`${message.author.id}\`)`, inline: true },
                        { name: 'Source Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: 'Specifications', value: suggestionContent }
                    )
                    .setFooter({ text: 'FlameBot Pipeline Monitor' })
                    .setTimestamp();

                await developmentLeadIdentity.send({ embeds: [suggestionTransmissionEmbed] });
            }
        } catch (err) {
            console.error('Data transfer pipe crash:', err);
        }

        return message.reply('✅ **Proposal Logged:** Your suggestion packet was successfully routed to the Lead Developer inbox.');
    }

    if (command === '!approvesuggest') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        const targetedUserStringId = args[1];
        if (!targetedUserStringId) return message.reply('❌ Usage: `!approvesuggest <userId>`');

        const resolvedTargetUser = await client.users.fetch(targetedUserStringId).catch(() => null);
        if (resolvedTargetUser) {
            await resolvedTargetUser.send(`🎟️ **Proposal Approved:** An administrator reviewed and officially approved your suggestion inside **${message.guild.name}**! Thanks for your input.`).catch(() => {});
            return message.reply('✅ The user has been notified of their proposal approval.');
        }
        return message.reply('❌ Lookup Failure: Could not locate that user profile ID.');
    }

    if (command === '!rejectsuggest') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        const targetedUserStringId = args[1];
        const administrativeDenialNote = args.slice(2).join(' ') || 'No reasoning text accompanied this log entry decision.';
        if (!targetedUserStringId) return message.reply('❌ Usage: `!rejectsuggest <userId> <reason>`');

        const resolvedTargetUser = await client.users.fetch(targetedUserStringId).catch(() => null);
        if (resolvedTargetUser) {
            await resolvedTargetUser.send(`🎟️ **Proposal Turned Down:** Your suggestion for **${message.guild.name}** was reviewed and declined for the following reason:\n📝 *"${administrativeDenialNote}"*\nThanks for contributing ideas anyway!`).catch(() => {});
            return message.reply('✅ The user has been notified of their proposal rejection.');
        }
        return message.reply('❌ Lookup Failure: Could not locate that user profile ID.');
    }

    // ==========================================
    //            CASINO LOGIC MODULES           
    // ==========================================
    
    // CHAOTIC RECIPE GENERATOR
    if (command === '!bananabread') {
        const measurements = ['cups', 'tsp', 'tbsp', 'units', 'kilograms', 'drops'];
        const generateChaoticMetrics = (ingredientLabel) => {
            const numericalCoefficient = Math.floor(Math.random() * 100) + 1; 
            const randomizedUnit = measurements[Math.floor(Math.random() * measurements.length)];
            return `* 🍌 **${numericalCoefficient} ${randomizedUnit}** of ${ingredientLabel}`;
        };

        const embed = new EmbedBuilder()
            .setColor('#FFE4C4')
            .setTitle('🍌 Chaotic Banana Bread Formula')
            .setDescription('Follow this formula exactly if you want to bake banana bread:')
            .addFields(
                {
                    name: '📋 Ingredient Measurements Matrix',
                    value: [
                        generateChaoticMetrics('Matured Bananas'),
                        generateChaoticMetrics('Melted Butter Fat'),
                        generateChaoticMetrics('Baking Soda'),
                        generateChaoticMetrics('Salt Crystals'),
                        generateChaoticMetrics('Granulated Sugar'),
                        generateChaoticMetrics('Beaten Egg'),
                        generateChaoticMetrics('Vanilla Extract'),
                        generateChaoticMetrics('All-Purpose Flour')
                    ].join('\n')
                }
            )
            .setFooter({ text: 'Baking Guidelines: Standard 180°C thermal environment settings.' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!8ball') {
        const operationalInquiry = args.slice(1).join(' ');
        if (!operationalInquiry) return message.reply('🎱 Please ask a specific question.');

        const determinedIndexResult = customEightBallAnswers[Math.floor(Math.random() * customEightBallAnswers.length)];
        return message.reply(`🎱 8-Ball Prediction: **${determinedIndexResult}**`);
    }

    if (command === '!rps') {
        const handGestureInput = args[1]?.toLowerCase();
        if (!['rock', 'paper', 'scissors'].includes(handGestureInput)) {
            return message.reply('❌ Usage error. Valid parameters: `!rps rock/paper/scissors`');
        }

        const algorithmicPool = ['rock', 'paper', 'scissors'];
        const virtualCompetitorPick = algorithmicPool[Math.floor(Math.random() * algorithmicPool.length)];

        let calculationResultOutcome = 'You tied! Game drawn.';
        if (
            (handGestureInput === 'rock' && virtualCompetitorPick === 'scissors') ||
            (handGestureInput === 'paper' && virtualCompetitorPick === 'rock') ||
            (handGestureInput === 'scissors' && virtualCompetitorPick === 'paper')
        ) { 
            calculationResultOutcome = 'You won!'; 
        } else if (handGestureInput !== virtualCompetitorPick) { 
            calculationResultOutcome = 'You lost!'; 
        }

        return message.reply(`✊ You picked: **${handGestureInput}** | Bot picked: **${virtualCompetitorPick}**\n${calculationResultOutcome}`);
    }

    if (command === '!roll' || command === '!dice') {
        const numericalBoundaryLimit = cleanAmount(args[1]) || 6;
        return message.reply(`🎲 Dice roll resolved to value: **${Math.floor(Math.random() * numericalBoundaryLimit) + 1}**.`);
    }

    if (command === '!coin') {
        return message.reply(`🪙 Coin flip result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`);
    }

    if (command === '!choose') {
        const textOptionsInput = args.slice(1).join(' ');
        if (!textOptionsInput.includes('|')) return message.reply('❌ Error: Split options with a vertical separator formatting token (e.g., `!choose option A | option B`)');

        const arrayedCleanOptions = textOptionsInput.split('|').map(x => x.trim()).filter(Boolean);
        return message.reply(`🔮 Arbitrator Choice: **${arrayedCleanOptions[Math.floor(Math.random() * arrayedCleanOptions.length)]}**`);
    }

    if (command === '!poll') {
        const inquiryDescriptionText = args.slice(1).join(' ');
        if (!inquiryDescriptionText) return message.reply('❌ Survey Error: Please type out a survey description string.');

        const activePollMessageInstance = await message.channel.send(`📊 **Poll Questionnaire:** ${inquiryDescriptionText}\n✅ = Affirmative Approval\n❌ = Negative Dissent`);
        await activePollMessageInstance.react('✅');
        await activePollMessageInstance.react('❌');
        return;
    }

    if (command === '!coinflip') {
        const chosenBinaryState = args[1]?.toLowerCase();
        const assetBetQuantity = cleanAmount(args[2]);

        if (!['heads', 'tails'].includes(chosenBinaryState) || !assetBetQuantity || assetBetQuantity <= 0) {
            return message.reply('❌ Argument Layout Error. Correct syntax: `!coinflip <heads/tails> <bet>`');
        }

        if (userData.coins < assetBetQuantity) return message.reply('❌ Transaction Canceled: You do not have enough coins.');

        const randomizedVectorOutput = Math.random() > 0.5 ? 'heads' : 'tails';

        if (randomizedVectorOutput === chosenBinaryState) {
            userData.coins += assetBetQuantity;
            await userData.save();
            return message.reply(`🪙 It landed on **${randomizedVectorOutput}**! You won! **+${assetBetQuantity} coins**.`);
        }

        userData.coins -= assetBetQuantity;
        await userData.save();
        message.reply(`🪙 It landed on **${randomizedVectorOutput}**. You lost! **-${assetBetQuantity} coins**.`);

        if (assetBetQuantity >= 5000) {
            try {
                await message.author.send(`💀 **High-Risk Loss Notification:** You just lost **-${assetBetQuantity} coins** on a coinflip event inside **${message.guild.name}**.`);
            } catch {}
        }
        return;
    }

    if (command === '!blackjack' || command === '!bj') {
        const assetBetQuantity = cleanAmount(args[1]);
        if (!assetBetQuantity || assetBetQuantity <= 0 || userData.coins < assetBetQuantity) return message.reply('❌ Accounting Error: Specified bet value parameter invalid.');

        const userScoreAllocation = Math.floor(Math.random() * 11) + 10;
        const systemHouseScoreAllocation = Math.floor(Math.random() * 11) + 10;

        if (userScoreAllocation > systemHouseScoreAllocation || systemHouseScoreAllocation > 21) {
            userData.coins += assetBetQuantity;
            await userData.save();
            return message.reply(`🃏 Your score: **${userScoreAllocation}** | Dealer score: **${systemHouseScoreAllocation}**\n🎉 You won! **+${assetBetQuantity} coins**.`);
        }

        if (userScoreAllocation === systemHouseScoreAllocation) {
            return message.reply(`🃏 Your score: **${userScoreAllocation}** | Dealer score: **${systemHouseScoreAllocation}**\n🤝 Game ended in a push.`);
        }

        userData.coins -= assetBetQuantity;
        await userData.save();
        message.reply(`🃏 Your score: **${userScoreAllocation}** | Dealer score: **${systemHouseScoreAllocation}**\n💀 You lost! **-${assetBetQuantity} coins**.`);

        if (assetBetQuantity >= 5000) {
            try {
                await message.author.send(`🃏 **High-Risk Loss Notification:** Your recent blackjack hand failed, losing **-${assetBetQuantity} coins** to the house core in **${message.guild.name}**.`);
            } catch {}
        }
        return;
    }

    if (command === '!gamble') {
        const algorithmVariantMode = args[1]?.toLowerCase();
        const assetBetQuantity = cleanAmount(args[2]);

        if (!['slots', 'dice'].includes(algorithmVariantMode) || !assetBetQuantity || assetBetQuantity <= 0) {
            return message.reply('❌ Parameter layout error. System formatting structure: `!gamble slots/dice <bet>`');
        }

        if (userData.coins < assetBetQuantity) return message.reply('❌ Transaction Canceled: You do not have enough coins.');

        if (algorithmVariantMode === 'slots') {
            const visualMatrixTokens = ['🍒', '🍋', '🍇', '💎', '🔥'];
            const compilationResultRow = [
                visualMatrixTokens[Math.floor(Math.random() * visualMatrixTokens.length)],
                visualMatrixTokens[Math.floor(Math.random() * visualMatrixTokens.length)],
                visualMatrixTokens[Math.floor(Math.random() * visualMatrixTokens.length)]
            ];

            if (compilationResultRow[0] === compilationResultRow[1] && compilationResultRow[1] === compilationResultRow[2]) {
                userData.coins += assetBetQuantity * 3;
                await userData.save();
                return message.reply(`🎰 Slot Display: [ ${compilationResultRow.join(' | ')} ]\n🔥 Jackpot hit! You won **+${assetBetQuantity * 3} coins**!`);
            }

            userData.coins -= assetBetQuantity;
            await userData.save();
            message.reply(`🎰 Slot Display: [ ${compilationResultRow.join(' | ')} ]\n💀 No matches. You lost! **-${assetBetQuantity} coins**.`);

            if (assetBetQuantity >= 5000) {
                try { await message.author.send(`🎰 **High-Risk Loss Notification:** Slot configuration tokens failed to match, losing **-${assetBetQuantity} coins** in **${message.guild.name}**.`); } catch {}
            }
            return;
        }

        const resolvedDiceInteger = Math.floor(Math.random() * 6) + 1;
        if (resolvedDiceInteger >= 4) {
            userData.coins += assetBetQuantity;
            await userData.save();
            return message.reply(`🎲 Dice rolled value: **${resolvedDiceInteger}**. You won! **+${assetBetQuantity} coins**.`);
        }

        userData.coins -= assetBetQuantity;
        await userData.save();
        message.reply(`🎲 Dice rolled value: **${resolvedDiceInteger}**. You lost! **-${assetBetQuantity} coins**.`);

        if (assetBetQuantity >= 5000) {
            try { await message.author.send(`🎲 **High-Risk Loss Notification:** Dice tracking calculations resulted in a loss of **-${assetBetQuantity} coins** in balance indicators.`); } catch {}
        }
        return;
    }

    if (command === '!rob') {
        const targetIdentityReference = message.mentions.members.first();
        if (!targetIdentityReference || targetIdentityReference.id === message.author.id) return message.reply('❌ Input Error: Specified target mention profile reference invalid.');

        const timestampNow = Date.now();
        if (lastRobbed[message.author.id] && timestampNow - lastRobbed[message.author.id] < 600000) {
            return message.reply('❌ Cooldown Active: Robbery intercept matrix is charging.');
        }

        const targetedUserDataLog = await getUser(targetIdentityReference.id);
        if (targetedUserDataLog.coins < 50) return message.reply('❌ Execution Error: Target profile ledger value falls beneath minimum baseline asset metrics.');

        lastRobbed[message.author.id] = timestampNow;

        if (targetedUserDataLog.hasShield) {
            targetedUserDataLog.hasShield = false; 
            userData.coins = Math.max(0, userData.coins - 100); 
            targetedUserDataLog.coins += 100; 

            await targetedUserDataLog.save();
            await userData.save();

            try { await targetIdentityReference.send(`🛡️ **Shield Intercept Notice:** Someone tried to run a \`!rob\` script on your wallet in **${message.guild.name}**! Your protection shield absorbed the breach, blocked all theft data, and counter-fined the attacker **+100 coins** directly to your pocket parameters.`); } catch {}
            
            return message.reply(`🚨 **Shield Blocked:** You tried to rob <@${targetIdentityReference.id}>, but they had an active **Theft Protection Shield**! Your tools broke and a network counter-fine of **-100 coins** was instantly debited to their wallet profile.`);
        }

        if (Math.random() < 0.35) {
            const hijackedCapitalVolume = Math.min(targetedUserDataLog.coins, Math.floor(Math.random() * 100) + 25);
            targetedUserDataLog.coins -= hijackedCapitalVolume;
            userData.coins += hijackedCapitalVolume;
            await targetedUserDataLog.save();
            await userData.save();
            return message.reply(`🥷 Success! You managed to sneak out and rob **+${hijackedCapitalVolume} coins** from their ledger profile.`);
        }

        userData.coins = Math.max(0, userData.coins - 30);
        await userData.save();
        return message.reply('🚨 Caught! You failed the robbery attempt and were fined **-30 coins** by local enforcement logs.');
    }

    // ==========================================
    //           DISCIPLINARY MODERATION         
    // ==========================================
    if (command === '!clear' || command === '!purge') {
        if (!isStaff(message.member)) return message.reply('❌ Requires Trial Mod or superior privileges.');

        const targetedPurgeVolume = cleanAmount(args[1]);
        if (!targetedPurgeVolume || targetedPurgeVolume < 1 || targetedPurgeVolume > 100) return message.reply('❌ Clear value out of boundary ranges. Input an integer parameter between 1 and 100.');

        await message.delete().catch(() => {});
        const executedPurgeMetrics = await message.channel.bulkDelete(targetedPurgeVolume, true);

        const confirmationNoticeMessage = await message.channel.send(`🧹 Maintenance: Cleared **${executedPurgeMetrics.size}** messages from channel history text files.`);
        setTimeout(() => confirmationNoticeMessage.delete().catch(() => {}), 4000);
        return;
    }

    if (command === '!warn') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Error: Please specify target mention user format layout.');

        const targetData = await getUser(target.id);
        targetData.warnings += 1;
        await targetData.save();

        const descriptiveReasonText = args.slice(2).join(' ') || 'No clarifying tracking description text provided.';

        try { await target.send(`⚠️ **Warning Notice from ${message.guild.name}**\n📝 **Reason:** ${descriptiveReasonText}\n📊 **Tracking Stats:** Warning tracking index is at ${targetData.warnings}/3 max limit thresholds.`); } catch {}

        await message.channel.send(`⚠️ Warning Logged: ${target} has been formally issued an infraction. Count: **${targetData.warnings}/3**.`);

        const disciplinaryAuditLogsEmbed = new EmbedBuilder().setColor('#FFA500').setTitle('🚨 System Audit Log: Infraction Warning Issued').addFields({ name: 'Responsible Staff Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Offending Identity', value: `<@${target.id}>`, inline: true }, { name: 'Documented Reason Log', value: descriptiveReasonText }).setTimestamp();
        await dmServerLeadership(message.guild, disciplinaryAuditLogsEmbed);

        if (targetData.warnings >= 3) {
            if (!target.kickable) return message.channel.send('❌ Permissions Error: Target account hierarchy protection block keeps bot from executing automated kick profiles.');
            try { await target.send(`🥾 **Auto-Kick Notice:** You have been removed from **${message.guild.name}** for accumulating 3 active tracked system warnings.`); } catch {}
            await target.kick('Exceeded maximum tracking warning capacities.');
            targetData.warnings = 0;
            await targetData.save();
            return message.channel.send('🥾 Auto-Kick: User reached the max threshold boundary of 3 warnings and was expelled.');
        }
        return;
    }

    if (command === '!warnings') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Error: Please specify target mention user format layout.');

        const targetData = await getUser(target.id);
        return message.reply(`📋 Infraction Tracking: User **${target.user.username}** has **${targetData.warnings}** active warnings recorded.`);
    }

    if (command === '!clearwarns') {
        if (!isMod(message.member)) return message.reply('❌ Requires Moderator or superior roles.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Error: Please specify target mention user format layout.');

        await User.updateOne({ id: target.id }, { $set: { warnings: 0 } }, { upsert: true });
        return message.reply('✅ Warning counts reset to baseline zero variables successfully.');
    }

    if (command === '!mute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const designatedMuteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !designatedMuteRole) return message.reply('❌ Configuration Error: Target profile link or system mute role tracking ID unresolved.');
        await target.roles.add(designatedMuteRole);
        message.reply(`🤫 Communications restricted for ${target}.`);

        try { await target.send(`🤫 **Mute Notice:** Your broadcast permissions have been muted in **${message.guild.name}** by staff decision metrics.`); } catch {}
        const administrativeActionLogsEmbed = new EmbedBuilder().setColor('#FF8C00').setTitle('🤫 System Audit Log: Communication Restrictions Applied').addFields({ name: 'Responsible Staff Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Restricted Identity', value: `<@${target.id}>`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, administrativeActionLogsEmbed);
        return;
    }

    if (command === '!unmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const designatedMuteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !designatedMuteRole) return message.reply('❌ Configuration Error: Target profile link or system mute role tracking ID unresolved.');
        await target.roles.remove(designatedMuteRole);
        message.reply(`🔊 Communications restriction lifted for ${target}.`);

        try { await target.send(`🔊 **Unmute Notice:** Your text channel broadcast permissions have been restored in **${message.guild.name}**.`); } catch {}
        return;
    }

    if (command === '!tempmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const scheduledMinutesLimit = cleanAmount(args[2]);
        const designatedMuteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !scheduledMinutesLimit || !designatedMuteRole) return message.reply('❌ Parameter Layout Error. Syntax matching requirements: `!tempmute @user <minutes>`');

        await target.roles.add(designatedMuteRole);
        message.reply(`🤫 Communications restricted for ${target} for a duration window of **${scheduledMinutesLimit} minutes**.`);

        try { await target.send(`🤫 **Temporal Mute Notice:** Your broadcast permissions have been temporarily restricted in **${message.guild.name}** for **${scheduledMinutesLimit}m**.`); } catch {}

        setTimeout(async () => {
            try {
                await target.roles.remove(designatedMuteRole);
                message.channel.send(`🔊 Timer Expiration: Restricted broadcast access permissions automatically restored to ${target}.`);
                await target.send(`🔊 **Unmute Notice:** Your temporary restriction timeframe in **${message.guild.name}** has elapsed.`);
            } catch {}
        }, scheduledMinutesLimit * 60000);
        return;
    }

    if (command === '!kick') {
        if (!isMod(message.member)) return message.reply('❌ Requires Moderator or superior roles.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Error: Please specify target mention user format layout.');
        if (!target.kickable) return message.reply('❌ Core permissions limitation layer protects target identity index from bot-kick mechanics.');

        let timeModifierArg = args[2];
        let structuralHoldDuration = null;
        let indexReasonTrackingPointer = 2;

        if (timeModifierArg && (timeModifierArg.endsWith('m') || timeModifierArg.endsWith('h') || timeModifierArg.endsWith('d'))) {
            const continuousNumericalValue = parseInt(timeModifierArg);
            if (!isNaN(continuousNumericalValue)) {
                indexReasonTrackingPointer = 3;
                if (timeModifierArg.endsWith('m')) structuralHoldDuration = continuousNumericalValue * 60000;
                if (timeModifierArg.endsWith('h')) structuralHoldDuration = continuousNumericalValue * 3600000;
                if (timeModifierArg.endsWith('d')) structuralHoldDuration = continuousNumericalValue * 86400000;
            }
        }

        const explicitReasonStringLog = args.slice(indexReasonTrackingPointer).join(' ') || 'No tracking reason accompanied this action record execution file.';

        try { await target.send(`⚠️ **Expulsion Notice issued from ${message.guild.name}**\n📝 **Reason Logs:** ${explicitReasonStringLog}${structuralHoldDuration ? `\n⏱️ **Re-entry Gate Cooldown Lock:** ${timeModifierArg}` : ''}`); } catch {}

        await target.kick(explicitReasonStringLog);
        message.reply(`🥾 Expulsion finalized: User account profile **${target.user.username}** kicked from server entries.`);

        const administrativeActionLogsEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('🥾 System Audit Log: User Account Expulsion Executed').addFields({ name: 'Responsible Staff Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Expelled Identity', value: `${target.user.tag} (${target.id})`, inline: true }, { name: 'Re-entry Lock Period', value: structuralHoldDuration ? timeModifierArg : 'Immediate Return Allowed', inline: true }, { name: 'Documented Reason Log', value: explicitReasonStringLog }).setTimestamp();
        await dmServerLeadership(message.guild, administrativeActionLogsEmbed);

        if (structuralHoldDuration) {
            const cachingTargetUserObj = target.user;
            setTimeout(async () => {
                try {
                    const structuralGatewayInvite = await message.guild.channels.cache.filter(c => c.type === 0).first().createInvite({ maxAge: 86400, maxUses: 1, reason: 'Temporal re-entry lockout matrix expiration release.' });
                    await cachingTargetUserObj.send(`👋 Re-entry Update: Your kick cooldown lock inside **${message.guild.name}** has elapsed. Use this single-use link token to return: ${structuralGatewayInvite.url}`);
                } catch {}
            }, structuralHoldDuration);
        }
        return;
    }

    if (command === '!ban' || command === '!tempban') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Error: Please specify target mention user format layout.');
        if (!target.bannable) return message.reply('❌ Permissions Error: Target position rests above bot access layout restrictions.');

        let timeModifierArg = args[2];
        let structuralHoldDuration = null;
        let indexReasonTrackingPointer = 2;

        if (timeModifierArg && (timeModifierArg.endsWith('m') || timeModifierArg.endsWith('h') || timeModifierArg.endsWith('d'))) {
            const continuousNumericalValue = parseInt(timeModifierArg);
            if (!isNaN(continuousNumericalValue)) {
                indexReasonTrackingPointer = 3;
                if (timeModifierArg.endsWith('m')) structuralHoldDuration = continuousNumericalValue * 60000;
                if (timeModifierArg.endsWith('h')) structuralHoldDuration = continuousNumericalValue * 3600000;
                if (timeModifierArg.endsWith('d')) structuralHoldDuration = continuousNumericalValue * 86400000;
            }
        }

        const explicitReasonStringLog = args.slice(indexReasonTrackingPointer).join(' ') || 'No tracking reason accompanied this action record execution file.';
        const cachingTargetUserObj = target.user;

        try { await target.send(`🔨 **Network Firewall Rule Notice issued from ${message.guild.name}**\n📝 **Reason Logs:** ${explicitReasonStringLog}\n⏱️ **Ban Horizon Type:** ${structuralHoldDuration ? `Temporary Access Ban (${timeModifierArg})` : 'Permanent Identity Exclusion'}`); } catch {}

        await target.ban({ reason: explicitReasonStringLog });
        message.reply(`🔨 Firewall Lock Active: Network ban deployed against user account entry **${cachingTargetUserObj.username}**.`);

        const administrativeActionLogsEmbed = new EmbedBuilder().setColor('#8B0000').setTitle('🔨 System Audit Log: Network Ban Firewall Deployed').addFields({ name: 'Responsible Admin Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Restricted User Profile', value: `${cachingTargetUserObj.tag}`, inline: true }, { name: 'Access Hold Horizon Constraints', value: structuralHoldDuration ? `Temporary Lock (${timeModifierArg})` : 'Permanent Asset Erasure', inline: true }, { name: 'Documented Reason Log', value: explicitReasonStringLog }).setTimestamp();
        await dmServerLeadership(message.guild, administrativeActionLogsEmbed);

        if (structuralHoldDuration) {
            setTimeout(async () => {
                try {
                    const compiledBansGuildList = await message.guild.bans.fetch();
                    if (compiledBansGuildList.has(cachingTargetUserObj.id)) {
                        await message.guild.members.unban(cachingTargetUserObj.id, 'Temporary firewall exclusion lease period concluded.');
                        const structuralGatewayInvite = await message.guild.channels.cache.filter(c => c.type === 0).first().createInvite({ maxAge: 86400, maxUses: 1, reason: 'Temporal lock release link asset generation.' });
                        await cachingTargetUserObj.send(`🔓 Firewall Modification Notice: Your temporary access ban restriction rule from **${message.guild.name}** has expired. Re-entry link token available: ${structuralGatewayInvite.url}`);
                    }
                } catch {}
            }, structuralHoldDuration);
        }
        return;
    }

    if (command === '!slowmode') {
        if (!isMod(message.member)) return message.reply('❌ Requires Moderator or superior roles.');

        const rawRateLimitValue = args[1]?.toLowerCase();
        if (!rawRateLimitValue) return message.reply('❌ Parameter Layout Error. Syntax layout: `!slowmode <seconds/off>`');

        if (rawRateLimitValue === 'off') {
            await message.channel.setRateLimitPerUser(0);
            return message.reply('✅ Channel update: Message velocity restrictions removed.');
        }

        const continuousNumericalSeconds = cleanAmount(rawRateLimitValue);
        if (continuousNumericalSeconds === null || continuousNumericalSeconds < 0 || continuousNumericalSeconds > 21600) return message.reply('❌ Validation Error: Input value matches outside tracking variables.');

        await message.channel.setRateLimitPerUser(continuousNumericalSeconds);
        return message.reply(`📶 Message rate configurations locked down to **${continuousNumericalSeconds} second** intervals.`);
    }

    if (command === '!lockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Requires Moderator or superior roles.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 Channel Locked: Text frame data submission access suspended.');
    }

    if (command === '!unlockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Requires Moderator or superior roles.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.reply('🔓 Channel Unlocked: Normal baseline communication access re-established.');
    }

    // ADMINISTRATIVE FISCAL CAPITAL CONTROLS
    if (command === '!addcoins' || command === '!givecoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const target = message.mentions.members.first();
        const designatedVolume = cleanAmount(args[2]);
        if (!target || !designatedVolume || designatedVolume <= 0) return message.reply('❌ Validation error. Usage layout parameters: `!addcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $inc: { coins: designatedVolume } }, { upsert: true });
        message.reply(`💸 Capital Modification: Added 🪙 **+${designatedVolume}** coins to ${target.user.username}'s active ledger balance.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#00FF7F').setTitle('💰 Treasury System Audit Log: Balance Injection').addFields({ name: 'Responsible Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Beneficiary Account', value: `<@${target.id}>`, inline: true }, { name: 'Net Volume Injected', value: `🪙 ${designatedVolume} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!removecoins' || command === '!deductcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const target = message.mentions.members.first();
        const designatedVolume = cleanAmount(args[2]);
        if (!target || !designatedVolume || designatedVolume <= 0) return message.reply('❌ Validation error. Usage layout parameters: `!removecoins @user <amount>`');

        const targetData = await getUser(target.id);
        targetData.coins = Math.max(0, targetData.coins - designatedVolume);
        await targetData.save();

        message.reply(`📉 Capital Modification: Deducted 🪙 **-${designatedVolume}** coins from ${target.user.username}'s active ledger balance.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#FF4500').setTitle('💰 Treasury System Audit Log: Balance Extraction').addFields({ name: 'Responsible Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Account Source', value: `<@${target.id}>`, inline: true }, { name: 'Net Volume Liquidated', value: `🪙 ${designatedVolume} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!setcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const target = message.mentions.members.first();
        const designatedVolume = cleanAmount(args[2]);
        if (!target || designatedVolume === null || designatedVolume < 0) return message.reply('❌ Validation error. Usage layout parameters: `!setcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $set: { coins: designatedVolume } }, { upsert: true });
        message.reply(`🔧 Balance Configuration: Set ${target.user.username}'s ledger holding balances exactly to 🪙 **${designatedVolume}**.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#1E90FF').setTitle('💰 Treasury System Audit Log: Manual Override Set').addFields({ name: 'Responsible Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Identity Profile', value: `<@${target.id}>`, inline: true }, { name: 'Fixed Explicit Value Entry', value: `🪙 ${designatedVolume} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!resetcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Error. Usage requirements: `!resetcoins @user`');

        await User.updateOne({ id: target.id }, { $set: { coins: 0 } }, { upsert: true });
        message.reply(`🧹 Account balance metrics cleared to zero baseline markers for user profile ${target.user.username}.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#DCDCDC').setTitle('💰 Treasury System Audit Log: Balance Purge Authorized').addFields({ name: 'Responsible Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Reset Profile Identity', value: `<@${target.id}>`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!baltable' || command === '!balancetable') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const auditedAccountsArray = await User.find().sort({ coins: -1 }).limit(30);
        const compiledAuditLines = auditedAccountsArray.map((u, i) => `#${i + 1} Profile: <@${u.id}> — Value Metrics: ${u.coins}`).join('\n') || 'No initialization file registers tracked within database profiles.';

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 Centralized Server Account Asset Audit Ledger')
                    .setDescription(compiledAuditLines)
            ]
        });
    }
});

// INITIAL SYSTEM ACCESS API HANDSHAKE
if (!TOKEN) {
    console.error('❌ Launch Error: DISCORD_TOKEN configuration string completely absent.');
} else {
    client.login(TOKEN);
}
