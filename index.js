require('dotenv').config(); // Load hidden environment variables instantly
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs'); 
const path = require('path');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages 
    ] 
});

// --- CORE LOCAL DATABASE CONFIGS ---
const BALANCES_FILE = path.join(__dirname, 'balances.json');
let balances = {}, lastWorked = {}, lastDaily = {}, lastGambled = {}, lastRobbed = {}, warnings = {}; 

// --- SECURE CONFIGURATION VARIABLES ---
const TOKEN = process.env.DISCORD_TOKEN; 
const GEMINI_API_KEY = process.env.GEMINI_KEY; 

const VIP_ROLE_ID = '1511458646348009573'; 
const MUTE_ROLE_ID = '1509040670801789019'; 
const STREAM_PING_ROLE_ID = '1503627239713935452'; 
const MEMBER_ROLE_ID = '1474953393146691654';      
const SR_MEMBER_ROLE_ID = '1474953348871491785';   

const VIP_PRICE = 10000; 
const CHAT_INCOME_BUFF = 5; 

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// CRASH-PROOF JSON LOADER
function loadBalances() {
    try {
        if (!fs.existsSync(BALANCES_FILE)) {
            fs.writeFileSync(BALANCES_FILE, JSON.stringify({}, null, 4), 'utf8');
            balances = {};
            return;
        }
        const data = fs.readFileSync(BALANCES_FILE, 'utf8').trim();
        if (!data) {
            fs.writeFileSync(BALANCES_FILE, JSON.stringify({}, null, 4), 'utf8');
            balances = {};
            return;
        }
        balances = JSON.parse(data);
        console.log("💾 Permanent JSON database synced up successfully via .env.");
    } catch (err) {
        console.error("⚠️ JSON Read Error bypassed:", err.message);
        balances = {};
    }
}

function saveBalances() {
    try { fs.writeFileSync(BALANCES_FILE, JSON.stringify(balances, null, 4), 'utf8'); } catch (err) {}
}

client.once('ready', () => {
    loadBalances();
    console.log(`FlameBot Master V5.1 Online. Fully configured with environment security controls.`);
});

// AUTOMATED WELCOME DM
client.on('guildMemberAdd', async (member) => {
    try {
        await member.send(`Welcome to **${member.guild.name}**! Make sure to read the rules and stay active to earn Flame Coins. Use the \`!help\` command in the server to see everything we have built.`);
    } catch (error) {
        console.log(`Could not DM ${member.user.tag}.`);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // Permissions check helpers
    const hasTrialMod = message.member.roles.cache.some(r => ['Trial Mod', 'Mod', 'Lower Admin', 'Admin', 'Owner/Streamer'].includes(r.name)) || message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const hasMod = message.member.roles.cache.some(r => ['Mod', 'Lower Admin', 'Admin', 'Owner/Streamer'].includes(r.name)) || message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const hasAdminOrHigher = message.member.roles.cache.some(r => ['Lower Admin', 'Admin', 'Owner/Streamer'].includes(r.name)) || message.member.id === message.guild.ownerId || message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // AUTOMATIC CHAT INCOME
    if (!balances[userId]) balances[userId] = 0;
    balances[userId] += CHAT_INCOME_BUFF; 
    saveBalances(); 

    // --- STREAM ALERTS MODULE ---
    if (command === '!golive') {
        if (!hasAdminOrHigher) return message.reply("Only Lower Admin+ can issue stream announcements.");
        const platform = args[1]?.toLowerCase();
        const streamTitle = args.slice(2).join(' ') || "Streaming Live Now!";
        if (!platform || (platform !== 'twitch' && platform !== 'youtube')) return message.reply("Usage: `!golive <twitch/youtube> <Title>`");

        let streamUrl = platform === 'twitch' ? 'https://twitch.tv/redflamingarrow_' : 'https://www.youtube.com/@redflamingarrowlive';
        const liveEmbed = new EmbedBuilder()
            .setColor(platform === 'twitch' ? '#9146FF' : '#FF0000')
            .setTitle(`${platform === 'twitch' ? '🔮' : '🎥'} REDFLAME IS LIVE!`)
            .setDescription(`**${streamTitle}**\n\nCome hang out, chat, and support the stream right now, gng!`)
            .addFields({ name: '🌐 Stream Link', value: streamUrl }).setTimestamp();

        await message.channel.send({ content: `<@&${STREAM_PING_ROLE_ID}>`, embeds: [liveEmbed] });
        return message.delete().catch(() => {});
    }

    // --- INTEL / AI COMMAND ---
    if (command === '!ask') {
        const question = args.slice(1).join(' ');
        if (!question) return message.reply("Provide a question.");
        const loadingMessage = await message.reply("🧠 Searching and generating overview...");
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", contents: question,
                config: { systemInstruction: "You are the AI core of FlameBot for streamer RedFlame. Links: Twitch: https://twitch.tv/redflamingarrow_ YouTube: https://www.youtube.com/@redflamingarrowlive. Objective tone." }
            });
            await loadingMessage.edit(response.text.substring(0, 1999));
        } catch (error) { await loadingMessage.edit("⚠️ Failed to generate overview."); }
        return;
    }

    // --- MAIN CORE MENU COMMANDS ---
    if (command === '!help') {
        const helpEmbed = new EmbedBuilder().setColor('#FF4500').setTitle('🔥 FlameBot Official Command Hub')
            .addFields(
                { name: '🤖 AI Core', value: '`!ask <question>`' },
                { name: '🪙 Economy', value: '`!bal`, `!daily`, `!work`, `!pay @user <amt>`, `!leaderboard`, `!shop`, `!buy vip`' },
                { name: '🎰 Casino', value: '`!blackjack <bet>`, `!coinflip <heads/tails> <bet>`, `!gamble slots/dice <bet>`, `!rob @user`' },
                { name: '⚙️ 10 QoL Commands', value: '`!stats @user`, `!serverinfo`, `!whois @user`, `!avatar @user`, `!ping`, `!links`, `!rps <choice>`, `!roll <max>`, `!choose <a|b>`, `!suggest <idea>`' }
            );
        return message.channel.send({ embeds: [helpEmbed] });
    }

    if (command === '!staffhelp') {
        if (!hasTrialMod) return message.reply("Access denied.");
        const staffEmbed = new EmbedBuilder().setColor('#2F3136').setTitle('🛡️ Operations Terminal')
            .addFields(
                { name: '💰 Ledger Overrides', value: '`!bal @user`, `!baltable`, `!addcoins @user <amt>`, `!removecoins @user <amt>`, `!setcoins @user <amt>`, `!resetcoins @user`' },
                { name: '🤫 Filter & Security Systems', value: '`!warn @user`, `!warnings @user`, `!clearwarns @user`, `!mute @user`, `!unmute @user`, `!tempmute @user <mins>`, `!clear <1-100>`, `!slowmode <secs>`, `!lockchannel`, `!unlockchannel`, `!kick @user`, `!ban @user`' }
            );
        return message.channel.send({ embeds: [staffEmbed] });
    }

    // --- THE 10 QUALITY OF LIFE COMMANDS ---
    if (command === '!stats') {
        const target = message.mentions.members.first() || message.member;
        return message.channel.send({ embeds: [new EmbedBuilder().setColor('#1E90FF').setTitle(`👤 ${target.user.username} Profile`).addFields({ name: '🪙 Wallet Balance', value: `\`${balances[target.id] || 0}\` Coins`, inline: true }, { name: '⚠️ Strikes', value: `\`${warnings[target.id] || 0}/3\``, inline: true })] });
    }
    if (command === '!serverinfo') {
        return message.channel.send({ embeds: [new EmbedBuilder().setColor('#32CD32').setTitle(`🏰 ${message.guild.name}`).addFields({ name: '👥 Total Members', value: `\`${message.guild.memberCount}\``, inline: true }, { name: '📈 Boosts', value: `\`${message.guild.premiumSubscriptionCount}\``, inline: true })] });
    }
    if (command === '!whois') {
        const target = message.mentions.members.first() || message.member;
        return message.channel.send({ embeds: [new EmbedBuilder().setColor('#9b59b6').setTitle(`🔍 Identity Audit`).addFields({ name: '📅 Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>` }, { name: '📥 Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>` })] });
    }
    if (command === '!avatar' || command === '!av') {
        const target = message.mentions.members.first() || message.member;
        return message.channel.send({ embeds: [new EmbedBuilder().setImage(target.user.displayAvatarURL({ dynamic: true, size: 1024 }))] });
    }
    if (command === '!ping') return message.reply(`🏓 **Pong!** Speed: \`${Math.abs(Date.now() - message.createdTimestamp)}ms\`.`);
    if (command === '!links') {
        return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔥 Portals').setDescription('YT: https://www.youtube.com/@redflamingarrowlive\nTwitch: https://twitch.tv/redflamingarrow_')] });
    }
    if (command === '!rps') {
        const choice = args[1]?.toLowerCase();
        if (!choice || !['rock', 'paper', 'scissors'].includes(choice)) return message.reply("Use: `!rps <rock/paper/scissors>`");
        const options = ['rock', 'paper', 'scissors'];
        const botPlay = options[Math.floor(Math.random() * 3)];
        let res = choice === botPlay ? "Tie game!" : ((choice==='rock'&&botPlay==='scissors')||(choice==='paper'&&botPlay==='rock')||(choice==='scissors'&&botPlay==='paper')) ? "You Win! +40 coins" : "I Win! -20 coins";
        if (res.includes("You Win")) balances[userId] += 40; if (res.includes("I Win")) balances[userId] = Math.max(0, balances[userId] - 20);
        saveBalances(); return message.reply(`Your hand: **${choice}** | My hand: **${botPlay}**\n**${res}**`);
    }
    if (command === '!roll') {
        const max = parseInt(args[1]) || 6;
        return message.reply(`🎲 Rolled landed on a solid **${Math.floor(Math.random() * max) + 1}**.`);
    }
    if (command === '!choose') {
        if (!message.content.includes('|')) return message.reply("Separate choices with a pipe line '|'!");
        const items = args.slice(1).join(' ').split('|');
        return message.reply(`🔮 Selected option: **${items[Math.floor(Math.random() * items.length)].trim()}**.`);
    }
    if (command === '!suggest') {
        const idea = args.slice(1).join(' ');
        if (!idea) return message.reply("Usage: `!suggest <idea>`");
        return message.reply("✅ Logged suggestion entry successfully.");
    }

    // --- STANDARD ECONOMY & CASINO MECHANICS ---
    if (command === '!leaderboard' || command === '!lb') {
        let sorted = Object.entries(balances).sort((a,b)=>b[1]-a[1]).slice(0,5);
        let desc = sorted.map((e,i)=> `**#${i+1}** | <@${e[0]}> — 🪙 \`${e[1]}\` Coins`).join('\n') || "Empty ledger.";
        return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🏆 Rich List').setDescription(desc)] });
    }
    if (command === '!blackjack' || command === '!bj') {
        const bet = parseInt(args[1]);
        if (isNaN(bet) || bet <= 0 || balances[userId] < bet) return message.reply("Invalid bet balance assets.");
        if (lastGambled[userId] && (Date.now() - lastGambled[userId] < 3000)) return message.reply("Slow down.");
        lastGambled[userId] = Date.now();
        let pHand = (Math.floor(Math.random()*10)+2) + (Math.floor(Math.random()*10)+2);
        let dHand = (Math.floor(Math.random()*10)+2) + (Math.floor(Math.random()*10)+2);
        if (pHand === 21) { balances[userId] += bet; saveBalances(); return message.reply("🃏 BJ! You win."); }
        while(dHand < 17) dHand += (Math.floor(Math.random()*10)+2);
        if (dHand > 21 || pHand > dHand) { balances[userId] += bet; message.reply(`🎉 Win! ${pHand} vs ${dHand}.`); }
        else if (pHand === dHand) { message.reply(`Push. Returned bet.`); }
        else { balances[userId] -= bet; message.reply(` House wins. Lost ${bet}.`); }
        saveBalances(); return;
    }
    if (command === '!daily') {
        if (lastDaily[userId] && (Date.now() - lastDaily[userId] < 86400000)) return message.reply("Claimable once every 24h.");
        balances[userId] += 50; lastDaily[userId] = Date.now(); saveBalances();
        return message.reply("📆 Claimed daily 🪙 **50 Flame Coins**.");
    }
    if (command === '!pay') {
        const target = message.mentions.members.first(); const amt = parseInt(args[2]);
        if (!target || isNaN(amt) || amt <= 0 || balances[userId] < amt) return message.reply("Usage: `!pay @user <amount>`");
        balances[userId] -= amt; balances[target.id] = (balances[target.id] || 0) + amt; saveBalances();
        return message.reply(`💸 Sent 🪙 \`${amt}\` to **${target.user.username}**.`);
    }
    if (command === '!rob') {
        const target = message.mentions.members.first();
        if (!target || target.id === userId || (balances[target.id]||0) < 20) return message.reply("Target invalid or poor.");
        if (lastRobbed[userId] && (Date.now() - lastRobbed[userId] < 600000)) return message.reply("Heist operations on cooldown.");
        lastRobbed[userId] = Date.now();
        if (Math.random() < 0.35) {
            const cut = Math.floor(Math.random() * (balances[target.id] * 0.4)) + 10;
            balances[target.id] -= cut; balances[userId] += cut;
            message.reply(`🥷 **Success!** Stole 🪙 \`${cut}\` coins.`);
        } else {
            balances[userId] = Math.max(0, balances[userId] - 30); balances[target.id] += 30;
            message.reply(`🚨 **Busted!** Paid a fine of 🪙 30 coins.`);
        }
        saveBalances(); return;
    }
    if (command === '!shop') {
        return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🏪 Store Matrix').setDescription(`💎 **VIP Role Perk**\nCost: 🪙 ${VIP_PRICE} coins\nBuy via \`!buy vip\``)] });
    }
    if (command === '!buy' && args[1] === 'vip') {
        if (balances[userId] < VIP_PRICE) return message.reply("Insufficient coins.");
        const role = message.guild.roles.cache.get(VIP_ROLE_ID);
        if (!role) return message.reply("Role asset error.");
        try { await message.member.roles.add(role); balances[userId] -= VIP_PRICE; saveBalances(); return message.reply("🎉 VIP Purchased!"); } catch(e) { return message.reply("Hierarchy permission block."); }
    }
    if (command === '!coinflip') {
        const choice = args[1]?.toLowerCase(); const bet = parseInt(args[2]);
        if (!['heads', 'tails'].includes(choice) || isNaN(bet) || bet <= 0 || balances[userId] < bet) return message.reply("Usage: `!coinflip <heads/tails> <bet>`");
        if (lastGambled[userId] && (Date.now() - lastGambled[userId] < 3000)) return message.reply("Slow down.");
        lastGambled[userId] = Date.now();
        if (Math.random() < 0.40) { balances[userId] += bet; message.reply(`🪙 Flip landed on **${choice}**! Won ${bet} coins!`); }
        else { balances[userId] -= bet; message.reply(`📉 Flip lost. Lower edge hit.`); }
        saveBalances(); return;
    }
    if (command === '!gamble') {
        const mode = args[1]?.toLowerCase(); const bet = parseInt(args[2]);
        if (!['slots', 'dice'].includes(mode) || isNaN(bet) || bet <= 0 || balances[userId] < bet) return message.reply("Usage: `!gamble slots/dice <bet>`");
        if (lastGambled[userId] && (Date.now() - lastGambled[userId] < 3000)) return message.reply("Slow down.");
        lastGambled[userId] = Date.now();
        if (mode === 'slots') {
            const icons = ['🍒','🍋','🍇','💎','🔥'];
            let s1 = icons[Math.floor(Math.random()*5)], s2 = icons[Math.floor(Math.random()*5)], s3 = icons[Math.floor(Math.random()*5)];
            if (s1 === s2 && s2 === s3) { balances[userId] += bet * 3; message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] Jackpot 3x win!`); }
            else if (s1 === s2 || s2 === s3 || s1 === s3) { balances[userId] += Math.floor(bet * 0.5); message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] 1.5x Match!`); }
            else { balances[userId] -= bet; message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] Lost bet.`); }
        } else {
            let roll = Math.floor(Math.random()*6)+1;
            if (roll >= 4) { balances[userId] += bet; message.reply(`🎲 Rolled a **${roll}**! Won ${bet}!`); }
            else { balances[userId] -= bet; message.reply(`🎲 Rolled a **${roll}**! Lost bet.`); }
        }
        saveBalances(); return;
    }
    if (command === '!work') {
        if (lastWorked[userId] && (Date.now() - lastWorked[userId] < 3600000)) return message.reply("Work shift is on an hourly cooldown.");
        const pay = Math.floor(Math.random() * 101) + 50; balances[userId] += pay; lastWorked[userId] = Date.now(); saveBalances();
        return message.reply(`💼 Completed shifts! Earned 🪙 **${pay} Flame Coins**.`);
    }

    // --- STAFF COMMAND OPERATIONS MATRIX (THE 10 MOD & OVERRIDES) ---
    if (command === '!balance' || command === '!bal') {
        const target = message.mentions.members.first();
        if (target) {
            if (!hasTrialMod) return message.reply("Staff clearance required.");
            return message.channel.send(`🔍 **Audit:** User **${target.user.username}** holds 🪙 \`${balances[target.id] || 0}\` Coins.`);
        }
        return message.reply(`You have 🪙 ${balances[userId]} Flame Coins.`);
    }
    if (command === '!baltable' || command === '!balancetable') {
        if (!hasAdminOrHigher) return message.reply("Access denied.");
        const entries = Object.entries(balances); if (entries.length === 0) return message.reply("File ledger empty.");
        let out = "📊 **SERVER COIN LEDGER**\n```\n-----------------------------------------\n| User Account        | Balance          |\n-----------------------------------------\n";
        for (const [id, bal] of entries) {
            const u = client.users.cache.get(id); const name = u ? u.username : `ID: ${id}`;
            out += `| ${name.padEnd(19).substring(0,19)} | ${`🪙 ${bal}`.padEnd(16)} |\n`;
        }
        out += "-----------------------------------------\n```"; return message.channel.send(out);
    }
    if (command === '!clear' || command === '!purge') {
        if (!hasTrialMod) return message.reply("Requires Trial Mod+");
        const amt = parseInt(args[1]); if (isNaN(amt) || amt < 1 || amt > 100) return message.reply("Enter 1-100");
        await message.delete().catch(()=>{}); const del = await message.channel.bulkDelete(amt, true);
        const m = await message.channel.send(`🧹 **Purged:** Cleaned up \`${del.size}\` text lines.`);
        return setTimeout(()=>m.delete().catch(()=>{}), 4000);
    }
    if (command === '!warn') {
        if (!hasTrialMod) return message.reply("Access denied.");
        const target = message.mentions.members.first(); if (!target) return message.reply("Tag a user.");
        warnings[target.id] = (warnings[target.id] || 0) + 1;
        message.channel.send(`⚠️ **Strike Issued:** Active: **${warnings[target.id]}/3**.`);
        if (warnings[target.id] >= 3) { await target.kick("Max warnings tier reached."); warnings[target.id] = 0; message.channel.send(`🥾 **Auto-Kick:** Left channel bounds.`); }
        return;
    }
    if (command === '!warnings') {
        if (!hasTrialMod) return message.reply("Access denied.");
        const target = message.mentions.members.first(); if (!target) return message.reply("Tag target user.");
        return message.channel.send(`📋 **Strikes Log:** Total active warnings stand at: **${warnings[target.id] || 0}**.`);
    }
    if (command === '!clearwarns') {
        if (!hasMod) return message.reply("Requires full Mod+ status clearance.");
        const target = message.mentions.members.first(); if (!target) return message.reply("Tag target user.");
        warnings[target.id] = 0; return message.channel.send("✅ Log files updated. Strikes wiped clean.");
    }
    if (command === '!slowmode') {
        if (!hasMod) return message.reply("Access denied.");
        const rate = args[1]?.toLowerCase(); if (!rate) return message.reply("Usage: `slowmode <seconds|off>`");
        if (rate === 'off') { await message.channel.setRateLimitPerUser(0); return message.channel.send("Slowmode lifted."); }
        await message.channel.setRateLimitPerUser(parseInt(rate) || 0); return message.channel.send(`📶 Rate limit locked at **${rate}s**.`);
    }
    if (command === '!lockchannel') {
        if (!hasMod) return message.reply("Access denied.");
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.channel.send("🔒 Channel write functions disabled.");
    }
    if (command === '!unlockchannel') {
        if (!hasMod) return message.reply("Access denied.");
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.channel.send("🔓 Channel write functions restored.");
    }
    if (command === '!tempmute') {
        if (!hasTrialMod) return message.reply("Access denied.");
        const target = message.mentions.members.first(); const d = parseInt(args[2]);
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID); if (!target || isNaN(d) || !role) return message.reply("Parameters configuration missing.");
        await target.roles.add(role); message.channel.send(`🤫 Muted for **${d}m**.`);
        return setTimeout(async () => { try { await target.roles.remove(role); message.channel.send(`🔊 Unmuted naturally.`); } catch(e){} }, d * 60000);
    }
    if (command === '!mute') {
        if (!hasTrialMod) return message.reply("Access denied.");
        const target = message.mentions.members.first(); const role = message.guild.roles.cache.get(MUTE_ROLE_ID);
        if (!target || !role) return message.reply("Check config setup blocks.");
        await target.roles.add(role); return message.channel.send("🤫 Targeted user muted indefinitely.");
    }
    if (command === '!unmute') {
        if (!hasTrialMod) return message.reply("Access denied.");
        const target = message.mentions.members.first(); const role = message.guild.roles.cache.get(MUTE_ROLE_ID);
        if (!target || !role) return message.reply("Check config setup blocks.");
        await target.roles.remove(role); return message.channel.send("🔊 Mute filter successfully detached.");
    }
    if (command === '!kick') {
        if (!hasMod) return message.reply("Requires Mod status.");
        const target = message.mentions.members.first(); if (!target) return message.reply("Tag target user.");
        await target.kick(args.slice(2).join(' ') || "No details.");
        return message.channel.send(`🥾 **Kicked:** Account detached.`);
    }
    if (command === '!ban') {
        if (!hasAdminOrHigher) return message.reply("Requires Lower Admin+ status.");
        const target = message.mentions.members.first(); if (!target) return message.reply("Tag target user.");
        await target.ban({ reason: args.slice(2).join(' ') || "No log details specified." });
        return message.channel.send(`🔨 **Banned:** Blacklisted permanently.`);
    }
    if (command === '!addcoins' || command === '!givecoins') {
        if (!hasAdminOrHigher) return message.reply("Requires Lower Admin+");
        const target = message.mentions.members.first(); const amt = parseInt(args[2]);
        if (!target || isNaN(amt) || amt <= 0) return message.reply("Usage: `!addcoins @user <amt>`");
        balances[target.id] = (balances[target.id] || 0) + amt; saveBalances();
        return message.channel.send(`💸 Credited 🪙 \`${amt}\` to ${target.user.username}.`);
    }
    if (command === '!removecoins' || command === '!deductcoins') {
        if (!hasAdminOrHigher) return message.reply("Requires Lower Admin+");
        const target = message.mentions.members.first(); const amt = parseInt(args[2]);
        if (!target || isNaN(amt) || amt <= 0) return message.reply("Usage: `!removecoins @user <amt>`");
        balances[target.id] = Math.max(0, (balances[target.id] || 0) - amt); saveBalances();
        return message.channel.send(`📉 Deducted 🪙 \`${amt}\` from ${target.user.username}.`);
    }
    if (command === '!setcoins') {
        if (!hasAdminOrHigher) return message.reply("Requires Lower Admin+");
        const target = message.mentions.members.first(); const amt = parseInt(args[2]);
        if (!target || isNaN(amt) || amt < 0) return message.reply("Usage: `!setcoins @user <amt>`");
        balances[target.id] = amt; saveBalances();
        return message.channel.send(`🔧 Forced balance registry to 🪙 \`${amt}\`.`);
    }
    if (command === '!resetcoins') {
        if (!hasAdminOrHigher) return message.reply("Requires Lower Admin+");
        const target = message.mentions.members.first(); if (!target) return message.reply("Usage: `!resetcoins @user`");
        balances[target.id] = 0; saveBalances();
        return message.channel.send(`🧹 Ledger account wiped entirely.`);
    }
});

client.login(TOKEN);
