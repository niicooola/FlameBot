const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');

const ROB_COOLDOWN = 45 * 60 * 1000; // 45 Minutes
const MIN_COINS_REQUIRED = 300;

const ROBBERY_MODES = {
    'rob_pickpocket': {
        name: 'Pickpocket',
        successChance: 0.70,
        minSteal: 0.05,
        maxSteal: 0.15,
        failPenalty: 0.10
    },
    'rob_grandtheft': {
        name: 'Grand Theft',
        successChance: 0.45,
        minSteal: 0.15,
        maxSteal: 0.35,
        failPenalty: 0.20
    },
    'rob_corporate': {
        name: 'Corporate Heist',
        successChance: 0.20,
        minSteal: 0.40,
        maxSteal: 0.75,
        failPenalty: 0.45
    }
};

async function handleRobbing(message, args, command) {
    if (command !== '!rob') return false;

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Usage: `!rob @user`');
    if (target.id === message.author.id) return message.reply('💀 Bro tried to rob himself. You are completely cooked.');
    if (target.user.bot) return message.reply('❌ You cannot rob bots.');

    try {
        const robberData = await User.findOne({ id: message.author.id }) || await User.create({ id: message.author.id });
        const victimData = await User.findOne({ id: target.id }) || await User.create({ id: target.id });

        // ─── 1. COOLDOWN CHECK ───
        const now = new Date();
        if (robberData.lastRobbed) {
            const timePassed = now - new Date(robberData.lastRobbed);
            if (timePassed < ROB_COOLDOWN) {
                const timeLeft = Math.ceil((ROB_COOLDOWN - timePassed) / 60000);
                return message.reply(`🚨 The heat is still on you. Wait another **${timeLeft} minutes**, bro.`);
            }
        }

        // ─── 2. BALANCE CHECK ───
        if (robberData.coins < MIN_COINS_REQUIRED) {
            return message.reply(`❌ You need at least 🪙 **${MIN_COINS_REQUIRED}** coins to plan a robbery.`);
        }
        if (victimData.coins < MIN_COINS_REQUIRED) {
            return message.reply(`❌ <@${target.id}> does not have enough coins to be worth targeting.`);
        }

        // ─── 🛡️ NEW FIXED GATE: ACTIVE PROTECTION SHIELD CHECK ───
        // Safely checks if victim inventory object exists and contains a shield count higher than 0
        const victimShields = victimData.inventory ? (victimData.inventory['shield'] || 0) : 0;

        if (victimShields > 0) {
            // 1. Break 1 shield from the victim's asset allocation inventory map
            victimData.inventory['shield'] = victimShields - 1;
            victimData.markModified('inventory');
            await victimData.save();

            // 2. Slap the robber with the cooldown anyway for attempting the heist
            robberData.lastRobbed = now;
            await robberData.save();

            const shieldEmbed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('🛡️ Shield Deflection Active!')
                .setDescription(
                    `⚡ <@${message.author.id}> tried to rob <@${target.id}>, but ran straight into a **Protection Shield**!\n\n` +
                    `💥 The security matrix deflected the attempt completely. <@${target.id}>'s shield shattered in the process, but their coins are safe!\n\n` +
                    `🚨 <@${message.author.id}>, you are still marked by police and your cooldown has started, bro.`
                );

            return message.channel.send({ embeds: [shieldEmbed] });
        }

        // ─── 3. CREATE INTERACTIVE ACTION MENUS IF GATES CLEAR ───
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rob_pickpocket').setLabel('🥷 Pickpocket (70%)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rob_grandtheft').setLabel('💰 Grand Theft (45%)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('rob_corporate').setLabel('💎 Corp Heist (20%)').setStyle(ButtonStyle.Danger)
        );

        const menuEmbed = new EmbedBuilder()
            .setColor('#FFFF00')
            .setTitle('🥷 Choose Your Robbery Strategy')
            .setDescription(
                `Select an option below to choose how you want to rob <@${target.id}>:\n\n` +
                `🥷 **Pickpocket:** High Success, Low Payout (5% - 15%)\n` +
                `💰 **Grand Theft:** Medium Success, Medium Payout (15% - 35%)\n` +
                `💎 **Corporate Heist:** Low Success, Extreme Payout (40% - 75%)`
            )
            .setFooter({ text: 'You have 30 seconds to make your move...' });

        const menuMessage = await message.channel.send({ embeds: [menuEmbed], components: [row] });
        
        const filter = (i) => i.user.id === message.author.id;
        const collector = menuMessage.createMessageComponentCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async (interaction) => {
            await interaction.deferUpdate();

            const mode = ROBBERY_MODES[interaction.customId];
            if (!mode) return;

            // Fresh database profile fetch at action execution point
            const activeRobber = await User.findOne({ id: message.author.id });
            const activeVictim = await User.findOne({ id: target.id });

            // Lock the final robbery cooldown timestamp
            activeRobber.lastRobbed = new Date();

            const roll = Math.random();
            const isSuccess = roll < mode.successChance;

            if (isSuccess) {
                const stealPercentage = Math.random() * (mode.maxSteal - mode.minSteal) + mode.minSteal;
                const amountStolen = Math.floor(activeVictim.coins * stealPercentage);

                activeRobber.coins += amountStolen;
                activeVictim.coins -= amountStolen;

                await activeRobber.save();
                await activeVictim.save();

                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(`✅ Successful ${mode.name}!`)
                    .setDescription(
                        `💰 <@${message.author.id}> pulled off the heist against <@${target.id}>!\n\n` +
                        `• **Strategy Used:** ${mode.name}\n` +
                        `• **Stolen Wealth:** 🪙 **${amountStolen}** coins\n` +
                        `• **Your New Balance:** 🪙 **${activeRobber.coins}**`
                    );

                await menuMessage.edit({ embeds: [successEmbed], components: [] });
            } else {
                const fineAmount = Math.floor(activeRobber.coins * mode.failPenalty);
                
                activeRobber.coins -= fineAmount;
                activeVictim.coins += fineAmount;

                await activeRobber.save();
                await activeVictim.save();

                const failEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`🚨 ${mode.name} Failed!`)
                    .setDescription(
                        `💀 <@${message.author.id}> tried to execute a ${mode.name} but got cooked by security!\n\n` +
                        `• **Penalty:** Paid 🪙 **${fineAmount}** coins in damages.\n` +
                        `• **Compensation:** <@${target.id}> received the full fine layout.`
                    );

                await menuMessage.edit({ embeds: [failEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await menuMessage.edit({ 
                    content: '⏱️ You took too long to pick a strategy. The target walked away.', 
                    embeds: [], 
                    components: [] 
                }).catch(() => {});
            }
        });

        return true;
    } catch (err) {
        console.error('Robbing shield check engine breakdown:', err);
        return message.reply('❌ System transaction failure.');
    }
}

module.exports = { handleRobbing };
