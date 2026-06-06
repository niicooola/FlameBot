const { EmbedBuilder } = require('discord.js');
const { cleanAmount } = require('../utils/amounts');
const { CASINO_COOLDOWN, MUTE_ROLE_ID } = require('../config');

const PLINKO_MULTIPLIERS = [5.0, 2.0, 0.5, 0.2, 0.5, 2.0, 5.0];[cite: 15]
const PLINKO_ROWS = 6;[cite: 15]
const SLOT_EMOJIS = ['🍒', '🍋', '🍇', '🍊', '💎', '7️⃣'];[cite: 15]
const lastGambled = {};[cite: 15]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));[cite: 15]

// In-memory cylinders for Russian Roulette (6 chambers per channel)
const activeChambers = new Map();

function generatePlinkoFrame(currentRow, currentPos) {[cite: 15]
    let rows = [[cite: 15]
        [' ', ' ', ' ', '.', ' ', '.', ' ', ' ', ' '],[cite: 15]
        [' ', ' ', '.', ' ', '.', ' ', '.', ' ', ' '],[cite: 15]
        [' ', '.', ' ', '.', ' ', '.', ' ', '.', ' '],[cite: 15]
        [' ', '.', ' ', '.', ' ', '.', ' ', '.', ' ', '.'],[cite: 15]
        ['.', ' ', '.', ' ', '.', ' ', '.', ' ', '.', ' '],[cite: 15]
        ['.', ' ', '.', ' ', '.', ' ', '.', ' ', '.', ' ', '.'][cite: 15]
    ];[cite: 15]

    if (currentRow >= 0 && currentRow < PLINKO_ROWS) {[cite: 15]
        const activeIndex = Math.max(0, Math.min(rows[currentRow].length - 1, currentPos));[cite: 15]
        rows[currentRow][activeIndex] = '●';[cite: 15]
    }[cite: 15]

    let boardText = '```\n       ' + (currentRow === -1 ? 'DROP' : 'DROP') + '\n';[cite: 15]

    for (let r = 0; r < PLINKO_ROWS; r++) {[cite: 15]
        const padding = ' '.repeat(PLINKO_ROWS - r + 1);[cite: 15]
        boardText += padding + rows[r].join('') + '\n';[cite: 15]
    }[cite: 15]

    boardText += ' ───────────────────────\n';[cite: 15]
    boardText += ' [5x][2x][.5][.2][.5][2x][5x]\n
```';[cite: 15]

    return boardText;[cite: 15]
}[cite: 15]

async function runPlinkoGame(message, args, userData) {[cite: 15]
    const bet = cleanAmount(args[1]);[cite: 15]

    if (!bet || bet <= 0) {[cite: 15]
        await message.reply('❌ Usage: `!plinko <amount>`');[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    if (userData.coins < bet) {[cite: 15]
        await message.reply(`❌ You need 🪙 **${bet}**.`);[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    userData.coins -= bet;[cite: 15]
    await userData.save();[cite: 15]

    const path = [];[cite: 15]
    let rightTurns = 0;[cite: 15]

    for (let i = 0; i < PLINKO_ROWS; i++) {[cite: 15]
        const turn = Math.random() > 0.5 ? 1 : 0;[cite: 15]
        path.push(turn);[cite: 15]
        if (turn === 1) rightTurns++;[cite: 15]
    }[cite: 15]

    const multiplier = PLINKO_MULTIPLIERS[rightTurns];[cite: 15]
    const winnings = Math.floor(bet * multiplier);[cite: 15]

    const gameMessage = await message.reply({[cite: 15]
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${generatePlinkoFrame(-1, 3)}\nPlacing bet... 🪙`[cite: 15]
    });[cite: 15]

    let currentBallPos = 3;[cite: 15]

    for (let r = 0; r < PLINKO_ROWS; r++) {[cite: 15]
        await sleep(500);[cite: 15]

        currentBallPos += path[r] === 1 ? 1 : -1;[cite: 15]

        await gameMessage.edit({[cite: 15]
            content: `🎰 **FLAMEBOT PLINKO** 🎰\n${generatePlinkoFrame(r, currentBallPos)}\nBouncing...`[cite: 15]
        });[cite: 15]
    }[cite: 15]

    userData.coins += winnings;[cite: 15]
    await userData.save();[cite: 15]

    const netChange = winnings - bet;[cite: 15]
    const resultText = netChange >= 0[cite: 15]
        ? `🟢 **WIN!** Landed on **${multiplier}x** and got 🪙 **${winnings}**.`[cite: 15]
        : `🔴 **LOSS!** Landed on **${multiplier}x** and got back 🪙 **${winnings}**.`;[cite: 15]

    await sleep(500);[cite: 15]

    await gameMessage.edit({[cite: 15]
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${generatePlinkoFrame(PLINKO_ROWS, currentBallPos)}\n${resultText}\nWallet: 🪙 **${userData.coins}**`[cite: 15]
    });[cite: 15]

    return true;[cite: 15]
}[cite: 15]

async function runSlotsGame(message, args, userData) {[cite: 15]
    const bet = cleanAmount(args[1]);[cite: 15]

    if (!bet || bet <= 0) {[cite: 15]
        await message.reply('❌ Usage: `!slots <amount>`');[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    if (userData.coins < bet) {[cite: 15]
        await message.reply(`❌ You need 🪙 **${bet}**.`);[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    userData.coins -= bet;[cite: 15]

    const slot1 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];[cite: 15]
    const slot2 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];[cite: 15]
    const slot3 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];[cite: 15]

    let multiplier = 0;[cite: 15]
    let title = '🔴 LOSE';[cite: 15]

    if (slot1 === slot2 && slot2 === slot3) {[cite: 15]
        multiplier = slot1 === '7️⃣' ? 10 : slot1 === '💎' ? 5 : 3;[cite: 15]
        title = '🎉 JACKPOT';[cite: 15]
    } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {[cite: 15]
        multiplier = 1.5;[cite: 15]
        title = '💵 MINI WIN';[cite: 15]
    }[cite: 15]

    const winnings = Math.floor(bet * multiplier);[cite: 15]
    userData.coins += winnings;[cite: 15]
    await userData.save();[cite: 15]

    const embed = new EmbedBuilder()[cite: 15]
        .setColor(multiplier > 0 ? '#00FF00' : '#FF0000')[cite: 15]
        .setTitle(`🎰 Slots: ${title}`)[cite: 15]
        .setDescription(`▶  [ ${slot1} | ${slot2} | ${slot3} ]  ◀\n\nResult: 🪙 **${winnings}** back.\nWallet: 🪙 **${userData.coins}**`);[cite: 15]

    await message.reply({ embeds: [embed] });[cite: 15]
    return true;[cite: 15]
}[cite: 15]

async function runCoinflipGame(message, args, userData) {[cite: 15]
    const sideInput = args[1]?.toLowerCase();[cite: 15]
    const bet = cleanAmount(args[2]);[cite: 15]

    if (!['heads', 'tails', 'h', 't'].includes(sideInput) || !bet || bet <= 0) {[cite: 15]
        await message.reply('❌ Usage: `!coinflip <heads/tails> <amount>`');[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    if (userData.coins < bet) {[cite: 15]
        await message.reply(`❌ Balance: 🪙 **${userData.coins}**`);[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    userData.coins -= bet;[cite: 15]

    const choice = sideInput === 'h' || sideInput === 'heads' ? 'heads' : 'tails';[cite: 15]
    const result = Math.random() > 0.5 ? 'heads' : 'tails';[cite: 15]

    const winnings = choice === result ? bet * 2 : 0;[cite: 15]

    userData.coins += winnings;[cite: 15]
    await userData.save();[cite: 15]

    const msg = winnings > 0[cite: 15]
        ? `🪙 Landed **${result}**. You won 🪙 **${winnings}**.`[cite: 15]
        : `🪙 Landed **${result}**. You lost 🪙 **${bet}**.`;[cite: 15]

    await message.reply(`${msg}\nWallet: 🪙 **${userData.coins}**`);[cite: 15]
    return true;[cite: 15]
}[cite: 15]

async function runBlackjackGame(message, args, userData) {[cite: 15]
    const bet = cleanAmount(args[1]);[cite: 15]

    if (!bet || bet <= 0) {[cite: 15]
        await message.reply('❌ Usage: `!blackjack <amount>`');[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    if (userData.coins < bet) {[cite: 15]
        await message.reply('❌ Not enough coins.');[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    const player = Math.floor(Math.random() * 10) + 12;[cite: 15]
    const dealer = Math.floor(Math.random() * 10) + 12;[cite: 15]

    if (dealer > 21 || player > dealer) {[cite: 15]
        userData.coins += bet;[cite: 15]
        await userData.save();[cite: 15]
        await message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**. You won 🪙 **${bet}**.`);[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    if (player === dealer) {[cite: 15]
        await message.reply(`🃏 Push. Both got **${player}**.`);[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    userData.coins -= bet;[cite: 15]
    await userData.save();[cite: 15]
    await message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**. You lost 🪙 **${bet}**.`);[cite: 15]
    return true;[cite: 15]
}[cite: 15]

async function runRouletteGame(message, args, userData) {
    const bet = cleanAmount(args[1]);
    if (!bet || bet <= 0) {
        await message.reply('❌ Usage: `!roulette <amount>`\n*Warning: Pulling the live round burns your bet and mutes you for 1 minute!*');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply(`❌ You don't have enough coins, bro. Wallet: 🪙 **${userData.coins}**`);
        return true;
    }

    const channelId = message.channel.id;
    
    if (!activeChambers.has(channelId) || activeChambers.get(channelId).length === 0) {
        const newCylinder = [1, 0, 0, 0, 0, 0];
        for (let i = newCylinder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newCylinder[i], newCylinder[j]] = [newCylinder[j], newCylinder[i]];
        }
        activeChambers.set(channelId, newCylinder);
    }

    const cylinder = activeChambers.get(channelId);
    const shot = cylinder.pop();
    const remaining = cylinder.length;

    userData.coins -= bet;

    const introEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔫 Casino Russian Roulette')
        .setDescription(`<@${message.author.id}> wagers 🪙 **${bet}** coins, spins the chamber, and pulls the trigger... \n\nChambers remaining: **${remaining + 1}/6**`)
        .setFooter({ text: 'Spins... click...' });

    const gameMsg = await message.channel.send({ embeds: [introEmbed] });
    
    await sleep(1500);

    if (shot === 1) {
        await userData.save();

        const deadEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💥 BAM! You Got Caught!')
            .setDescription(`💀 <@${message.author.id}> pulled the live round! Your bet of 🪙 **${bet}** has burned. You are muted for **1 minute**.`);

        await gameMsg.edit({ embeds: [deadEmbed] });

        const muteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);
        if (muteRole) {
            await message.member.roles.add(muteRole).catch(() => {});
            setTimeout(async () => {
                await message.member.roles.remove(muteRole).catch(() => {});
                message.channel.send(`🔊 <@${message.author.id}> survived surgery and has been unmuted.`);
            }, 60000);
        }
    } else {
        const winnings = Math.floor(bet * 2); // Double your cash for beating a standard chamber
        userData.coins += winnings; 
        await userData.save();

        const winEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🔒 *CLICK*... Clear Chamber!')
            .setDescription(`🍀 Empty chamber! <@${message.author.id}> beats the house.\n\n• **Earnings:** 🪙 **+${bet}** coins (2x payout)\n• **New Wallet:** 🪙 **${userData.coins}**\n• **Chambers left in gun:** **${remaining}**`);

        await gameMsg.edit({ embeds: [winEmbed] });
    }
    return true;
}

async function handleCasino(message, args, command, userData) {[cite: 15]
    if (!['!plinko', '!slots', '!coinflip', '!cf', '!blackjack', '!bj', '!gamble', '!roulette', '!rr'].includes(command)) {[cite: 15]
        return false;[cite: 15]
    }[cite: 15]

    const now = Date.now();[cite: 15]

    if (lastGambled[message.author.id] && now - lastGambled[message.author.id] < CASINO_COOLDOWN) {[cite: 15]
        const left = Math.ceil((CASINO_COOLDOWN - (now - lastGambled[message.author.id])) / 1000);[cite: 15]
        await message.reply(`❌ Casino cooldown. Wait **${left}s**.`);[cite: 15]
        return true;[cite: 15]
    }[cite: 15]

    lastGambled[message.author.id] = now;[cite: 15]

    if (command === '!plinko') return runPlinkoGame(message, args, userData);[cite: 15]
    if (command === '!slots') return runSlotsGame(message, args, userData);[cite: 15]
    if (command === '!coinflip' || command === '!cf') return runCoinflipGame(message, args, userData);[cite: 15]
    if (command === '!blackjack' || command === '!bj') return runBlackjackGame(message, args, userData);[cite: 15]
    if (command === '!roulette' || command === '!rr') return runRouletteGame(message, args, userData);

    if (command === '!gamble') {[cite: 15]
        const mode = args[1]?.toLowerCase();[cite: 15]

        if (mode === 'slots') {[cite: 15]
            return runSlotsGame(message, [args[0], args[2]], userData);[cite: 15]
        }[cite: 15]

        return message.reply('❌ Usage: `!gamble slots <amount>` or use `!plinko`, `!blackjack`, `!coinflip`, `!roulette`.');[cite: 15]
    }[cite: 15]

    return false;[cite: 15]
}[cite: 15]

module.exports = {
    handleCasino
};
