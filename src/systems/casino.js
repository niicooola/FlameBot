const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { cleanAmount } = require('../utils/amounts');

// Slot machine emoji config
const SLOT_EMOJIS = ['🍒', '🍋', '🍇', '🍊', '💎', '7️⃣'];

async function handleCasino(message, args, command, userData) {
    if (command !== '!slots' && command !== '!coinflip' && command !== '!cf' && command !== '!blackjack' && command !== '!bj') return false;

    // ─── 1. WALLET VALIDATION ENGINE ───
    const betInput = args[1];
    if (!betInput) return message.reply(`❌ Usage: \`${command} <amount>\``);

    let bet = 0;
    if (betInput.toLowerCase() === 'all') {
        bet = userData.coins;
    } else {
        bet = cleanAmount(betInput);
    }

    if (bet === null || bet <= 0) return message.reply('❌ Enter a valid positive number for your bet, bro.');
    if (userData.coins < bet) return message.reply(`❌ You don't have enough coins. Your balance: 🪙 **${userData.coins}**`);
    if (bet < 10) return message.reply('❌ The table minimum bet is 🪙 **10 coins**.');

    // ─── 2. GAME LOBBY ROUTING ───

    // ==========================================
    //              🎰 GAME 1: SLOTS              
    // ==========================================
    if (command === '!slots') {
        // Deduct bet immediately to protect against balance exploits
        userData.coins -= bet;

        const slot1 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];
        const slot2 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];
        const slot3 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];

        let multiplier = 0;
        let isWin = false;

        if (slot1 === slot2 && slot2 === slot3) {
            isWin = true;
            // Jackpot modifiers based on rarity
            multiplier = slot1 === '7️⃣' ? 10 : slot1 === '💎' ? 5 : 3;
        } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
            isWin = true;
            multiplier = 1.5; // Small double match payout
        }

        let outcomeText = '';
        if (isWin) {
            const winnings = Math.floor(bet * multiplier);
            userData.coins += winnings;
            outcomeText = `🎉 **WINNER!** You matched up and multiplied your bet by **x${multiplier}**!\n🪙 **Winnings Added:** +${winnings} coins`;
        } else {
            outcomeText = `💀 **LOOSER!** You didn't get any matches. Your coins are completely cooked.`;
        }

        await userData.save();

        const slotsEmbed = new EmbedBuilder()
            .setColor(isWin ? '#00FF00' : '#FF0000')
            .setTitle('🎰 FlameBot Luxury Slot Machine')
            .setDescription(`**[ ${slot1} | ${slot2} | ${slot3} ]**\n\n${outcomeText}\n• **New Balance:** 🪙 **${userData.coins}**`);

        return message.channel.send({ embeds: [slotsEmbed] });
    }

    // ==========================================
    //            🪙 GAME 2: COINFLIP             
    // ==========================================
    if (command === '!coinflip' || command === '!cf') {
        const choice = args[2]?.toLowerCase();
        if (choice !== 'heads' && choice !== 'tails') {
            return message.reply(`❌ Invalid choice. Usage: \`${command} <amount> <heads/tails>\``);
        }

        userData.coins -= bet;

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const isWin = choice === result;

        if (isWin) {
            const winnings = bet * 2;
            userData.coins += winnings;
            await message.reply(`🪙 The coin landed on **${result}**! You won **${winnings}** coins, bro!`);
        } else {
            await message.reply(`💀 The coin landed on **${result}**. You guessed wrong and got cooked.`);
        }

        await userData.save();
        return true;
    }

    // ==========================================
    //           🃏 GAME 3: BLACKJACK             
    // ==========================================
    if (command === '!blackjack' || command === '!bj') {
        userData.coins -= bet;
        await userData.save();

        // Core deck generation functions
        const drawCard = () => Math.floor(Math.random() * 10) + 1; 
        
        let playerHand = [drawCard(), drawCard()];
        let dealerHand = [drawCard(), drawCard()];

        const getScore = (hand) => hand.reduce((a, b) => a + b, 0);

        // Build interactive component buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_hit').setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bj_stand').setLabel('🛑 Stand').setStyle(ButtonStyle.Secondary)
        );

        const generateBjEmbed = (title, color, final = false) => {
            return new EmbedBuilder()
                .setColor(color)
                .setTitle(`🃏 Blackjack Table — Bet: 🪙 ${bet}`)
                .setDescription(
                    `**Your Hand:** ${playerHand.join(', ')} *(Total: **${getScore(playerHand)}**)*\n` +
                    `**Dealer Hand:** ${final ? dealerHand.join(', ') : dealerHand[0] + ', ❓'} *(Total: **${final ? getScore(dealerHand) : dealerHand[0]}**)*\n\n` +
                    `**Status:** ${title}`
                );
        };

        // Check if player hits an instant natural 21 blackjack
        if (getScore(playerHand) === 21) {
            const payout = Math.floor(bet * 2.5);
            const activeUser = await User.findOne({ id: message.author.id });
            activeUser.coins += payout;
            await activeUser.save();
            return message.channel.send({ embeds: [generateBjEmbed('🎉 Natural Blackjack! Payout x2.5 issued.', '#00FF00', true)] });
        }

        const gameMessage = await message.channel.send({
            embeds: [generateBjEmbed('Hit or Stand, bro?', '#FFFF00')],
            components: [row]
        });

        const filter = (i) => i.user.id === message.author.id;
        const collector = gameMessage.createMessageComponentCollector({ filter, time: 45000 });

        collector.on('collect', async (interaction) => {
            await interaction.deferUpdate();
            
            const activeUser = await User.findOne({ id: message.author.id });

            if (interaction.customId === 'bj_hit') {
                playerHand.push(drawCard());
                const playerScore = getScore(playerHand);

                if (playerScore > 21) {
                    collector.stop('busted');
                    return;
                }

                await gameMessage.edit({ embeds: [generateBjEmbed('Hit or Stand again?', '#FFFF00')] });
            } 
            
            else if (interaction.customId === 'bj_stand') {
                collector.stop('stand');
            }
        });

        collector.on('end', async (collected, reason) => {
            // Re-fetch database reference to prevent write sync issues
            const finalUser = await User.findOne({ id: message.author.id });
            let pScore = getScore(playerHand);
            let dScore = getScore(dealerHand);

            if (reason === 'busted') {
                // User busted, database coins already subtracted at boot
                return gameMessage.edit({
                    embeds: [generateBjEmbed('💥 Busted! You went over 21 and lost the pot.', '#FF0000', true)],
                    components: []
                });
            }

            if (reason === 'stand') {
                // Run automated Dealer AI simulation loop
                while (dScore < 17) {
                    dealerHand.push(drawCard());
                    dScore = getScore(dealerHand);
                }

                let resultText = '';
                let finalColor = '#FFFF00';

                if (dScore > 21) {
                    finalUser.coins += bet * 2;
                    resultText = '🎉 Dealer busted! **You win!**';
                    finalColor = '#00FF00';
                } else if (pScore > dScore) {
                    finalUser.coins += bet * 2;
                    resultText = '🏆 You outscored the dealer! **You win!**';
                    finalColor = '#00FF00';
                } else if (pScore < dScore) {
                    resultText = '💀 Dealer wins. You got cooked.';
                    finalColor = '#FF0000';
                } else {
                    finalUser.coins += bet; // Push scenario: give back original bet
                    resultText = '👔 Tie Game. It\'s a push.';
                    finalColor = '#808080';
                }

                await finalUser.save();
                return gameMessage.edit({
                    embeds: [generateBjEmbed(resultText, finalColor, true)],
                    components: []
                });
            }

            // Cleanup if user goes completely AFK and times out the collector
            if (reason === 'time') {
                return gameMessage.edit({
                    embeds: [generateBjEmbed('⏱️ Session timed out. Table folded.', '#FF0000', true)],
                    components: []
                });
            }
        });

        return true;
    }

    return false;
}

module.exports = { handleCasino };
