const { EmbedBuilder } = require('discord.js');
const { MUTE_ROLE_ID } = require('../config');
const { cleanAmount } = require('../utils/amounts');

const eightBallAnswers = [
    'Yes.', 'No.', 'Probably.', 'Definitely.',
    'Outlook grim.', 'Ask again later.', 'Absolutely not.', 'Looks good.'
];

// In-memory chambers for the roulette game (6 slots per channel)
const activeChambers = new Map();

async function handleFun(message, args, command, userData) {
    // ─── 🎰 NEW UPGRADE: HIGH-STAKES RUSSIAN ROULETTE ───
    if (command === '!roulette' || command === '!rr') {
        const bet = cleanAmount(args[1]);
        if (!bet || bet <= 0) {
            return message.reply('❌ Usage: `!roulette <coin_bet>`\nExample: `!roulette 150`\n*Warning: Getting shot mutes you for 1 minute!*');
        }

        if (userData.coins < bet) {
            return message.reply(`❌ You don't have enough coins, bro. Balance: 🪙 **${userData.coins}**`);
        }

        const channelId = message.channel.id;
        
        // Initialize a fresh 6-shot cylinder if it doesn't exist or was emptied
        if (!activeChambers.has(channelId) || activeChambers.get(channelId).length === 0) {
            // 1 means bullet, 0 means empty chamber
            const newCylinder = [1, 0, 0, 0, 0, 0];
            // Shuffle the cylinder randomly
            for (let i = newCylinder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newCylinder[i], newCylinder[j]] = [newCylinder[j], newCylinder[i]];
            }
            activeChambers.set(channelId, newCylinder);
        }

        const cylinder = activeChambers.get(channelId);
        const shot = cylinder.pop(); // Pull the current chamber choice
        const remaining = cylinder.length;

        // Deduct bet initially
        userData.coins -= bet;

        const introEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔫 Russian Roulette')
            .setDescription(`<@${message.author.id}> spins the cylinder, puts the barrel to their head, and pulls the trigger... \n\nChambers remaining: **${remaining + 1}/6**`)
            .setFooter({ text: 'Spins... click...' });

        const gameMsg = await message.channel.send({ embeds: [introEmbed] });
        
        // Simulate dramatic delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (shot === 1) {
            // 💥 BOOM! User died.
            await userData.save(); // Save the coin loss

            const deadEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('💥 BAM! You Got Cooked!')
                .setDescription(`💀 <@${message.author.id}> pulled the live round! You lost 🪙 **${bet}** coins and have been muted for **1 minute** to think about your life choices.`)
                .setImage('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Y5dW10Zms5M3B0ZnRndm9icW9icW9icW9icW9icW9icW9pbmQmY3Q9Zw/3McM766UHIW8U/giphy.gifFallback');

            await gameMsg.edit({ embeds: [deadEmbed] });

            // Apply Server Mute Role instantly
            const muteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);
            if (muteRole) {
                await message.member.roles.add(muteRole).catch(() => {});
                // Automatically unmute after 60 seconds
                setTimeout(async () => {
                    await message.member.roles.remove(muteRole).catch(() => {});
                    message.channel.send(`🔊 <@${message.author.id}> survived the emergency room and has been unmuted.`);
                }, 60000);
            }
        } else {
            // 🔒 CLICK. User survived!
            const winnings = Math.floor(bet * 1.5); // 1.5x Multiplier for surviving
            userData.coins += winnings; 
            await userData.save();

            const winEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔒 *CLICK*... Survival!')
                .setDescription(`🍀 The chamber was empty! <@${message.author.id}> walks away alive.\n\n• **Payout:** 🪙 **${winnings}** coins\n• **Wallet:** 🪙 **${userData.coins}**\n• **Chambers left in this gun:** **${remaining}**`)
                .setFooter({ text: 'Run it again or pass the gun, bro.' });

            await gameMsg.edit({ embeds: [winEmbed] });
        }
        return true;
    }

    // ─── EXISTING FUN COMMANDS ───
    if (command === '!8ball') {
        const question = args.slice(1).join(' ');
        if (!question) return message.reply('❌ Ask a question first.');[cite: 17]

        const answer = eightBallAnswers[Math.floor(Math.random() * eightBallAnswers.length)];[cite: 17]
        return message.reply(`🔮 **8-Ball:** ${answer}`);[cite: 17]
    }

    if (command === '!rps') {
        const choice = args[1]?.toLowerCase();[cite: 17]

        if (!['rock', 'paper', 'scissors'].includes(choice)) {[cite: 17]
            return message.reply('❌ Pick `rock`, `paper`, or `scissors`.');[cite: 17]
        }

        const options = ['rock', 'paper', 'scissors'];[cite: 17]
        const bot = options[Math.floor(Math.random() * options.length)];[cite: 17]

        if (choice === bot) {[cite: 17]
            return message.reply(`🤝 Draw. Both picked **${choice}**.`);[cite: 17]
        }

        const win =
            (choice === 'rock' && bot === 'scissors') ||[cite: 17]
            (choice === 'paper' && bot === 'rock') ||[cite: 17]
            (choice === 'scissors' && bot === 'paper');[cite: 17]

        return message.reply(
            win
                ? `🎉 You won. You picked **${choice}**, I picked **${bot}**.`[cite: 17]
                : `❌ You lost. You picked **${choice}**, I picked **${bot}**.`[cite: 17]
        );
    }

    if (command === '!roll') {
        const maxInput = args[1];[cite: 17]
        
        if (!maxInput) {[cite: 17]
            const defaultRoll = Math.floor(Math.random() * 6) + 1;[cite: 17]
            return message.reply(`🎲 You rolled a **${defaultRoll}** out of 6.`);[cite: 17]
        }

        const max = cleanAmount(maxInput);[cite: 17]

        if (max === null || isNaN(max) || max <= 0) {[cite: 17]
            return message.reply('❌ You can\'t roll a zero or negative number. Choose a valid positive number.');[cite: 17]
        }

        const MAX_ROLL_LIMIT = 1000000;[cite: 17]
        if (max > MAX_ROLL_LIMIT || !isFinite(max)) {[cite: 17]
            return message.reply(`❌ That number is too big! The maximum allowed roll value is **${MAX_ROLL_LIMIT.toLocaleString()}**.`);[cite: 17]
        }

        const roll = Math.floor(Math.random() * max) + 1;[cite: 17]
        return message.reply(`🎲 You rolled a **${roll}** out of **${max}**.`);[cite: 17]
    }

    if (command === '!choose') {
        const choices = args[cite: 17]
            .slice(1)[cite: 17]
            .join(' ')[cite: 17]
            .split('|')[cite: 17]
            .map(x => x.trim())[cite: 17]
            .filter(Boolean);[cite: 17]

        if (choices.length < 2) {[cite: 17]
            return message.reply('❌ Use `!choose option 1 | option 2`.');[cite: 17]
        }

        return message.reply(`🤔 I choose: **${choices[Math.floor(Math.random() * choices.length)]}**`);[cite: 17]
    }

    if (command === '!coin') {
        return message.reply(`🪙 **${Math.random() < 0.5 ? 'HEADS' : 'TAILS'}**`);[cite: 17]
    }

    if (command === '!dice') {
        return message.reply(`🎲 You rolled **${Math.floor(Math.random() * 6) + 1}**.`);[cite: 17]
    }

    if (command === '!poll') {
        const title = args.slice(1).join(' ');[cite: 17]
        if (!title) return message.reply('❌ Usage: `!poll <question>`');[cite: 17]

        const embed = new EmbedBuilder()[cite: 17]
            .setColor('#FF8C00') Cast[cite: 17]
            .setTitle('📊 Server Poll')[cite: 17]
            .setDescription(title)[cite: 17]
            .setFooter({ text: `Opened by ${message.author.username}` });[cite: 17]

        const poll = await message.channel.send({ embeds: [embed] });[cite: 17]

        await poll.react('👍');[cite: 17]
        await poll.react('👎');[cite: 17]

        return true;
    }

    if (command === '!bananabread') {
        return message.reply([cite: 17]
            '🍌🍞 **Banana Bread:** Mix 3 ripe bananas, 1/3 cup melted butter, 1 tsp baking soda, 1 cup sugar, 1 egg, and 1.5 cups flour. Bake at 350°F for about 1 hour.'[cite: 17]
        );[cite: 17]
    }

    return false;[cite: 17]
}

module.exports = {
    handleFun,
    eightBallAnswers
};
