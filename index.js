require('dotenv').config();
process.on('uncaughtException', (err) => {
  console.error('CRASHED! Error:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const mongoose = require('mongoose');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

const User = mongoose.model('User', new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    coins: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 }
}));

mongoose.connect(process.env.MONGO_URI);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- NEW INDESTRUCTIBLE LOGIC ---
let user = await User.findOne({ id: message.author.id });
if (!user) {
    try {
        user = await User.create({ id: message.author.id });
    } catch (err) {
        // If it still errors, it means the user was created exactly in the split second before this
        user = await User.findOne({ id: message.author.id });
    }
}
    user.coins += 5;
    await user.save();

    const args = message.content.split(' ');
    const cmd = args[0].toLowerCase();

    // STAFF CHECK
    const isStaff = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || message.member.roles.cache.some(r => ['Mod', 'Lower Admin', 'Admin'].includes(r.name));

    // --- COMMAND MATRIX ---
    
    // 1. AI & UTILITY
    if (cmd === '!ask') {
        const q = args.slice(1).join(' ');
        const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: q });
        message.reply(res.text.substring(0, 2000));
    }
    else if (cmd === '!ping') message.reply(`Pong! ${Math.abs(Date.now() - message.createdTimestamp)}ms`);
    else if (cmd === '!stats') message.reply(`Coins: ${user.coins} | Warnings: ${user.warnings}`);
    else if (cmd === '!serverinfo') message.channel.send(`Members: ${message.guild.memberCount}`);
    else if (cmd === '!whois') message.channel.send(`Joined: <t:${Math.floor(message.member.joinedTimestamp/1000)}:R>`);
    else if (cmd === '!avatar') message.channel.send(message.author.displayAvatarURL());
    else if (cmd === '!links') message.channel.send('YT: https://youtube.com/@redflamingarrowlivenTwitch: https://twitch.tv/redflamingarrow_');
    else if (cmd === '!roll') message.reply(`Rolled: ${Math.floor(Math.random()*6)+1}`);
    else if (cmd === '!choose') message.reply(`Selection: ${args.slice(1).join(' ').split('|')[Math.floor(Math.random()*2)].trim()}`);
    else if (cmd === '!suggest') message.reply('Suggestion logged.');

    // 2. ECONOMY & CASINO
    else if (cmd === '!bal') message.reply(`Balance: ${user.coins}`);
    else if (cmd === '!work') { user.coins += 50; await user.save(); message.reply('Worked! +50 coins.'); }
    else if (cmd === '!daily') { user.coins += 100; await user.save(); message.reply('Claimed daily! +100.'); }
    else if (cmd === '!pay') { 
        const t = message.mentions.members.first(); let tu = await User.findOne({id:t.id}); 
        user.coins -= args[2]; tu.coins += parseInt(args[2]); await user.save(); await tu.save(); message.reply('Paid.'); 
    }
    else if (cmd === '!lb') {
        const top = await User.find().sort({coins:-1}).limit(5);
        message.channel.send(top.map(u => `<@${u.id}>: ${u.coins}`).join('\n'));
    }
    else if (cmd === '!shop') message.reply('VIP: 10k coins. Use !buy vip');
    else if (cmd === '!buy') { if(args[1]==='vip') { user.coins -= 10000; await user.save(); message.reply('Purchased!'); } }
    else if (cmd === '!rob') { user.coins += 20; await user.save(); message.reply('Stole 20!'); }
    else if (cmd === '!coinflip') { user.coins += (Math.random() > 0.5 ? 50 : -50); await user.save(); message.reply('Flipped!'); }
    else if (cmd === '!gamble') { user.coins += (Math.random() > 0.5 ? 100 : -100); await user.save(); message.reply('Gambled!'); }

    // 3. MODERATION
    else if (cmd === '!warn' && isStaff) { 
        const t = message.mentions.members.first(); let tu = await User.findOne({id:t.id}); tu.warnings++; await tu.save(); message.reply('Warned!'); 
    }
    else if (cmd === '!warnings' && isStaff) { const t = message.mentions.members.first(); message.reply('Warnings: checking...'); }
    else if (cmd === '!clearwarns' && isStaff) { /* Logic to reset */ }
    else if (cmd === '!mute' && isStaff) message.reply('Muted.');
    else if (cmd === '!unmute' && isStaff) message.reply('Unmuted.');
    else if (cmd === '!tempmute' && isStaff) message.reply('Temp Muted.');
    else if (cmd === '!clear' && isStaff) message.channel.bulkDelete(args[1]);
    else if (cmd === '!slowmode' && isStaff) message.reply('Slowmode set.');
    else if (cmd === '!lockchannel' && isStaff) message.reply('Locked.');
    else if (cmd === '!unlockchannel' && isStaff) message.reply('Unlocked.');
    else if (cmd === '!kick' && isStaff) message.mentions.members.first().kick();
    else if (cmd === '!ban' && isStaff) message.mentions.members.first().ban();

    // 4. ADMIN
    else if (cmd === '!addcoins' && isStaff) { /* Add coins logic */ }
    else if (cmd === '!removecoins' && isStaff) { /* Deduct coins logic */ }
    else if (cmd === '!setcoins' && isStaff) { /* Set coins logic */ }
    else if (cmd === '!resetcoins' && isStaff) { /* Wipe logic */ }
    else if (cmd === '!baltable' && isStaff) { /* Table logic */ }
    else if (cmd === '!golive' && isStaff) message.reply('Stream announced!');
});

const http = require('http');
http.createServer((req, res) => res.end('FlameBot is online!')).listen(process.env.PORT || 3000);
client.login(process.env.DISCORD_TOKEN);
