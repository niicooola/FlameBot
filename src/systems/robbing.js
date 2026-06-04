const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');

// System Configurations
const ROB_COOLDOWN = 45 * 60 * 1000; // 45 Minutes
const MIN_COINS_REQUIRED = 300;       // Higher barrier to entry
let GLOBAL_BOUNTY_POOL = 1000;       // Stays in memory, increases on failures

async function handleRobbing(message, args, command) {
    if (command !== '!rob' && command !== '!bounty' && command !== '!heiststats') return false;

    // ─── OPTION 1: VIEW GLOBAL CRIMINAL BOUNTY ───
    if (command === '!bounty') {
        return message.reply(`🚓 **Current Police Bounty Pool:** 🪙 **${GLOBAL_BOUNTY_POOL}** coins.\n*Claim it by executing a perfect heist, or add to it by getting caught!*`);
    }

    // ─── OPTION 2: GENERAL ROB COMMAND ───
    if (command === '!rob') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Usage: `!rob @user`');
        if (target.id === message.author.id) return message.reply('💀 Bro tried to rob himself. You are completely cooked.');
        if (target.user.bot) return message.reply('❌ You cannot rob bots.');

        try {
            const robberData = await User.findOne({ id: message.author.id }) || await User.create({ id: message.author.id });
            const victimData = await User.findOne({ id: target.id }) || await User.create({ id: target.id });

            // Cooldown Verification
            const now = new Date();
            if (robberData.lastRobbed) {
                const timePassed = now - new Date(robberData.lastRobbed);
                if (timePassed < ROB_COOLDOWN) {
                    const timeLeft = Math.ceil((ROB_COOLDOWN - timePassed) / 60000);
                    return message.reply(`🚨 The heat is still on you. Wait another **${timeLeft} minutes**, bro.`);
                }
            }

            // Wallet Minimum Balance Checks
            if (robberData.coins < MIN_COINS_REQUIRED) {
                return message.reply(`❌ You need at least 🪙 **${MIN_COINS_REQUIRED}** coins in your wallet to plan a robbery.`);
            }
            if (victimData.coins < MIN_COINS_REQUIRED) {
                return message.reply(`❌ <@${target.id}> does not have enough coins to be worth targeting.`);
            }

            // Establish Baseline Success Chance
            let successChance = 0.40; // 40% base rate

            // Item Expansion Logic Check (Assuming inventory maps exist)
            const hasSkiMask = robberData.inventory?.includes('ski_mask') || false;
            const hasVaultDoor = victimData.inventory?.includes('vault_door') || false;

            if (hasSkiMask) successChance += 0.15;  // Buffs chance to 55%
            if (hasVaultDoor) successChance -= 0.20; // Drops chance by 20%

            // Server Booster Perk Modification
            if (message.member.premiumSince) {
                successChance += 0.05; // 5% boost for supporting the server
            }

            // Lock timestamp to prevent spam exploits
            robberData.lastRobbed = now;

            const roll = Math.random();
            const isSuccess = roll < successChance;

            if (isSuccess) {
                // Determine stolen yield (15% to 45%)
                const stealPercentage = Math.random() * (0.45 - 0.15) + 0.15;
                let amountStolen = Math.floor(victimData.coins * stealPercentage);

                // Check if they trigger the lucky Bounty claim (5% chance on a successful rob)
                let claimedBounty = 0;
                if (Math.random() < 0.05 && GLOBAL_BOUNTY_POOL > 0) {
                    claimedBounty = GLOBAL_BOUNTY_POOL;
                    GLOBAL_BOUNTY_POOL = 1000; // Reset pool
                }

                robberData.coins += (amountStolen + claimedBounty);
                victimData.coins -= amountStolen;

                await robberData.save();
                await victimData.save();

                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🥷 Successful Heist!')
                    .setDescription(
                        `💰 <@${message.author.id}> managed to rob <@${target.id}>!\n\n` +
                        `• **Stolen Wealth:** 🪙 **${amountStolen}** coins\n` +
                        (claimedBounty > 0 ? `• **🚨 BOUNTY JACKPOT:** You also cleared the 🪙 **${claimedBounty}** police pool!\n` : '') +
                        `• **Your New Balance:** 🪙 **${robberData.coins}**`
                    )
                    .setFooter({ text: `Final calculated success chance: ${(successChance * 100).toFixed(0)}%` });

                await message.channel.send({ embeds: [successEmbed] });

            } else {
                // Penalty Calculation (Lose 20% of current wallet)
                const fineAmount = Math.floor(robberData.coins * 0.20);
                
                // 30% of the fine goes to the bounty pool, 70% goes straight to the victim
                const bountyAddition = Math.floor(fineAmount * 0.30);
                const victimCompensation = fineAmount - bountyAddition;

                GLOBAL_BOUNTY_POOL += bountyAddition;
                robberData.coins -= fineAmount;
                victimData.coins += victimCompensation;

                await robberData.save();
                await victimData.save();

                const failEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 Caught by Security!')
                    .setDescription(
                        `💀 <@${message.author.id}> tried to rob <@${target.id}> but got cooked by the security system!\n\n` +
                        `• **Total Fine Paid:** 🪙 **${fineAmount}** coins\n` +
                        `• **Victim Compensation:** <@${target.id}> received 🪙 **${victimCompensation}**\n` +
                        `• **Bounty Pool Increase:** 🪙 **${bountyAddition}** added to the police tracking system.`
                    );

                await message.channel.send({ embeds: [failEmbed] });
            }

            return true;
        } catch (err) {
            console.error('Robbing script crash:', err);
            return message.reply('❌ Database transaction failure.');
        }
    }
    return false;
}

module.exports = { handleRobbing };
