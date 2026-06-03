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

// ENV
const TOKEN = process.env.DISCORD_TOKEN;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

// ROLE IDS
const VIP_ROLE_ID = process.env.VIP_ROLE_ID || '1511458646348009573';
const MUTE_ROLE_ID = process.env.MUTE_ROLE_ID || '1509040670801789019';
const STREAM_PING_ROLE_ID = process.env.STREAM_PING_ROLE_ID || '1503627239713935452';

// SETTINGS
const PREFIX = '!';
const VIP_PRICE = 10000;
const CHAT_INCOME = 5;

// CLIENT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// DATABASE
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    coins: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    afk: { type: String, default: null }
});

const User = mongoose.model('User', userSchema);

// COOLDOWNS
const lastWorked = {};
const lastDaily = {};
const lastGambled = {};
const lastRobbed = {};

// HELPERS
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

// DATABASE CONNECT
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('💾 MongoDB connected.'))
        .catch(err => console.error('❌ MongoDB error:', err));
} else {
    console.warn('⚠️ MONGO_URI missing.');
}

// RENDER WEB SERVER
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔥 FlameBot is online!');
}).listen(PORT, () => {
    console.log(`🌐 Render web server running on port ${PORT}`);
});

// READY
client.once('ready', () => {
    console.log(`🔥 FlameBot logged in as ${client.user.tag}`);
});

// WELCOME DM
client.on('guildMemberAdd', async member => {
    try {
        await member.send(
            `👋 Welcome to **${member.guild.name}**!\nUse \`${PREFIX}help\` in the server to see commands.`
        );
    } catch {
        console.log(`Could not DM ${member.user.tag}`);
    }
});

// MESSAGE HANDLER
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userData = await getUser(message.author.id);

    // --- NEW: AFK RETURN CHECKER ---
    if (userData.afk) {
        userData.afk = null;
        await userData.save();
        message.reply('👋 Welcome back! I have removed your AFK status.').then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }

    // --- NEW: AFK MENTION CHECKER ---
    if (message.mentions.members.size > 0) {
        message.mentions.members.forEach(async (member) => {
            const mentionedData = await User.findOne({ id: member.id });
            if (mentionedData && mentionedData.afk) {
                message.reply(`💤 **${member.user.username}** is currently AFK: ${mentionedData.afk}`);
            }
        });
    }

   // PASSIVE INCOME SYSTEM & SMART CONVERSATION TRIGGER
    if (!message.content.startsWith(PREFIX)) {
        userData.coins += CHAT_INCOME;
        userData.xp += 2;
        await userData.save();

        // Only look at messages that are at least a few words long to filter out spam/emojis
        if (message.content.trim().split(/\s+/).length >= 3) {
            try {
                // Step 1: Ask Groq if this message is a good conversational hook
                const filterCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a message filter for a Discord bot. Analyze the user message. If the message is a question, a call for help, a hot take, or an interesting topic (like Minecraft, gaming, tech, coding), reply with exactly the word "TRIGGER". If it is just general chat hype, a basic greeting, an emoji, or uninteresting filler (e.g., "yooo redflames stream is fire", "wsp", "lol"), reply with exactly the word "IGNORE". Do not include any other text.'
                        },
                        { role: 'user', content: message.content }
                    ],
                    model: 'llama-3.1-8b-instant',
                    temperature: 0.1, // Low temperature keeps it strictly following the rules
                    max_tokens: 10
                });

                const decision = filterCompletion.choices[0]?.message?.content?.trim().toUpperCase();

                // Step 2: If Groq says "TRIGGER", roll a clean 30% chance to respond so it stays organic
                if (decision.includes('TRIGGER')) {
                    const CHANCE_PERCENT = 30; // 30% chance ensures it doesn't reply to literally EVERY question
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
                            return message.reply(replyText); // Uses message.reply so it tethers directly to their comment
                        }
                    }
                }
            } catch (err) {
                console.error('Groq Smart Chat Error:', err);
            }
        }
        return;
    }

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    userData.coins += CHAT_INCOME;
    userData.xp += 5;
    await userData.save();

    // HELP
    if (command === '!help') {
        const embed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🔥 FlameBot Command Hub')
            .setDescription('Yo bro, here are the commands.')
            .addFields(
                { name: '🤖 AI', value: '`!ask <question>`' },
                { name: '🪙 Economy', value: '`!bal`, `!daily`, `!work`, `!pay @user <amount>`, `!leaderboard`, `!shop`, `!buy vip`, `!rank`' },
                { name: '🎰 Casino', value: '`!blackjack <bet>`, `!coinflip <heads/tails> <bet>`, `!gamble slots/dice <bet>`, `!rob @user`' },
                { name: '🎉 Fun', value: '`!8ball`, `!rps`, `!roll`, `!choose`, `!coin`, `!dice`, `!poll`' },
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
                { name: '⚠️ Moderation', value: '`!warn @user`, `!warnings @user`, `!clearwarns @user`, `!mute @user`, `!unmute @user`, `!tempmute @user <mins>`, `!kick @user`, `!ban @user`' },
                { name: '🧹 Channel Control', value: '`!clear <1-100>`, `!slowmode <seconds/off>`, `!lockchannel`, `!unlockchannel`' },
                { name: '💰 Economy Admin', value: '`!addcoins @user <amount>`, `!removecoins @user <amount>`, `!setcoins @user <amount>`, `!resetcoins @user`, `!baltable`' }
            );

        return message.channel.send({ embeds: [embed] });
    }

    // AI COMMAND POWERED BY GROQ
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

    // INFO
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

    // ECONOMY
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
        const level = Math.floor(data.xp / 100);

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`👤 ${target.user.username}'s Profile`)
                    .addFields(
                        { name: '🪙 Coins', value: `${data.coins}`, inline: true },
                        { name: '⭐ XP', value: `${data.xp}`, inline: true },
                        { name: '📈 Level', value: `${level}`, inline: true },
                        { name: '⚠️ Warnings', value: `${data.warnings}/3`, inline: true }
                    )
            ]
        });
    }

    if (command === '!rank') {
        const level = Math.floor(userData.xp / 100);
        return message.reply(`📈 Level **${level}** | XP **${userData.xp}**`);
    }

    if (command === '!daily') {
        const now = Date.now();
        if (lastDaily[message.author.id] && now - lastDaily[message.author.id] < 86400000) {
            return message.reply('📆 Daily already claimed. Try again later.');
        }

        userData.coins += 100;
        lastDaily[message.author.id] = now;
        await userData.save();

        return message.reply('📆 Daily claimed: 🪙 **+100**');
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

        return message.reply(`💼 You worked and earned 🪙 **${pay}**.`);
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

    if (command === '!shop') {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('🏪 Shop')
                    .setDescription(`💎 VIP Role\nCost: 🪙 **${VIP_PRICE}**\nBuy with \`!buy vip\``)
            ]
        });
    }

    if (command === '!buy' && args[1]?.toLowerCase() === 'vip') {
        if (userData.coins < VIP_PRICE) return message.reply('❌ Not enough coins.');

        const role = message.guild.roles.cache.get(VIP_ROLE_ID);
        if (!role) return message.reply('❌ VIP role not found.');

        try {
            await message.member.roles.add(role);
            userData.coins -= VIP_PRICE;
            await userData.save();
            return message.reply('🎉 VIP purchased.');
        } catch {
            return message.reply('❌ I cannot add that role. Check role hierarchy.');
        }
    }

    // CASINO
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
        return message.reply(`🪙 It landed **${result}**. You lost 🪙 **${bet}**.`);
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
        return message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**\n💀 You lost 🪙 **${bet}**.`);
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
            return message.reply(`🎰 [ ${roll.join(' | ')} ]\n💀 Lost 🪙 **${bet}**.`);
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= 4) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🎲 Rolled **${roll}**. You won 🪙 **${bet}**.`);
        }

        userData.coins -= bet;
        await userData.save();
        return message.reply(`🎲 Rolled **${roll}**. You lost 🪙 **${bet}**.`);
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

    // FUN
    if (command === '!8ball') {
        const q = args.slice(1).join(' ');
        if (!q) return message.reply('🎱 Ask a question.');

        const answers = [
            'Yes.',
            'No.',
            'Probably.',
            'Definitely.',
            'Bro is cooked.',
            'Ask again later.',
            'Absolutely not.',
            'Looks good.'
        ];

        return message.reply(`🎱 ${answers[Math.floor(Math.random() * answers.length)]}`);
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
        ) {
            result = 'You win.';
        } else if (choice !== bot) {
            result = 'I win.';
        }

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

    // UTILITY
    if (command === '!suggest') {
        const idea = args.slice(1).join(' ');
        if (!idea) return message.reply('❌ Usage: `!suggest <idea>`');
        return message.reply(`✅ Suggestion logged: **${idea}**`);
    }

    if (command === '!afk') {
        const reason = args.slice(1).join(' ') || 'AFK';
        userData.afk = reason;
        await userData.save();
        return message.reply(`💤 AFK set: **${reason}**`);
    }

    if (command === '!say') {
        if (!isMod(message.member)) return message.reply('❌ Mod only.');
        const text = args.slice(1).join(' ');
        if (!text) return message.reply('❌ Usage: `!say <message>`');
        await message.delete().catch(() => {});
        return message.channel.send(text);
    }

    if (command === '!announce') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
        const text = args.slice(1).join(' ');
        if (!text) return message.reply('❌ Usage: `!announce <message>`');

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('📣 Announcement')
                    .setDescription(text)
                    .setTimestamp()
            ]
        });
    }

    if (command === '!golive') {
        if (!isAdmin(message.member)) return message.reply('❌ Lower Admin+ only.');

        const platform = args[1]?.toLowerCase();
        const title = args.slice(2).join(' ') || 'Streaming Live Now!';

        if (!['twitch', 'youtube'].includes(platform)) {
            return message.reply('❌ Usage: `!golive twitch/youtube <title>`');
        }

        const url = platform === 'twitch'
            ? 'https://twitch.tv/redflamingarrow_'
            : 'https://www.youtube.com/@redflamingarrowlive';

        const embed = new EmbedBuilder()
            .setColor(platform === 'twitch' ? '#9146FF' : '#FF0000')
            .setTitle(`${platform === 'twitch' ? '🔮' : '🎥'} REDFLAME IS LIVE`)
            .setDescription(`**${title}**\n\nCome hang out.`)
            .addFields({ name: '🌐 Link', value: url })
            .setTimestamp();

        await message.channel.send({
            content: `<@&${STREAM_PING_ROLE_ID}>`,
            embeds: [embed]
        });

        return message.delete().catch(() => {});
    }

    // MODERATION
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

        await message.channel.send(`⚠️ ${target} warned. Active warnings: **${targetData.warnings}/3**`);

        if (targetData.warnings >= 3) {
            if (!target.kickable) return message.channel.send('❌ Cannot auto-kick this user.');
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
        return message.reply(`🤫 Muted ${target}.`);
    }

    if (command === '!unmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !role) return message.reply('❌ Missing target or mute role.');

        await target.roles.remove(role);
        return message.reply(`🔊 Unmuted ${target}.`);
    }

    if (command === '!tempmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        const minutes = cleanAmount(args[2]);
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !minutes || !role) return message.reply('❌ Usage: `!tempmute @user <minutes>`');

        await target.roles.add(role);
        message.reply(`🤫 Muted ${target} for **${minutes}m**.`);

        setTimeout(async () => {
            try {
                await target.roles.remove(role);
                message.channel.send(`🔊 ${target} was automatically unmuted.`);
            } catch {}
        }, minutes * 60000);

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
        if (seconds === null || seconds < 0 || seconds > 21600) {
            return message.reply('❌ Invalid seconds.');
        }

        await message.channel.setRateLimitPerUser(seconds);
        return message.reply(`📶 Slowmode set to **${seconds}s**.`);
    }

    if (command === '!lockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');

        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: false
        });

        return message.reply('🔒 Channel locked.');
    }

    if (command === '!unlockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');

        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: null
        });

        return message.reply('🔓 Channel unlocked.');
    }

    if (command === '!kick') {
        if (!isMod(message.member)) return message.reply('❌ Mod+ only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        if (!target.kickable) return message.reply('❌ I cannot kick that user.');

        await target.kick(args.slice(2).join(' ') || 'No reason provided.');
        return message.reply(`🥾 Kicked ${target.user.username}.`);
    }

    if (command === '!ban') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        if (!target.bannable) return message.reply('❌ I cannot ban that user.');

        await target.ban({ reason: args.slice(2).join(' ') || 'No reason provided.' });
        return message.reply(`🔨 Banned ${target.user.username}.`);
    }

    // ECONOMY ADMIN
    if (command === '!addcoins' || command === '!givecoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || !amount || amount <= 0) return message.reply('❌ Usage: `!addcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $inc: { coins: amount } }, { upsert: true });
        return message.reply(`💸 Added 🪙 **${amount}** to ${target.user.username}.`);
    }

    if (command === '!removecoins' || command === '!deductcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || !amount || amount <= 0) return message.reply('❌ Usage: `!removecoins @user <amount>`');

        const targetData = await getUser(target.id);
        targetData.coins = Math.max(0, targetData.coins - amount);
        await targetData.save();

        return message.reply(`📉 Removed 🪙 **${amount}** from ${target.user.username}.`);
    }

    if (command === '!setcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        const amount = cleanAmount(args[2]);

        if (!target || amount === null || amount < 0) return message.reply('❌ Usage: `!setcoins @user <amount>`');

        await User.updateOne({ id: target.id }, { $set: { coins: amount } }, { upsert: true });
        return message.reply(`🔧 Set ${target.user.username}'s coins to 🪙 **${amount}**.`);
    }

    if (command === '!resetcoins') {
        if (!isAdmin(message.member)) return message.reply('❌ Admin only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Usage: `!resetcoins @user`');

        await User.updateOne({ id: target.id }, { $set: { coins: 0 } }, { upsert: true });
        return message.reply(`🧹 Reset ${target.user.username}'s coins.`);
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
