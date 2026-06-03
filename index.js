/**
 * @file index.js
 * @description FlameBot Core Infrastructure Engine — Version 1.1
 * @author Silas Benjamin Fawcett (Nico)
 * @license Proprietary / Confidential
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

// TARGET DIRECTORIES & DISCORD IDENTIFIERS
const DEV_USER_ID = '1314033520460693635';
const LEVEL_CHANNEL_ID = '1511569329949380668';
const VIP_ROLE_ID = process.env.VIP_ROLE_ID || '1511458646348009573';
const MUTE_ROLE_ID = process.env.MUTE_ROLE_ID || '1509040670801789019';
const STREAM_PING_ROLE_ID = process.env.STREAM_PING_ROLE_ID || '1503627239713935452';
const SR_MEMBER_ROLE_ID = 'YOUR_SR_MEMBER_ROLE_ID_HERE'; // Assign when definitive ID is acquired

// ECONOMIC MATRIX PARAMS
const PREFIX = '!';
const VIP_PRICE = 10000;
const CHAT_INCOME = 5;

// CLIENT INSTANTIATION MATRIX
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

// STATIC RESOURCE ARRAYS
const customEightBallAnswers = [
    'Yes.', 'No.', 'Probably.', 'Definitely.', 'Outlook grim.', 'Ask again later.', 'Absolutely not.', 'Looks good.'
];

// COOL DOWN REGISTRIES
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
//          HTTP SERVER & DATA LINK           
// ==========================================
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('💾 Database Link Verified: MongoDB instance connected.'))
        .catch(err => console.error('❌ Database Link Failure:', err));
} else {
    console.warn('⚠️ Environment Alert: MONGO_URI missing.');
}

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('FlameBot Web Server Status: Operational');
}).listen(PORT, () => {
    console.log(`🌐 Server hosting operational on Port ${PORT}`);
});

client.once('ready', () => {
    console.log(`🔥 Integration Successful: Logged into Discord API as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
    try {
        await member.send(
            `Welcome to **${member.guild.name}**.\nPlease use the command \`${PREFIX}help\` within the server to view available commands.`
        );
    } catch {
        console.log(`Communication Exception: Unable to send direct message to ${member.user.tag}`);
    }
});

// ==========================================
//             LIVE MESSAGE DISPATCHER        
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userData = await getUser(message.author.id);

    // --- AFK STATUS MANAGEMENT ---
    if (userData.afk) {
        userData.afk = null;
        await userData.save();
        message.reply('Status Update: Welcome back. Your AFK status has been revoked.').then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }

    if (message.mentions.members.size > 0) {
        message.mentions.members.forEach(async (member) => {
            const mentionedData = await User.findOne({ id: member.id });
            if (mentionedData && mentionedData.afk) {
                message.reply(`Notice: **${member.user.username}** is currently AFK: ${mentionedData.afk}`);
            }
        });
    }

    // --- PASSIVE REVENUE & INTERACTIVE AI PARSING ---
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
            let levelMessage = `🎉 **Level Up!** <@${message.author.id}> has progressed to **Level ${newLevel}**. Granting a payout of 🪙 **+${coinPrize}** Flame Coins.`;

            if (newLevel >= 10 && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
                const srRole = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
                if (srRole) {
                    try {
                        await message.member.roles.add(srRole);
                        levelMessage += `\n🏅 **Promotion!** You have been assigned the **${srRole.name}** role for reaching the Level 10 milestone.`;
                        await message.author.send(`🏅 **Achievement Unlocked:** You have earned the **Senior Member** role in **${message.guild.name}** for maintaining active engagement.`).catch(() => {});
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

        // CONVERSATION TRACE MATRIX (Groq Analytics Check)
        if (message.content.trim().split(/\s+/).length >= 3) {
            try {
                const filterCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an advanced text analytics filter. Evaluate the input message. If the message contains inquiries, requests for documentation, analytical statements, or academic interest topics (e.g., Minecraft mechanics, systems, programming), return explicitly "TRIGGER". If the statement consists only of greetings, short casual interjections, or general conversational filler, return "IGNORE". Do not provide auxiliary remarks.'
                        },
                        { role: 'user', content: message.content }
                    ],
                    model: 'llama-3.1-8b-instant',
                    temperature: 0.1,
                    max_tokens: 10
                });

                const decision = filterCompletion.choices[0]?.message?.content?.trim().toUpperCase();

                if (decision.includes('TRIGGER')) {
                    const PASS_THRESHOLD_PERCENT = 30;
                    const evaluationRoll = Math.floor(Math.random() * 100) + 1;

                    if (evaluationRoll <= PASS_THRESHOLD_PERCENT) {
                        await message.channel.sendTyping();

                        const replyCompletion = await groq.chat.completions.create({
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are FlameBot, an advanced AI core configured for the RedFlame interactive environment. Respond articulately, intelligently, and concisely to the discussion. Maintain an engaging, direct persona. Limit your response to a maximum of two sentences.'
                                },
                                { role: 'user', content: `Contextual conversation text input: "${message.content}". Generate a corresponding response.` }
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
                console.error('Groq Text Engine Exception Logged:', err);
            }
        }
        return; 
    }

    // --- COMMAND EXECUTION ENGINE ---
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
        let cmdLevelMessage = `🎉 **Level Up!** <@${message.author.id}> has progressed to **Level ${newLevelCmd}**. Granting a payout of 🪙 **+${coinPrizeCmd}** Flame Coins.`;

        if (newLevelCmd >= 10 && !message.member.roles.cache.has(SR_MEMBER_ROLE_ID)) {
            const srRole = message.guild.roles.cache.get(SR_MEMBER_ROLE_ID);
            if (srRole) {
                try {
                    await message.member.roles.add(srRole);
                    cmdLevelMessage += `\n🏅 **Promotion!** You have been assigned the **${srRole.name}** role for reaching the Level 10 milestone.`;
                    await message.author.send(`🏅 **Achievement Unlocked:** You have earned the **Senior Member** role in **${message.guild.name}** for maintaining active engagement.`).catch(() => {});
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

    // DOCUMENTATION / HELP INTERFACE
    if (command === '!help') {
        const embed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🔥 FlameBot Directory Interface')
            .setDescription('Comprehensive index of available system modules:')
            .addFields(
                { name: '🤖 Artificial Intelligence', value: '`!ask <query>`' },
                { name: '🪙 Fiscal Economy', value: '`!bal`, `!daily`, `!work`, `!pay @user <amount>`, `!leaderboard`, `!shop`, `!buy <item>`, `!rank`' },
                { name: '🎰 Casino Operations', value: '`!blackjack <bet>`, `!coinflip <heads/tails> <bet>`, `!gamble slots/dice <bet>`, `!rob @user`' },
                { name: '🎉 Entertainment', value: '`!8ball`, `!rps`, `!roll`, `!choose`, `!coin`, `!dice`, `!poll`, `!bananabread`' },
                { name: '📊 Analytics & Metrics', value: '`!stats`, `!serverinfo`, `!whois`, `!avatar`, `!ping`, `!uptime`, `!botinfo`, `!membercount`, `!channelinfo`' },
                { name: '📣 Utilities', value: '`!links`, `!suggest`, `!afk`, `!say`, `!announce`' },
                { name: '🛡️ Administrative Staff', value: '`!staffhelp`' }
            )
            .setFooter({ text: 'FlameBot Engine Build v1.1 | Production Environment' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!staffhelp') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Failure: Restricted to server staff directories.');

        const embed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle('🛡️ Operations Command Registry')
            .addFields(
                { name: '⚠️ Moderation Controls', value: '`!warn @user <reason>`, `!warnings @user`, `!clearwarns @user`, `!mute @user`, `!unmute @user`, `!tempmute @user <mins>`, `!kick @user [time] [reason]`, `!ban @user [time] [reason]`' },
                { name: '🧹 Channel Maintenance', value: '`!clear <1-100>`, `!slowmode <seconds/off>`, `!lockchannel`, `!unlockchannel`' },
                { name: '💰 Ledger Administration', value: '`!addcoins @user <amount>`, `!removecoins @user <amount>`, `!setcoins @user <amount>`, `!resetcoins @user`, `!baltable`, `!approvesuggest <userId>`, `!rejectsuggest <userId> <reason>`' }
            );

        return message.channel.send({ embeds: [embed] });
    }

    // ARCHIVAL SNAPSHOT EXPORT
    if (command === '!backupjson') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        try {
            const users = await User.find().sort({ coins: -1 });
            const backupData = users.map(u => ({ userId: u.id, coins: u.coins, warnings: u.warnings, xp: u.xp }));
            const jsonBuffer = Buffer.from(JSON.stringify(backupData, null, 4), 'utf-8');

            return message.channel.send({
                content: '📥 **System Log: BALANCES.JSON archival snapshot generated successfully.** High-fidelity storage documents maintained.',
                files: [{ attachment: jsonBuffer, name: 'BALANCES.JSON' }]
            });
        } catch (err) {
            return message.reply('❌ Archival Error: Internal compiler failure encountered.');
        }
    }

    // ARTIFICIAL INTELLIGENCE QUERY MODULE
    if (command === '!ask') {
        const query = args.slice(1).join(' ');
        if (!query) return message.reply('❌ Argument Error: Correct syntax: `!ask <query>`');

        const processingAlert = await message.reply('🧠 Initializing neural node parameters...');
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are FlameBot, the definitive high-performance AI entity configured for the RedFlame content environment. Provide articulate, accurate, and structured information. Information Links: Twitch: https://twitch.tv/redflamingarrow_ YouTube: https://www.youtube.com/@redflamingarrowlive.' 
                    },
                    { role: 'user', content: query }
                ],
                model: 'llama-3.1-8b-instant',
                temperature: 0.5,
                max_tokens: 500
            });

            const replyText = chatCompletion.choices[0]?.message?.content || '⚠️ Analytics Alert: Failed to return token payloads.';
            return processingAlert.edit(replyText.substring(0, 1999));
        } catch (err) {
            console.error('Groq Runtime Node Exception:', err);
            return processingAlert.edit('⚠️ Processing Exception: Core module returned an execution failure.');
        }
    }

    // LATENCY & RUNTIME PERFORMANCE METRICS
    if (command === '!ping') {
        return message.reply(`🏓 API Network Latency: \`${Date.now() - message.createdTimestamp}ms\``);
    }

    if (command === '!uptime') {
        const totalSeconds = Math.floor(process.uptime());
        const runtimeHours = Math.floor(totalSeconds / 3600);
        const runtimeMinutes = Math.floor((totalSeconds % 3600) / 60);
        return message.reply(`⏱️ Engine Runtime Statistics: **${runtimeHours}h ${runtimeMinutes}m**`);
    }

    if (command === '!botinfo') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🤖 System Engine Properties')
                    .addFields(
                        { name: 'Active Guild Handlers', value: `${client.guilds.cache.size}`, inline: true },
                        { name: 'Cached Identities', value: `${client.users.cache.size}`, inline: true },
                        { name: 'Infrastructure Layer', value: 'Node.js + Discord.js + MongoDB + Render Stack' }
                    )
            ]
        });
    }

    if (command === '!serverinfo') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#32CD32')
                    .setTitle(`🏰 Guild Registry: ${message.guild.name}`)
                    .addFields(
                        { name: '👥 Verified Population', value: `${message.guild.memberCount}`, inline: true },
                        { name: '📈 Guild Premium Tier Boosts', value: `${message.guild.premiumSubscriptionCount || 0}`, inline: true },
                        { name: '🆔 Core Guild ID', value: message.guild.id }
                    )
            ]
        });
    }

    if (command === '!membercount') {
        return message.reply(`👥 Current Population Metrics: **${message.guild.memberCount} users**`);
    }

    if (command === '!whois' || command === '!userinfo') {
        const target = message.mentions.members.first() || message.member;
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle(`🔍 Identity Index: ${target.user.username}`)
                    .setThumbnail(target.user.displayAvatarURL({ size: 1024 }))
                    .addFields(
                        { name: 'Account Instantiation Date', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>` },
                        { name: 'Guild Enrollment Date', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>` },
                        { name: 'Identifier String (ID)', value: target.id }
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
                    .setTitle(`🖼️ Asset Vector: ${target.user.username}'s Avatar`)
                    .setImage(target.user.displayAvatarURL({ size: 1024 }))
            ]
        });
    }

    if (command === '!channelinfo') {
        return message.reply(
            `📺 Channel Label: **${message.channel.name}**\n🆔 Registry Identifier: \`${message.channel.id}\``
        );
    }

    if (command === '!links') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🔥 Content Platform Directories')
                    .setDescription(
                        '🎥 YouTube Network: https://www.youtube.com/@redflamingarrowliven🔮 Twitch Broadcast Hub: https://twitch.tv/redflamingarrow_'
                    )
            ]
        });
    }

    // COIN ECONOMY LEDGER INTERFACE
    if (command === '!bal' || command === '!balance') {
        const target = message.mentions.members.first();

        if (target) {
            if (!isStaff(message.member)) return message.reply('❌ Authorization Failure: Restricted to server staff hierarchies.');
            const targetData = await getUser(target.id);
            return message.reply(`🔍 Accounts Ledger: **${target.user.username}** possesses 🪙 **${targetData.coins}** Flame Coins.`);
        }

        return message.reply(`🪙 Financial Statement: Your liquidity equals **${userData.coins} Flame Coins**.`);
    }

    if (command === '!stats') {
        const target = message.mentions.members.first() || message.member;
        const data = await getUser(target.id);
        const level = Math.floor(0.1 * Math.sqrt(data.xp));

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`👤 Profile Index Summary: ${target.user.username} ${data.customTitle ? data.customTitle : ''}`) 
                    .addFields(
                        { name: '🪙 Fluid Coin Reserves', value: `${data.coins}`, inline: true },
                        { name: '⭐ Cumulative Experience (XP)', value: `${data.xp}`, inline: true },
                        { name: '📈 Structural Level', value: `${level}`, inline: true },
                        { name: '🛡️ Active Defensive Shield', value: data.hasShield ? '✅ Implemented' : '❌ Inactive', inline: true },
                        { name: '💸 Income Multiplier Status', value: data.hasBooster ? '✅ 2.0x Multiplier Deployed' : '❌ Standard Rate (1.0x)', inline: true },
                        { name: '⚠️ Disciplinary Infractions', value: `${data.warnings}/3 Warnings Logged`, inline: true }
                    )
            ]
        });
    }

    if (command === '!rank') {
        const level = Math.floor(0.1 * Math.sqrt(userData.xp));
        const nextLevelXp = Math.pow((level + 1) / 0.1, 2);
        const xpNeeded = Math.ceil(nextLevelXp - userData.xp);

        return message.reply(`📈 Progress Matrix: ${userData.customTitle ? `${userData.customTitle} ` : ''}Level **${level}** | Accumulated XP: **${userData.xp}** (Requirements: **${xpNeeded}** remaining XP until advancement)`);
    }

    if (command === '!daily') {
        const timestampNow = Date.now();
        if (lastDaily[message.author.id] && timestampNow - lastDaily[message.author.id] < 86400000) {
            return message.reply('❌ Scheduling Lockout: Your daily allocation is locked. Please check back when your 24-hour cycle completes.');
        }

        userData.coins += 100;
        lastDaily[message.author.id] = timestampNow;
        await userData.save();

        message.reply('📆 Asset Allocation: 🪙 **+100 Flame Coins** has been successfully authorized to your ledger balance.');

        setTimeout(async () => {
            const resolvedUserObj = await client.users.fetch(message.author.id).catch(() => null);
            if (resolvedUserObj) {
                await resolvedUserObj.send('📆 **Notification:** Your daily allocation cool-down matrix has concluded. Use `!daily` to authorize assets.').catch(() => {});
            }
        }, 86400000);
        return;
    }

    if (command === '!work') {
        const timestampNow = Date.now();
        if (lastWorked[message.author.id] && timestampNow - lastWorked[message.author.id] < 3600000) {
            return message.reply('❌ Operations Lockout: Work cool-down in progress. Rest computational cycles before next execution.');
        }

        const standardWage = Math.floor(Math.random() * 101) + 50;
        userData.coins += standardWage;
        lastWorked[message.author.id] = timestampNow;
        await userData.save();

        message.reply(`💼 Task Finalized: Labour completed successfully. Remittance authorized: 🪙 **${standardWage} Flame Coins**.`);

        setTimeout(async () => {
            const resolvedUserObj = await client.users.fetch(message.author.id).catch(() => null);
            if (resolvedUserObj) {
                await resolvedUserObj.send('💼 **Notification:** Labor pipelines are clear. You are cleared to re-execute the `!work` command matrix.').catch(() => {});
            }
        }, 3600000);
        return;
    }

    if (command === '!pay') {
        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || !amount || amount <= 0) return message.reply('❌ Validation Error: Correct syntax: `!pay @user <amount>`');
        if (target.id === message.author.id) return message.reply('❌ Transaction Exception: Self-transfers cannot be processed.');
        if (userData.coins < amount) return message.reply('❌ Insolvency Alert: Insufficient funds to validate balance transfer.');

        const targetData = await getUser(target.id);
        userData.coins -= amount;
        targetData.coins += amount;

        await userData.save();
        await targetData.save();

        return message.reply(`💸 Remittance Confirmed: Dispatched 🪙 **${amount}** Flame Coins directly to **${target.user.username}**.`);
    }

    if (command === '!leaderboard' || command === '!lb') {
        const highNetWorthRecords = await User.find().sort({ coins: -1 }).limit(10);
        const classificationLines = highNetWorthRecords.map((u, i) => `**Rank #${i + 1}** <@${u.id}> — Ledger Value: 🪙 ${u.coins}`).join('\n') || 'No records compiled.';

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 High-Net-Worth Asset Leaderboard')
                    .setDescription(classificationLines)
            ]
        });
    }

    // PREMIUM ITEM PROCUREMENT MARKETPLACE
    if (command === '!shop') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('🏪 FlameBot Commercial Token Marketplace')
                    .setDescription('Allocate your structural balance assets to acquire identity modifications and active parameter shielding:')
                    .addFields(
                        { name: '💎 VIP Authorization Status (`!buy vip`)', value: `Valuation: 🪙 **${VIP_PRICE}**\nAuthorizes full access to guild VIP designated channels.` },
                        { name: '💸 2x Multiplier Core Booster (`!buy booster`)', value: 'Valuation: 🪙 **5,000**\nPermanently configures all message and command coin yields to double volume.' },
                        { name: '🎨 Custom Hex Chroma Role (`!buy color <hex>`)', value: 'Valuation: 🪙 **15,000**\nCreates and instantiates a premium personalized color layer (e.g., `!buy color #FF4500`).' },
                        { name: '🔮 Predictive Pool Injected Parameter (`!buy 8ball <text>`)', value: 'Valuation: 🪙 **8,000**\nPermanently appends your custom string entry to the system oracle response database.' },
                        { name: '🎭 Vanity Identity Profile Title (`!buy title <text>`)', value: 'Valuation: 🪙 **12,000**\nAppends a permanent prefix character tag onto your statistics panel.' },
                        { name: '🛡️ Cryptographic Robbery Shielding (`!buy shield`)', value: 'Valuation: 🪙 **3,500**\nDeploys a single-use invisible counter-measure. Prevents theft data frames and triggers cross-fines.' }
                    )
            ]
        });
    }

    if (command === '!buy') {
        const productKey = args[1]?.toLowerCase();
        if (!productKey) return message.reply('❌ Parameter Error: Correct execution syntax: `!buy <item_name> [arguments]`');

        if (productKey === 'vip') {
            if (userData.coins < VIP_PRICE) return message.reply('❌ Financial Exception: Balance insufficient to meet token price valuations.');
            const targetRole = message.guild.roles.cache.get(VIP_ROLE_ID);
            if (!targetRole) return message.reply('❌ Integration Error: Server role reference identifier misconfigured.');
            try {
                await message.member.roles.add(targetRole);
                userData.coins -= VIP_PRICE;
                await userData.save();
                return message.reply('🎉 **Transaction Complete:** Premium VIP authorization vectors configured on your identity.');
            } catch {
                return message.reply('❌ Permissions Exception: Failed to alter user profile hierarchy.');
            }
        }

        if (productKey === 'booster') {
            if (userData.hasBooster) return message.reply('❌ Integrity Exception: Your profile is already operating under an active revenue multiplier core.');
            if (userData.coins < 5000) return message.reply('❌ Financial Exception: Resource requirement error. Cost: 🪙 **5,000 coins**.');

            userData.hasBooster = true;
            userData.coins -= 5000;
            await userData.save();
            return message.reply('💸 **Hardware Upgrade Confirmed:** Income multiplier core permanently set to 2.0x efficiency. 🚀');
        }

        if (productKey === 'color') {
            const hexCodeInput = args[2];
            if (!hexCodeInput || !/^#[0-9A-F]{6}$/i.test(hexCodeInput)) return message.reply('❌ Syntax Validation Error: Correct format: `!buy color <#HEXCODE>` (e.g., `!buy color #FF4500`)');
            if (userData.coins < 15000) return message.reply('❌ Financial Exception: Resource requirement error. Cost: 🪙 **15,000 coins**.');

            try {
                userData.coins -= 15000;
                await userData.save();

                const newlyMintedRole = await message.guild.roles.create({
                    name: `🎨 Tint Vector: ${message.author.username}`,
                    color: hexCodeInput,
                    reason: 'Automated procurement via premium shop interface execution.'
                });

                await message.member.roles.add(newlyMintedRole);
                return message.reply(`🎨 **Asset Generation Complete:** Instantiated and attached your personalized chroma layer matching hex code **${hexCodeInput}**.`);
            } catch (err) {
                console.error(err);
                return message.reply('❌ API Exception Encountered: Internal role matrix initialization failure.');
            }
        }

        if (productKey === '8ball') {
            const userStringInjection = args.slice(2).join(' ');
            if (!userStringInjection || userStringInjection.length < 3) return message.reply('❌ Argument Error: Correct parameter syntax: `!buy 8ball <Your custom oracle statement>`');
            if (userData.coins < 8000) return message.reply('❌ Financial Exception: Resource requirement error. Cost: 🪙 **8,000 coins**.');

            customEightBallAnswers.push(userStringInjection);
            userData.coins -= 8000;
            await userData.save();
            return message.reply(`🔮 **Database Record Alteration:** Your custom string entry *"${userStringInjection}"* has been safely recorded to local script arrays.`);
        }

        if (productKey === 'title') {
            const alphanumericTitle = args.slice(2).join(' ');
            if (!alphanumericTitle || alphanumericTitle.length > 20) return message.reply('❌ Constraint Validation Error: Title string lengths must not exceed 20 characters.');
            if (userData.coins < 12000) return message.reply('❌ Financial Exception: Resource requirement error. Cost: 🪙 **12,000 coins**.');

            userData.customTitle = `[${alphanumericTitle}]`;
            userData.coins -= 12000;
            await userData.save();
            return message.reply(`🎭 **Identity Tag Assigned:** Vanity profile string set to **[${alphanumericTitle}]**. Check visibility using \`!stats\`.`);
        }

        if (productKey === 'shield') {
            if (userData.hasShield) return message.reply('❌ System Status Alert: Active defensive shielding matrix already online.');
            if (userData.coins < 3500) return message.reply('❌ Financial Exception: Resource requirement error. Cost: 🪙 **3,500 coins**.');

            userData.hasShield = true;
            userData.coins -= 3500;
            await userData.save();
            return message.reply('🛡️ **Defensive Counter-Measure Initialized:** A secure data barrier is now active. The next transaction intercept vector initiated via `!rob` will be blocked.');
        }

        return message.reply('❌ System Directory Index Error: Catalog item key unresolved. Please cross-reference item indexes via `!shop`.');
    }

    // DEVELOPER-ROUTE SUGGESTION INBOX PORTAL
    if (command === '!suggest') {
        const suggestionContent = args.slice(1).join(' ');
        if (!suggestionContent) return message.reply('❌ Argument Validation Error: Correct syntax: `!suggest <content_proposal_string>`');

        try {
            const developmentLeadIdentity = await client.users.fetch(DEV_USER_ID);
            if (developmentLeadIdentity) {
                const suggestionTransmissionEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('🎟️ Remote Infrastructure Modification Proposal')
                    .addFields(
                        { name: 'Originating Submitter', value: `<@${message.author.id}> (ID: \`${message.author.id}\`)`, inline: true },
                        { name: 'Channel Reference Vector', value: `<#${message.channel.id}>`, inline: true },
                        { name: 'Proposed Specifications', value: suggestionContent }
                    )
                    .setFooter({ text: 'FlameBot Remote Management Pipeline Port' })
                    .setTimestamp();

                await developmentLeadIdentity.send({ embeds: [suggestionTransmissionEmbed] });
            }
        } catch (err) {
            console.error('Data Transfer Exception: Transmission to development desk terminated:', err);
        }

        return message.reply('✅ **Data Transmission Operational:** Your feature proposal packet has been securely dispatched to the Lead Developer\'s diagnostic registry for evaluation.');
    }

    if (command === '!approvesuggest') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');
        const targetedUserStringId = args[1];
        if (!targetedUserStringId) return message.reply('❌ Argument Error: Usage: `!approvesuggest <userId>`');

        const resolvedTargetUser = await client.users.fetch(targetedUserStringId).catch(() => null);
        if (resolvedTargetUser) {
            await resolvedTargetUser.send(`🎟️ **Proposal Status Notification:** An administrative audit has officially approved your feature suggestion submission within **${message.guild.name}**. We appreciate your technical insight.`).catch(() => {});
            return message.reply('✅ Automation Update: Targeted user dispatched notification of proposal authorization.');
        }
        return message.reply('❌ Lookup Failure: Unable to securely reach corresponding user objects.');
    }

    if (command === '!rejectsuggest') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');
        const targetedUserStringId = args[1];
        const administrativeDenialNote = args.slice(2).join(' ') || 'No clarifying evaluation text accompanied this decision entry.';
        if (!targetedUserStringId) return message.reply('❌ Argument Error: Usage: `!rejectsuggest <userId> <reason>`');

        const resolvedTargetUser = await client.users.fetch(targetedUserStringId).catch(() => null);
        if (resolvedTargetUser) {
            await resolvedTargetUser.send(`🎟️ **Proposal Status Notification:** Your structural feature suggestion for **${message.guild.name}** was reviewed and declined based on the following logistical criteria:\n📝 *"${administrativeDenialNote}"*\nThank you for contributing to our platform ecosystems.`).catch(() => {});
            return message.reply('✅ Automation Update: User notified of proposal decline log parameters.');
        }
        return message.reply('❌ Lookup Failure: User asset mapping data unreached.');
    }

    // ==========================================
    //            ENTERTAINMENT COMMANDS         
    // ==========================================
    
    // CHAOTIC RECIPE STRING COMPILER
    if (command === '!bananabread') {
        const measurements = ['cups', 'tsp', 'tbsp', 'units', 'kilograms', 'drops'];
        const generateChaoticMetrics = (ingredientLabel) => {
            const numericalCoefficient = Math.floor(Math.random() * 100) + 1; 
            const randomizedUnit = measurements[Math.floor(Math.random() * measurements.length)];
            return `* 🍌 **${numericalCoefficient} ${randomizedUnit}** — ${ingredientLabel}`;
        };

        const embed = new EmbedBuilder()
            .setColor('#FFE4C4')
            .setTitle('🍌 Chaotic Banana Bread Computational Formula')
            .setDescription('Execute the following procedural metrics under structural heat constraints:')
            .addFields(
                {
                    name: '📋 Requisite Components Matrix',
                    value: [
                        generateChaoticMetrics('Matured Bananas'),
                        generateChaoticMetrics('Liquefied Butter Fats'),
                        generateChaoticMetrics('Sodium Bicarbonate'),
                        generateChaoticMetrics('Sodium Chloride Crystals'),
                        generateChaoticMetrics('Granulated Sucrose Extract'),
                        generateChaoticMetrics('Homogenized Poultry Oocyte'),
                        generateChaoticMetrics('Concentrated Vanilla Extract Essence'),
                        generateChaoticMetrics('Enriched Wheat Flour Substrate')
                    ].join('\n')
                }
            )
            .setFooter({ text: 'Thermal Guidelines: 180°C Standard System Baking Parameters.' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!8ball') {
        const operationalInquiry = args.slice(1).join(' ');
        if (!operationalInquiry) return message.reply('🎱 Verification Error: Input question data parameters.');

        const determinedIndexResult = customEightBallAnswers[Math.floor(Math.random() * customEightBallAnswers.length)];
        return message.reply(`🎱 Predictive Output: **${determinedIndexResult}**`);
    }

    if (command === '!rps') {
        const handGestureInput = args[1]?.toLowerCase();
        if (!['rock', 'paper', 'scissors'].includes(handGestureInput)) {
            return message.reply('❌ Execution Error: Valid parameters: `!rps rock/paper/scissors`');
        }

        const algorithmicPool = ['rock', 'paper', 'scissors'];
        const virtualCompetitorPick = algorithmicPool[Math.floor(Math.random() * algorithmicPool.length)];

        let calculationResultOutcome = 'Evaluation: Tactical Draw Matrix.';
        if (
            (handGestureInput === 'rock' && virtualCompetitorPick === 'scissors') ||
            (handGestureInput === 'paper' && virtualCompetitorPick === 'rock') ||
            (handGestureInput === 'scissors' && virtualCompetitorPick === 'paper')
        ) { 
            calculationResultOutcome = 'Evaluation: User Victory Evaluated.'; 
        } else if (handGestureInput !== virtualCompetitorPick) { 
            calculationResultOutcome = 'Evaluation: Client Core Engine Victory.'; 
        }

        return message.reply(`✊ Client Selection: **${handGestureInput}** | Engine Node Pick: **${virtualCompetitorPick}**\n${calculationResultOutcome}`);
    }

    if (command === '!roll' || command === '!dice') {
        const numericalBoundaryLimit = cleanAmount(args[1]) || 6;
        return message.reply(`🎲 Probability Vector Resolved: Value **${Math.floor(Math.random() * numericalBoundaryLimit) + 1}**.`);
    }

    if (command === '!coin') {
        return message.reply(`🪙 Binary Vector State Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`);
    }

    if (command === '!choose') {
        const textOptionsInput = args.slice(1).join(' ');
        if (!textOptionsInput.includes('|')) return message.reply('❌ Argument Error: Utilize a parsing delimiter syntax string (e.g., `!choose option A | option B`)');

        const arrayedCleanOptions = textOptionsInput.split('|').map(x => x.trim()).filter(Boolean);
        return message.reply(`🔮 Algorithmic Arbitrator Decision: **${arrayedCleanOptions[Math.floor(Math.random() * arrayedCleanOptions.length)]}**`);
    }

    if (command === '!poll') {
        const inquiryDescriptionText = args.slice(1).join(' ');
        if (!inquiryDescriptionText) return message.reply('❌ Parameter Validation Failure: Data string required.');

        const activePollMessageInstance = await message.channel.send(`📊 **Formal Survey Metric:** ${inquiryDescriptionText}\n✅ = Affirmative Approval\n❌ = Negative Dissent`);
        await activePollMessageInstance.react('✅');
        await activePollMessageInstance.react('❌');
        return;
    }

    // ==========================================
    //           CASINO INTERFACE OPERATIONS     
    // ==========================================
    if (command === '!coinflip') {
        const chosenBinaryState = args[1]?.toLowerCase();
        const assetBetQuantity = cleanAmount(args[2]);

        if (!['heads', 'tails'].includes(chosenBinaryState) || !assetBetQuantity || assetBetQuantity <= 0) {
            return message.reply('❌ Operational Argument Error: Syntax requirements: `!coinflip <heads/tails> <bet>`');
        }

        if (userData.coins < assetBetQuantity) return message.reply('❌ Transaction Fault: Available account reserves insufficient.');

        const randomizedVectorOutput = Math.random() > 0.5 ? 'heads' : 'tails';

        if (randomizedVectorOutput === chosenBinaryState) {
            userData.coins += assetBetQuantity;
            await userData.save();
            return message.reply(`🪙 Output State: **${randomizedVectorOutput}**. Yield Adjustment: 🪙 **+${assetBetQuantity}** authorized.`);
        }

        userData.coins -= assetBetQuantity;
        await userData.save();
        message.reply(`🪙 Output State: **${randomizedVectorOutput}**. Yield Adjustment: 🪙 **-${assetBetQuantity}** executed.`);

        if (assetBetQuantity >= 5000) {
            try {
                await message.author.send(`💀 **High-Risk Financial Alert:** A massive downside transaction of 🪙 **${assetBetQuantity} coins** has compromised your ledger during a coinflip event inside **${message.guild.name}**. Balance mitigation highly advised.`);
            } catch {}
        }
        return;
    }

    if (command === '!blackjack' || command === '!bj') {
        const assetBetQuantity = cleanAmount(args[1]);
        if (!assetBetQuantity || assetBetQuantity <= 0 || userData.coins < assetBetQuantity) return message.reply('❌ Accounting Error: Specified allocation bet value invalid.');

        const userScoreAllocation = Math.floor(Math.random() * 11) + 10;
        const systemHouseScoreAllocation = Math.floor(Math.random() * 11) + 10;

        if (userScoreAllocation > systemHouseScoreAllocation || systemHouseScoreAllocation > 21) {
            userData.coins += assetBetQuantity;
            await userData.save();
            return message.reply(`🃏 User Hand Value: **${userScoreAllocation}** | Dealer Hand Value: **${systemHouseScoreAllocation}**\n🎉 Result: Capital Yield Increased by 🪙 **${assetBetQuantity}**.`);
        }

        if (userScoreAllocation === systemHouseScoreAllocation) {
            return message.reply(`🃏 User Hand Value: **${userScoreAllocation}** | Dealer Hand Value: **${systemHouseScoreAllocation}**\n🤝 Result: Capital Equivalence Push.`);
        }

        userData.coins -= assetBetQuantity;
        await userData.save();
        message.reply(`🃏 User Hand Value: **${userScoreAllocation}** | Dealer Hand Value: **${systemHouseScoreAllocation}**\n💀 Result: Capital Liquidation Deficit of 🪙 **${assetBetQuantity}**.`);

        if (assetBetQuantity >= 5000) {
            try {
                await message.author.send(`🃏 **High Roller Loss Report:** Capital extraction notice triggered. Your recent card index calculation lost 🪙 **${assetBetQuantity} coins** to the house core inside **${message.guild.name}**.`);
            } catch {}
        }
        return;
    }

    if (command === '!gamble') {
        const algorithmVariantMode = args[1]?.toLowerCase();
        const assetBetQuantity = cleanAmount(args[2]);

        if (!['slots', 'dice'].includes(algorithmVariantMode) || !assetBetQuantity || assetBetQuantity <= 0) {
            return message.reply('❌ Operational Argument Error: System parameters: `!gamble slots/dice <bet>`');
        }

        if (userData.coins < assetBetQuantity) return message.reply('❌ Transaction Fault: Available account reserves insufficient.');

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
                return message.reply(`🎰 Slot Matrix Out: [ ${compilationResultRow.join(' | ')} ]\n🔥 Structural Alignment Success! Premium Yield: 🪙 **${assetBetQuantity * 3}** assigned.`);
            }

            userData.coins -= assetBetQuantity;
            await userData.save();
            message.reply(`🎰 Slot Matrix Out: [ ${compilationResultRow.join(' | ')} ]\n💀 Structural Alignment Mismatch. Deficit: 🪙 **-${assetBetQuantity}**.`);

            if (assetBetQuantity >= 5000) {
                try { await message.author.send(`🎰 **High-Risk Exposure Alert:** Mechanical matrix verification failed to align, causing a loss of 🪙 **${assetBetQuantity} coins** in **${message.guild.name}**.`); } catch {}
            }
            return;
        }

        const resolvedDiceInteger = Math.floor(Math.random() * 6) + 1;
        if (resolvedDiceInteger >= 4) {
            userData.coins += assetBetQuantity;
            await userData.save();
            return message.reply(`🎲 Integer Value Achieved: **${resolvedDiceInteger}**. Probability Success. Authorized: 🪙 **${assetBetQuantity}**.`);
        }

        userData.coins -= assetBetQuantity;
        await userData.save();
        message.reply(`🎲 Integer Value Achieved: **${resolvedDiceInteger}**. Probability Defeat. Authorized: 🪙 **-${assetBetQuantity}**.`);

        if (assetBetQuantity >= 5000) {
            try { await message.author.send(`🎲 **Disciplinary Math Alert:** Mathematical rolling probabilities failed to resolve favorably, dropping 🪙 **${assetBetQuantity}** from your active wallet balances.`); } catch {}
        }
        return;
    }

    if (command === '!rob') {
        const targetIdentityReference = message.mentions.members.first();
        if (!targetIdentityReference || targetIdentityReference.id === message.author.id) return message.reply('❌ Security Verification Error: Designated target registry profile invalid.');

        const timestampNow = Date.now();
        if (lastRobbed[message.author.id] && timestampNow - lastRobbed[message.author.id] < 600000) {
            return message.reply('❌ Operational Lockout: Intercept matrix refresh cooldown active.');
        }

        const targetedUserDataLog = await getUser(targetIdentityReference.id);
        if (targetedUserDataLog.coins < 50) return message.reply('❌ Intercept Canceled: Target ledger value rests beneath minimal transaction values.');

        lastRobbed[message.author.id] = timestampNow;

        if (targetedUserDataLog.hasShield) {
            targetedUserDataLog.hasShield = false; 
            userData.coins = Math.max(0, userData.coins - 100); 
            targetedUserDataLog.coins += 100; 

            await targetedUserDataLog.save();
            await userData.save();

            try { await targetIdentityReference.send(`🛡️ **Defense Matrix Notification:** A remote intercept vector targeting your profile ledger inside **${message.guild.name}** was caught and neutralized. Your shield absorption cracked, fully deflected data loss, and fined the hostile actor 🪙 **100 coins**.`); } catch {}
            
            return message.reply(`🚨 **Defense Intercept Deflection:** You initiated a data raid on <@${targetIdentityReference.id}>, but your script tripped an active **Defensive Shield**. Access denied. A network feedback penalty of 🪙 **100 coins** was extracted and assigned to their account parameters.`);
        }

        if (Math.random() < 0.35) {
            const hijackedCapitalVolume = Math.min(targetedUserDataLog.coins, Math.floor(Math.random() * 100) + 25);
            targetedUserDataLog.coins -= hijackedCapitalVolume;
            userData.coins += hijackedCapitalVolume;
            await targetedUserDataLog.save();
            await userData.save();
            return message.reply(`🥷 Data Breach Validated: Successfully extracted 🪙 **${hijackedCapitalVolume} Flame Coins** from target ledger.`);
        }

        userData.coins = Math.max(0, userData.coins - 30);
        await userData.save();
        return message.reply('🚨 System Alarm Security Alert: Intrusion detected. Local enforcement fine of 🪙 **30 coins** debited.');
    }

    // ==========================================
    //           DISCIPLINARY MODERATION         
    // ==========================================
    if (command === '!clear' || command === '!purge') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Error: Requires Trial Mod or superior privileges.');

        const targetedPurgeVolume = cleanAmount(args[1]);
        if (!targetedPurgeVolume || targetedPurgeVolume < 1 || targetedPurgeVolume > 100) return message.reply('❌ Argument Range Error: Valid integer parameters fall between 1 and 100.');

        await message.delete().catch(() => {});
        const executedPurgeMetrics = await message.channel.bulkDelete(targetedPurgeVolume, true);

        const confirmationNoticeMessage = await message.channel.send(`🧹 Maintenance Complete: Purged **${executedPurgeMetrics.size}** text logs from historical cache.`);
        setTimeout(() => confirmationNoticeMessage.delete().catch(() => {}), 4000);
        return;
    }

    if (command === '!warn') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Error: Restricted to server staff directories.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Parsing Error: Specify target user mention format.');

        const targetData = await getUser(target.id);
        targetData.warnings += 1;
        await targetData.save();

        const descriptiveReasonText = args.slice(2).join(' ') || 'No clarifying evaluation text provided.';

        try { await target.send(`⚠️ **Formal Disciplinary Notice from ${message.guild.name}**\n📝 **Reason:** ${descriptiveReasonText}\n📊 **Active Infraction Track:** Index ${targetData.warnings} out of 3 maximum allowable profiles.`); } catch {}

        await message.channel.send(`⚠️ Infraction Documented: ${target} has been formally warned. Tracking: **${targetData.warnings}/3**.`);

        const disciplinaryAuditLogsEmbed = new EmbedBuilder().setColor('#FFA500').setTitle('🚨 Operational Log Entry: Disciplinary Infraction Issued').addFields({ name: 'Responsible Staff Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Offending Identity', value: `<@${target.id}>`, inline: true }, { name: 'Documented Log Basis', value: descriptiveReasonText }).setTimestamp();
        await dmServerLeadership(message.guild, disciplinaryAuditLogsEmbed);

        if (targetData.warnings >= 3) {
            if (!target.kickable) return message.channel.send('❌ Architecture Error: Target structural clearance protects identity from auto-expulsion execution.');
            try { await target.send(`🥾 **Automatic Account Expulsion Notice:** You have been automatically removed from **${message.guild.name}** for reaching the limit of 3 concurrent tracked infractions.`); } catch {}
            await target.kick('Exceeded max structural infraction capacity.');
            targetData.warnings = 0;
            await targetData.save();
            return message.channel.send('🥾 System Action: Threshold reached. Targeted identity has been auto-kicked.');
        }
        return;
    }

    if (command === '!warnings') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Error: Restricted to server staff directories.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Parsing Error: Specify target user mention format.');

        const targetData = await getUser(target.id);
        return message.reply(`📋 System Tracking Status: User **${target.user.username}** displays **${targetData.warnings}** active warning counts.`);
    }

    if (command === '!clearwarns') {
        if (!isMod(message.member)) return message.reply('❌ Authorization Error: Restricted to Moderator or superior roles.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Parsing Error: Specify target user mention format.');

        await User.updateOne({ id: target.id }, { $set: { warnings: 0 } }, { upsert: true });
        return message.reply('✅ Ledger Cleared: User disciplinary logging tracking counters reset to zero values.');
    }

    if (command === '!mute') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Error: Restricted to server staff directories.');

        const target = message.mentions.members.first();
        const designatedMuteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !designatedMuteRole) return message.reply('❌ Operational Error: Target identity reference or system mute role mapping missing.');
        await target.roles.add(designatedMuteRole);
        message.reply(`🤫 Disciplinary Status: Communications restriction layer attached to ${target}.`);

        try { await target.send(`🤫 **System Communications Warning:** Your communication access has been restricted in **${message.guild.name}** by administrative decision.`); } catch {}
        const administrativeActionLogsEmbed = new EmbedBuilder().setColor('#FF8C00').setTitle('🤫 Operational Log Entry: Communications Terminated').addFields({ name: 'Enforcing Staff Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Restricted Identity', value: `<@${target.id}>`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, administrativeActionLogsEmbed);
        return;
    }

    if (command === '!unmute') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Error: Restricted to server staff directories.');

        const target = message.mentions.members.first();
        const designatedMuteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !designatedMuteRole) return message.reply('❌ Operational Error: Target identity reference or system mute role mapping missing.');
        await target.roles.remove(designatedMuteRole);
        message.reply(`🔊 Disciplinary Status: Communications restriction layer detached from ${target}.`);

        try { await target.send(`🔊 **System Communications Notice:** Your broadcast permissions have been restored in **${message.guild.name}**.`); } catch {}
        return;
    }

    if (command === '!tempmute') {
        if (!isStaff(message.member)) return message.reply('❌ Authorization Error: Restricted to server staff directories.');

        const target = message.mentions.members.first();
        const scheduledMinutesLimit = cleanAmount(args[2]);
        const designatedMuteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !scheduledMinutesLimit || !designatedMuteRole) return message.reply('❌ Operational Argument Error: Usage syntax: `!tempmute @user <minutes>`');

        await target.roles.add(designatedMuteRole);
        message.reply(`🤫 Disciplinary Status: Communications tracking restriction applied to ${target} for **${scheduledMinutesLimit}m**.`);

        try { await target.send(`🤫 **System Communications Warning:** Your broadcast access has been restricted in **${message.guild.name}** for a timeframe spanning **${scheduledMinutesLimit} minutes**.`); } catch {}

        setTimeout(async () => {
            try {
                await target.roles.remove(designatedMuteRole);
                message.channel.send(`🔊 System Timer Expiration: Restricted role profile detached automatically from ${target}.`);
                await target.send(`🔊 **System Communications Notice:** Your temporal restriction interval in **${message.guild.name}** has elapsed.`);
            } catch {}
        }, scheduledMinutesLimit * 60000);
        return;
    }

    if (command === '!kick') {
        if (!isMod(message.member)) return message.reply('❌ Authorization Error: Restricted to Moderator or superior roles.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Parsing Error: Specify target user mention format.');
        if (!target.kickable) return message.reply('❌ Protection Error: Core API permissions layout prevents execution against target node.');

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

        const explicitReasonStringLog = args.slice(indexReasonTrackingPointer).join(' ') || 'No clarifying evaluation text provided.';

        try { await target.send(`⚠️ **Account Expulsion Documented from ${message.guild.name}**\n📝 **Basis Criteria:** ${explicitReasonStringLog}${structuralHoldDuration ? `\n⏱️ **Re-entry Cooldown Window:** ${timeModifierArg}` : ''}`); } catch {}

        await target.kick(explicitReasonStringLog);
        message.reply(`🥾 Expulsion Complete: Successfully detached **${target.user.username}** from guild directories.`);

        const administrativeActionLogsEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('🥾 Operational Log Entry: Account Expulsion Executed').addFields({ name: 'Enforcing Staff Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Account Identity', value: `${target.user.tag} (${target.id})`, inline: true }, { name: 'Temporal Lockout Threshold', value: structuralHoldDuration ? timeModifierArg : 'None Deployed', inline: true }, { name: 'Documented Log Basis', value: explicitReasonStringLog }).setTimestamp();
        await dmServerLeadership(message.guild, administrativeActionLogsEmbed);

        if (structuralHoldDuration) {
            const cachingTargetUserObj = target.user;
            setTimeout(async () => {
                try {
                    const structuralGatewayInvite = await message.guild.channels.cache.filter(c => c.type === 0).first().createInvite({ maxAge: 86400, maxUses: 1, reason: 'Temporal re-entry gateway lock expiration release.' });
                    await cachingTargetUserObj.send(`👋 System Update: Your temporary expulsion lock for **${message.guild.name}** has cleared. You may return via this unique single-use link token: ${structuralGatewayInvite.url}`);
                } catch {}
            }, structuralHoldDuration);
        }
        return;
    }

    if (command === '!ban' || command === '!tempban') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Target Parsing Error: Specify target user mention format.');
        if (!target.bannable) return message.reply('❌ Protection Error: Core API permissions layout prevents server ban execution against target node.');

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

        const explicitReasonStringLog = args.slice(indexReasonTrackingPointer).join(' ') || 'No clarifying evaluation text provided.';
        const cachingTargetUserObj = target.user;

        try { await target.send(`🔨 **Network Ban Notice issued from ${message.guild.name}**\n📝 **Basis Criteria:** ${explicitReasonStringLog}\n⏱️ **Access Lock Horizon Type:** ${structuralHoldDuration ? `Temporary Ban Condition (${timeModifierArg})` : 'Permanent Account Exclusion Lifecycle'}`); } catch {}

        await target.ban({ reason: explicitReasonStringLog });
        message.reply(`🔨 Firewall Rule Implemented: Network ban successfully issued against **${cachingTargetUserObj.username}**.`);

        const administrativeActionLogsEmbed = new EmbedBuilder().setColor('#8B0000').setTitle('🔨 Operational Log Entry: Firewall Network Ban Deployed').addFields({ name: 'Enforcing Admin Officer', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Restrained User', value: `${cachingTargetUserObj.tag}`, inline: true }, { name: 'Horizon Constraint', value: structuralHoldDuration ? `Temporary Lockout (${timeModifierArg})` : 'Permanent Profile Erasure', inline: true }, { name: 'Documented Log Basis', value: explicitReasonStringLog }).setTimestamp();
        await dmServerLeadership(message.guild, administrativeActionLogsEmbed);

        if (structuralHoldDuration) {
            setTimeout(async () => {
                try {
                    const compiledBansGuildList = await message.guild.bans.fetch();
                    if (compiledBansGuildList.has(cachingTargetUserObj.id)) {
                        await message.guild.members.unban(cachingTargetUserObj.id, 'Temporal network ban lease configuration elapsing.');
                        const structuralGatewayInvite = await message.guild.channels.cache.filter(c => c.type === 0).first().createInvite({ maxAge: 86400, maxUses: 1, reason: 'Temporal lock release access invite generation.' });
                        await cachingTargetUserObj.send(`🔓 System Firewall Update: Your temporary network ban window from **${message.guild.name}** has elapsed. Access authorization reinstated. Join link: ${structuralGatewayInvite.url}`);
                    }
                } catch {}
            }, structuralHoldDuration);
        }
        return;
    }

    if (command === '!slowmode') {
        if (!isMod(message.member)) return message.reply('❌ Authorization Error: Restricted to Moderator or superior roles.');

        const rawRateLimitValue = args[1]?.toLowerCase();
        if (!rawRateLimitValue) return message.reply('❌ Argument Error: Usage syntax: `!slowmode <seconds/off>`');

        if (rawRateLimitValue === 'off') {
            await message.channel.setRateLimitPerUser(0);
            return message.reply('✅ Channel Adjustment: Message velocity limits disabled.');
        }

        const continuousNumericalSeconds = cleanAmount(rawRateLimitValue);
        if (continuousNumericalSeconds === null || continuousNumericalSeconds < 0 || continuousNumericalSeconds > 21600) return message.reply('❌ Validation Error: Input value integer falls out of bounds.');

        await message.channel.setRateLimitPerUser(continuousNumericalSeconds);
        return message.reply(`📶 Channel Velocity Throttled: Data frame intervals fixed to **${continuousNumericalSeconds} seconds**.`);
    }

    if (command === '!lockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Authorization Error: Restricted to Moderator or superior roles.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 Channel Lock: Text frame injection access revoked from baseline role groups.');
    }

    if (command === '!unlockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Authorization Error: Restricted to Moderator or superior roles.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.reply('🔓 Channel Lock Revocation: Broadcast privileges re-established to baseline role groups.');
    }

    // ADMINISTRATIVE FISCAL CAPITAL CONTROLS
    if (command === '!addcoins' || command === '!givecoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        const target = message.mentions.members.first();
        const designatedVolume = cleanAmount(args[2]);
        if (!target || !designatedVolume || designatedVolume <= 0) return message.reply('❌ Validation Error: Syntax configuration: `!addcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $inc: { coins: designatedVolume } }, { upsert: true });
        message.reply(`💸 Treasury Mint Authorized: Distributed 🪙 **${designatedVolume}** Flame Coins to ${target.user.username}'s profile ledger.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#00FF7F').setTitle('💰 Central Ledger Injection System Log').addFields({ name: 'Executing Financial Admin', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Beneficiary Account', value: `<@${target.id}>`, inline: true }, { name: 'Total Volume Distributed', value: `🪙 ${designatedVolume} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!removecoins' || command === '!deductcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        const target = message.mentions.members.first();
        const designatedVolume = cleanAmount(args[2]);
        if (!target || !designatedVolume || designatedVolume <= 0) return message.reply('❌ Validation Error: Syntax configuration: `!removecoins @user <amount>`');

        const targetData = await getUser(target.id);
        targetData.coins = Math.max(0, targetData.coins - designatedVolume);
        await targetData.save();

        message.reply(`📉 Liquidation Confirmed: Extracted 🪙 **${designatedVolume}** Flame Coins from ${target.user.username}'s profile ledger.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#FF4500').setTitle('💰 Central Ledger Capital Extraction System Log').addFields({ name: 'Executing Financial Admin', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Asset Account Source', value: `<@${target.id}>`, inline: true }, { name: 'Total Volume Liquidated', value: `🪙 ${designatedVolume} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!setcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        const target = message.mentions.members.first();
        const designatedVolume = cleanAmount(args[2]);
        if (!target || designatedVolume === null || designatedVolume < 0) return message.reply('❌ Validation Error: Syntax configuration: `!setcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $set: { coins: designatedVolume } }, { upsert: true });
        message.reply(`🔧 Balance Modification Authorized: Overwrote ${target.user.username}'s structural asset holdings value to 🪙 **${designatedVolume}**.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#1E90FF').setTitle('💰 Central Ledger Value Override System Log').addFields({ name: 'Executing Financial Admin', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Asset Account Source', value: `<@${target.id}>`, inline: true }, { name: 'New Explicit Ledger Value Fixed', value: `🪙 ${designatedVolume} Flame Coins`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!resetcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Validation Error: Syntax requirement: `!resetcoins @user`');

        await User.updateOne({ id: target.id }, { $set: { coins: 0 } }, { upsert: true });
        message.reply(`🧹 Accounts Purge Authorized: Asset metrics cleared to baseline zero parameters for ${target.user.username}.`);

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#DCDCDC').setTitle('💰 Central Ledger Account Asset Erasure Log').addFields({ name: 'Executing Financial Admin', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Reset Identity Profile', value: `<@${target.id}>`, inline: true }).setTimestamp();
        await dmServerLeadership(message.guild, secretLedgerAuditLogsEmbed);
        return;
    }

    if (command === '!baltable' || command === '!balancetable') {
        if (!isAdmin(message.member)) return message.reply('❌ Access Denied: Administrator clearance mandatory.');

        const auditedAccountsArray = await User.find().sort({ coins: -1 }).limit(30);
        const compiledAuditLines = auditedAccountsArray.map((u, i) => `#${i + 1} User: <@${u.id}> — Verified Holdings: ${u.coins}`).join('\n') || 'No database user files currently initialized.';

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 Centralized Internal Revenue Audit Ledger')
                    .setDescription(compiledAuditLines)
            ]
        });
    }
});

// INITIAL API GATEWAY HANDSHAKE LOGIC
if (!TOKEN) {
    console.error('❌ Critical Launch Failure: DISCORD_TOKEN is absent from system environment records.');
} else {
    client.login(TOKEN);
}
