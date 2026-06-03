/**
 * @file index.js
 * @description FlameBot Core Engine — Version 1.8 (FlameCore Streamlined Build - Casino Restored)
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

// RE-ADJUSTED INFLATION PRICING MATRIX
const VIP_PRICE = 75000;
const BOOSTER_PRICE = 35000;
const COLOR_PRICE = 50000;
const ORACLE_PRICE = 25000;
const TITLE_PRICE = 40000;
const SHIELD_PRICE = 15000;

// SYSTEM STATE MATRIX
let systemLogsEnabled = true; 

// ECONOMY PARAMS
const PREFIX = '!';
const CHAT_INCOME = 5;
const CASINO_COOLDOWN = 30000; 

// MULTI-CHOICE PREDICTION SYSTEM STATE
let activePoll = null; 

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
    hasShield: { type: Boolean, default: false },
    portfolios: { type: Map, of: Number, default: {} } 
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
    if (!user.portfolios) user.portfolios = new Map();
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

function cleanFloat(value) {
    const f = parseFloat(value);
    return Number.isFinite(f) ? f : null;
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
    res.end('FlameBot Core is online');
}).listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

client.once('ready', () => {
    console.log(`🔥 FlameBot Core logged in as ${client.user.tag}`);
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
    //         ANTI-GAMBLESPAM INTERCEPTOR        
    // ==========================================
    if (['!coinflip', '!blackjack', '!bj', '!gamble', '!rob'].includes(command)) {
        const timestampNow = Date.now();
        const userCasinoRecord = lastGambled[message.author.id];

        if (userCasinoRecord && (timestampNow - userCasinoRecord < CASINO_COOLDOWN)) {
            const timeRemainingSeconds = Math.ceil((CASINO_COOLDOWN - (timestampNow - userCasinoRecord)) / 1000);
            return message.reply(`❌ Stop spamming the casino. You have to wait **${timeRemainingSeconds} seconds** before gambling again.`);
        }
    }

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
                { name: '🗳️ Predictions', value: '`!bet <choice_number> <amount>`' },
                { name: '🪙 Economy', value: '`!bal`, `!daily`, `!work`, `!pay @user <amount>`, `!leaderboard`, `!shop`, `!buy <item>`, `!rank`' },
                { name: '🎰 Casino (30s Cooldown)', value: '`!blackjack <bet>`, `!coinflip <heads/tails> <bet>`, `!gamble slots/dice <bet>`, `!rob @user`' },
                { name: '🎉 Fun', value: '`!8ball`, `!rps`, `!roll`, `!choose`, `!coin`, `!dice`, `!poll`, `!bananabread`' },
                { name: '📊 Info & Stats', value: '`!stats`, `!serverinfo`, `!whois`, `!avatar`, `!ping`, `!uptime`, `!botinfo`, `!membercount`, `!channelinfo`' },
                { name: '📣 Utilities', value: '`!links`, `!suggest`, `!afk`, `!say`, `!announce`' },
                { name: '🛡️ Staff Only', value: '`!staffhelp`' }
            )
            .setFooter({ text: 'FlameBot | Version 1.8 (Core Build)' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!staffhelp') {
        if (!isStaff(message.member)) return message.reply('❌ You do not have permission to use staff commands.');

        const embed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle('🛡️ Staff Command Directory')
            .addFields(
                { name: '🗳️ Predictions Management', value: '`!openpoll <item 1> | <item 2> | ...`, `!endpoll <winning_number>`' },
                { name: '⚠️ Moderation', value: '`!warn @user <reason>`, `!warnings @user`, `!clearwarns @user`, `!mute @user`, `!unmute @user`, `!tempmute @user <mins>`, `!kick @user [time] [reason]`, `!ban @user [time] [reason]`' },
                { name: '🧹 Channel Controls', value: '`!clear <1-100>`, `!slowmode <seconds/off>`, `!lockchannel`, `!unlockchannel`' },
                { name: '💰 Economy Admin', value: '`!addcoins @user <amount>`, `!removecoins @user <amount>`, `!setcoins @user <amount>`, `!resetcoins @user`, `!baltable`, `!approvesuggest <userId>`, `!rejectsuggest <userId> <reason>`' },
                { name: '⚙️ Logging Controls', value: '`!enablelogs`, `!disablelogs`' }
            );

        return message.channel.send({ embeds: [embed] });
    }

    // ==========================================
    //      MULTI-CHOICE PREDICTION COMMANDS      
    // ==========================================
    if (command === '!openpoll') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        
        const rawContent = args.slice(1).join(' ');
        if (!rawContent || !rawContent.includes('|')) {
            return message.reply('❌ Usage: `!openpoll Option One | Option Two | Option Three`');
        }

        const choiceOptions = rawContent.split('|').map(item => item.trim()).filter(Boolean);
        if (choiceOptions.length < 2) return message.reply('❌ You need at least 2 distinct choices to open a poll.');
        if (choiceOptions.length > 10) return message.reply('❌ Maximized boundary limit error. You cannot exceed 10 choices.');

        const multiplierX = choiceOptions.length * 1.5;

        activePoll = {
            choices: choiceOptions,
            multiplier: multiplierX,
            wagers: {} 
        };

        const displayLines = choiceOptions.map((text, index) => `**[${index + 1}]** — ${text}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#1E90FF')
            .setTitle('🗳️ Active Prediction Matrix Opened!')
            .setDescription(`Place your bets on the correct outcome!\n\n${displayLines}\n\n✨ **Winning Payout Multiplier:** \`${multiplierX}x\` your bet amount!`)
            .setFooter({ text: `Usage: !bet <choice_number> <amount> (e.g. !bet 1 250)` });

        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!bet') {
        if (!activePoll) return message.reply('❌ There is no active prediction poll running right now.');
        
        const choiceNumber = cleanAmount(args[1]);
        const betAmount = cleanAmount(args[2]);

        if (!choiceNumber || !betAmount || betAmount <= 0) {
            return message.reply('❌ Usage layout: `!bet <choice_number> <amount>`');
        }

        const structuralIndex = choiceNumber - 1;
        if (structuralIndex < 0 || structuralIndex >= activePoll.choices.length) {
            return message.reply(`❌ Invalid choice. Please pick an integer choice number between 1 and ${activePoll.choices.length}.`);
        }

        if (userData.coins < betAmount) return message.reply(`❌ Insolvent. You don't have enough coins to place a ${betAmount} coin bet.`);

        userData.coins -= betAmount;
        await userData.save();

        if (!activePoll.wagers[message.author.id]) {
            activePoll.wagers[message.author.id] = [];
        }

        activePoll.wagers[message.author.id].push({
            choiceIndex: structuralIndex,
            amount: betAmount
        });

        return message.reply(`✅ **Bet Registered:** You put 🪙 **${betAmount} coins** on option **[${choiceNumber}]**: *"${activePoll.choices[structuralIndex]}"*.`);
    }

    if (command === '!endpoll') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        if (!activePoll) return message.reply('❌ There is no active prediction poll to end.');

        const winningNumber = cleanAmount(args[1]);
        if (!winningNumber) return message.reply('❌ Usage layout: `!endpoll <winning_choice_number>`');

        const winningIndex = winningNumber - 1;
        if (winningIndex < 0 || winningIndex >= activePoll.choices.length) {
            return message.reply(`❌ Option bounds error. The selection must match a valid number option inside 1 to ${activePoll.choices.length}.`);
        }

        const textLabelString = activePoll.choices[winningIndex];
        const fixedMultiplier = activePoll.multiplier;
        let distributedWinnersCount = 0;
        let netPayoutVolume = 0;

        for (const [userId, userBetsArray] of Object.entries(activePoll.wagers)) {
            let userTotalWinnings = 0;

            userBetsArray.forEach(bet => {
                if (bet.choiceIndex === winningIndex) {
                    userTotalWinnings += Math.floor(bet.amount * fixedMultiplier);
                }
            });

            if (userTotalWinnings > 0) {
                await User.updateOne({ id: userId }, { $inc: { coins: userTotalWinnings } });
                distributedWinnersCount++;
                netPayoutVolume += userTotalWinnings;
            }
        }

        message.channel.send(`🎉 **Prediction Finalized!** The winning outcome is **[${winningNumber}]**: *"${textLabelString}"*.\n💰 All correct entries received a return multiplier of **${fixedMultiplier}x**!\nDispatched 🪙 **${netPayoutVolume} total coins** across **${distributedWinnersCount} winners**.`);
        
        activePoll = null; 
        return;
    }

    // ==========================================
    //               🎰 CASINO SYSTEMS 🎰        
    // ==========================================
    
    // COINFLIP
    if (command === '!coinflip' || command === '!cf') {
        const side = args[1]?.toLowerCase();
        const bet = cleanAmount(args[2]);

        if (!['heads', 'tails'].includes(side) || !bet || bet <= 0) {
            return message.reply('❌ Usage: `!coinflip <heads/tails> <bet_amount>`');
        }
        if (userData.coins < bet) return message.reply('❌ You do not have enough coins.');

        lastGambled[message.author.id] = Date.now();
        const result = Math.random() < 0.5 ? 'heads' : 'tails';

        if (side === result) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🪙 The coin landed on **${result}**! You **WON** 🪙 **${bet}** coins!`);
        } else {
            userData.coins -= bet;
            await userData.save();
            return message.reply(`🪙 The coin landed on **${result}**! You **LOST** 🪙 **${bet}** coins.`);
        }
    }

    // BLACKJACK
    if (command === '!blackjack' || command === '!bj') {
        const bet = cleanAmount(args[1]);
        if (!bet || bet <= 0) return message.reply('❌ Usage: `!blackjack <bet_amount>`');
        if (userData.coins < bet) return message.reply('❌ Insolvent balance.');

        lastGambled[message.author.id] = Date.now();
        
        const playerVal = Math.floor(Math.random() * 10) + 12; // 12-21
        const dealerVal = Math.floor(Math.random() * 10) + 12; // 12-21

        if (playerVal > 21) {
            userData.coins -= bet;
            await userData.save();
            return message.reply(`🃏 You drew **${playerVal}** and busted! House wins. Lost 🪙 **${bet}**.`);
        }
        if (dealerVal > 21 || playerVal > dealerVal) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🃏 Your hand: **${playerVal}** | Dealer hand: **${dealerVal}**. You **WIN** 🪙 **${bet}** coins!`);
        } else if (playerVal === dealerVal) {
            return message.reply(`🃏 Push! Both you and the dealer got **${playerVal}**. Bet returned.`);
        } else {
            userData.coins -= bet;
            await userData.save();
            return message.reply(`🃏 Your hand: **${playerVal}** | Dealer hand: **${dealerVal}**. House wins. Lost 🪙 **${bet}**.`);
        }
    }

    // SLOTS / DICE GAMBLE MODULE
    if (command === '!gamble') {
        const mode = args[1]?.toLowerCase();
        const bet = cleanAmount(args[2]);

        if (!['slots', 'dice'].includes(mode) || !bet || bet <= 0) {
            return message.reply('❌ Usage: `!gamble <slots/dice> <bet_amount>`');
        }
        if (userData.coins < bet) return message.reply('❌ Insolvent balance lines.');

        lastGambled[message.author.id] = Date.now();

        if (mode === 'dice') {
            const userRoll = Math.floor(Math.random() * 6) + 1;
            const botRoll = Math.floor(Math.random() * 6) + 1;

            if (userRoll > botRoll) {
                userData.coins += bet;
                await userData.save();
                return message.reply(`🎲 You rolled a **${userRoll}**! FlameBot rolled a **${botRoll}**. You **WIN** 🪙 **${bet}** coins!`);
            } else if (userRoll === botRoll) {
                return message.reply(`🎲 Draw! Both rolled a **${userRoll}**. Stash saved.`);
            } else {
                userData.coins -= bet;
                await userData.save();
                return message.reply(`🎲 You rolled a **${userRoll}**! FlameBot rolled a **${botRoll}**. You **LOST** 🪙 **${bet}** coins.`);
            }
        }

        if (mode === 'slots') {
            const symbols = ['🍒', '🍋', '🍇', '💎', '🔥'];
            const s1 = symbols[Math.floor(Math.random() * symbols.length)];
            const s2 = symbols[Math.floor(Math.random() * symbols.length)];
            const s3 = symbols[Math.floor(Math.random() * symbols.length)];

            const visual = `[ ${s1} | ${s2} | ${s3} ]`;

            if (s1 === s2 && s2 === s3) {
                const payout = bet * 4;
                userData.coins += payout;
                await userData.save();
                return message.reply(`🎰 ${visual} JACKPOT! Triple matching line! You won 🪙 **+${payout}** coins!`);
            } else if (s1 === s2 || s2 === s3 || s1 === s3) {
                const payout = Math.floor(bet * 1.5);
                userData.coins += payout;
                await userData.save();
                return message.reply(`🎰 ${visual} Mid Double Match! You won 🪙 **+${payout}** coins.`);
            } else {
                userData.coins -= bet;
                await userData.save();
                return message.reply(`🎰 ${visual} No matches. You lost 🪙 **-${bet}** coins.`);
            }
        }
    }

    // ROB / ROBBERY SYSTEM
    if (command === '!rob') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Usage: `!rob @user`');
        if (target.id === message.author.id) return message.reply('❌ You cannot rob yourself, bro.');

        const targetData = await getUser(target.id);
        if (targetData.coins < 200) return message.reply('❌ Leave them alone, they are down bad right now (less than 200 coins).');
        if (userData.coins < 100) return message.reply('❌ You need at least 100 coins in your pocket to attempt a heist.');

        lastGambled[message.author.id] = Date.now(); // Applies global casino speed trap filter

        // SHIELD PROTECTION INTERCEPTOR BLOCK
        if (targetData.hasShield) {
            targetData.hasShield = false; // Breach shield layer variables
            
            const penaltyFine = Math.min(userData.coins, 250);
            userData.coins -= penaltyFine;
            targetData.coins += penaltyFine;

            await userData.save();
            await targetData.save();

            return message.reply(`🛡️ **COUNTERED!** ${target.user.username} had a active **Theft Protection Shield** active! You failed the operation, got fined, and paid them 🪙 **${penaltyFine} coins** as restitution.`);
        }

        const successChance = Math.random() < 0.45; // 45% chance rate efficiency

        if (successChance) {
            const stealPercentage = (Math.random() * 0.25) + 0.10; // Steal between 10% - 35%
            const hijackedCapital = Math.floor(targetData.coins * stealPercentage);

            targetData.coins -= hijackedCapital;
            userData.coins += hijackedCapital;

            await userData.save();
            await targetData.save();

            return message.reply(`🥷 **HEIST SUCCESSFUL:** You successfully pickpocketed ${target} and ran off with 🪙 **+${hijackedCapital} coins**!`);
        } else {
            const penaltyFine = Math.floor(userData.coins * 0.15) || 50; // Dropped 15% wallet capacities
            userData.coins = Math.max(0, userData.coins - penaltyFine);
            await userData.save();

            return message.reply(`🚨 **HEIST FAILED:** You tripped the alarms trying to bypass security lines and dropped 🪙 **-${penaltyFine} coins** running from mod cops.`);
        }
    }

    // ==========================================
    //         FUN / CASUAL COMMAND MODULES       
    // ==========================================
    if (command === '!8ball') {
        const phrase = args.slice(1).join(' ');
        if (!phrase) return message.reply('❌ Ask me a question first.');
        const out = customEightBallAnswers[Math.floor(Math.random() * customEightBallAnswers.length)];
        return message.reply(`🔮 **8-Ball Response:** ${out}`);
    }

    if (command === '!rps') {
        const choice = args[1]?.toLowerCase();
        if (!['rock', 'paper', 'scissors'].includes(choice)) return message.reply('❌ Pick `rock`, `paper`, or `scissors`.');
        const options = ['rock', 'paper', 'scissors'];
        const enginePick = options[Math.floor(Math.random() * options.length)];
        if (choice === enginePick) return message.reply(`👔 Push! Both picked **${choice}**.`);
        if ((choice === 'rock' && enginePick === 'scissors') || (choice === 'paper' && enginePick === 'rock') || (choice === 'scissors' && enginePick === 'paper')) {
            return message.reply(`🎉 Winner! Your **${choice}** breaks FlameBot's **${enginePick}**.`);
        } else {
            return message.reply(`❌ L! FlameBot's **${enginePick}** smashes your **${choice}**.`);
        }
    }

    if (command === '!roll') {
        const bound = cleanAmount(args[1]) || 100;
        return message.reply(`🎲 Random Outcome: You rolled a **${Math.floor(Math.random() * bound) + 1}** inside max frame limits (1-${bound}).`);
    }

    if (command === '!choose') {
        const inputs = args.slice(1).join(' ').split('|').map(x => x.trim()).filter(Boolean);
        if (inputs.length < 2) return message.reply('❌ Give me multiple elements separated with a pipe `|`.');
        return message.reply(`🤔 Choice Picker: I select *"${inputs[Math.floor(Math.random() * inputs.length)]}"*.`);
    }

    if (command === '!coin') {
        return message.reply(`🪙 Flip Result: **${Math.random() < 0.5 ? 'HEADS' : 'TAILS'}**.`);
    }

    if (command === '!dice') {
        return message.reply(`🎲 Dice Face: Landed on value **${Math.floor(Math.random() * 6) + 1}**.`);
    }

    if (command === '!poll') {
        const title = args.slice(1).join(' ');
        if (!title) return message.reply('❌ Usage: `!poll <Your question here>`');
        const embed = new EmbedBuilder().setColor('#FF8C00').setTitle('📊 Global Server Poll').setDescription(title).setFooter({ text: `Opened by ${message.author.username}` });
        const m = await message.channel.send({ embeds: [embed] });
        await m.react('👍'); await m.react('👎');
        return;
    }

    if (command === '!bananabread') {
        return message.reply('🍌🍞 **Banana Bread Recipe Matrix:**\n*Mix 3 ripe bananas, 1/3 cup melted butter, 1 tsp baking soda, 1 cup sugar, 1 beaten egg, 1.5 cups flour. Bake at 175°C (350°F) for exactly 1 hour inside deep bread tin models.*');
    }

    // ==========================================
    //         LOGGING TOGGLE COMMANDS            
    // ==========================================
    if (command === '!enablelogs') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        if (systemLogsEnabled) return message.reply('Notice: Server logs are already enabled.');
        systemLogsEnabled = true;
        return message.reply('✅ **Logs Enabled:** Staff DM log alerts are now active.');
    }

    if (command === '!disablelogs') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        if (!systemLogsEnabled) return message.reply('Notice: Server logs are already disabled.');
        systemLogsEnabled = false;
        return message.reply('⚠️ **Logs Disabled:** Staff DM log alerts have been turned off.');
    }

    // BACKUP EXPORT
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
                    .setTitle('🔍 User Info: ' + target.user.username)
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

    // Commercial Marketplace
    if (command === '!shop') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('🏪 FlameBot Token Shop (Inflation Corrected)')
                    .setDescription('Prices have been bumped due to economy expansion lines:')
                    .addFields(
                        { name: '💎 VIP Access Status (`!buy vip`)', value: `Price: 🪙 **${VIP_PRICE}**\nGrants exclusive access to server VIP channels.` },
                        { name: '💸 2x Passive Income Booster (`!buy booster`)', value: `Price: 🪙 **${BOOSTER_PRICE}**\nPermanently doubles all coins earned from chat and commands.` },
                        { name: '🎨 Custom Color Role (`!buy color <hex>`)', value: `Price: 🪙 **${COLOR_PRICE}**\nCreates your own personal colored role.` },
                        { name: '🔮 Custom 8-Ball Option (`!buy 8ball <text>`)', value: `Price: 🪙 **${ORACLE_PRICE}**\nPermanently appends your custom response into the global 8ball pool.` },
                        { name: '🎭 Custom Profile Title (`!buy title <text>`)', value: `Price: 🪙 **${TITLE_PRICE}**\nAppends a customized title tag onto your profile card metrics.` },
                        { name: '🛡️ Theft Protection Shield (`!buy shield`)', value: `Price: 🪙 **${SHIELD_PRICE}**\nBlocks the next robbery attempt and counter-fines the thief.` }
                    )
            ]
        });
    }

    if (command === '!buy') {
        const productKey = args[1]?.toLowerCase();
        if (!productKey) return message.reply('❌ Missing item label. Usage: `!buy <item_name> [parameters]`');

        if (productKey === 'vip') {
            if (userData.coins < VIP_PRICE) return message.reply(`❌ Purchase Error: You need 🪙 **${VIP_PRICE} coins**.`);
            const targetRole = message.guild.roles.cache.get(VIP_ROLE_ID);
            if (!targetRole) return message.reply('❌ System Error: VIP role mapping configuration error.');
            try {
                await message.member.roles.add(targetRole);
                userData.coins -= VIP_PRICE;
                await userData.save();
                return message.reply('🎉 **Purchase Successful:** You unlocked the premium VIP role status.');
            } catch {
                return message.reply('❌ Permissions Error: Failed to add role.');
            }
        }

        if (productKey === 'booster') {
            if (userData.hasBooster) return message.reply('❌ Upgrade Error: Booster already active.');
            if (userData.coins < BOOSTER_PRICE) return message.reply(`❌ Purchase Error: You need 🪙 **${BOOSTER_PRICE} coins**.`);

            userData.hasBooster = true;
            userData.coins -= BOOSTER_PRICE;
            await userData.save();
            return message.reply('💸 **Booster Purchased:** You are now earning double coins across message channels permanently.');
        }

        if (productKey === 'color') {
            const hexCodeInput = args[2];
            if (!hexCodeInput || !/^#[0-9A-F]{6}$/i.test(hexCodeInput)) return message.reply('❌ Format Error: Usage format: `!buy color <#HEXCODE>`');
            if (userData.coins < COLOR_PRICE) return message.reply(`❌ Purchase Error: You need 🪙 **${COLOR_PRICE} coins**.`);

            try {
                userData.coins -= COLOR_PRICE;
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
                return message.reply('❌ API Error: Internal role creation failed.');
            }
        }

        if (productKey === '8ball') {
            const userStringInjection = args.slice(2).join(' ');
            if (!userStringInjection || userStringInjection.length < 3) return message.reply('❌ Argument Error: Usage: `!buy 8ball <Your custom answer>`');
            if (userData.coins < ORACLE_PRICE) return message.reply(`❌ Purchase Error: You need 🪙 **${ORACLE_PRICE} coins**.`);

            customEightBallAnswers.push(userStringInjection);
            userData.coins -= ORACLE_PRICE;
            await userData.save();
            return message.reply(`🔮 **Database Injected:** Your custom phrase *"${userStringInjection}"* has been added to the 8-ball array.`);
        }

        if (productKey === 'title') {
            const alphanumericTitle = args.slice(2).join(' ');
            if (!alphanumericTitle || alphanumericTitle.length > 20) return message.reply('❌ Constraint Error: Custom profile titles cannot exceed 20 characters.');
            if (userData.coins < TITLE_PRICE) return message.reply(`❌ Purchase Error: You need 🪙 **${TITLE_PRICE} coins**.`);

            userData.customTitle = `[${alphanumericTitle}]`;
            userData.coins -= TITLE_PRICE;
            await userData.save();
            return message.reply(`🎭 **Profile Title Fixed:** Your profile title is now set to **[${alphanumericTitle}]**. View it using \`!stats\`.`);
        }

        if (productKey === 'shield') {
            if (userData.hasShield) return message.reply('❌ Upgrade Error: Shield already deployed.');
            if (userData.coins < SHIELD_PRICE) return message.reply(`❌ Purchase Error: You need 🪙 **${SHIELD_PRICE} coins**.`);

            userData.hasShield = true;
            userData.coins -= SHIELD_PRICE;
            await userData.save();
            return message.reply('🛡️ **Shield Deployed:** Your account balance is now protected from the next robbery attempt.');
        }

        return message.reply('❌ Item indexing error: Product key matches nothing inside store profiles.');
    }

    // PROPOSALS PIPELINE
    if (command === '!suggest') {
        const suggestionContent = args.slice(1).join(' ');
        if (!suggestionContent) return message.reply('❌ Argument Error: Usage: `!suggest <idea>`');

        try {
            const developmentLeadIdentity = await client.users.fetch(DEV_USER_ID);
            if (developmentLeadIdentity) {
                const suggestionTransmissionEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('🎟️ New Feature Modification Proposal')
                    .addFields(
                        { name: 'Author Profile', value: `<@${message.author.id}>`, inline: true },
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
    //            DISCIPLINARY MODERATION         
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

    // DISCIPLINARY EXPULSIONS
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

        const secretLedgerAuditLogsEmbed = new EmbedBuilder().setColor('#DCDCDC').setTitle('💰 Treasury System Audit Log: Balance Summary Purge Authorized').addFields({ name: 'Responsible Admin Executor', value: `<@${message.author.id}>`, inline: true }, { name: 'Target Reset Profile Identity', value: `<@${target.id}>`, inline: true }).setTimestamp();
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
                    .setTitle(' Centralized Server Account Asset Audit Ledger')
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
