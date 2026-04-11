'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bake')
    .setDescription('Bake cookies, trigger events, and grow your chaotic pastry empire.'),

  async execute(interaction) {
    const result = economy.bake(interaction.guild.id, interaction.user.id);
    const { user, item, passive, manualYield, golden, newlyEarned } = result;
    const rarity = economy.RARITY[item.rarity];
    const cps = economy.computeCps(user, Date.now());

    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setTitle(`${rarity.emoji} Fresh Batch: ${item.name}`)
      .setDescription(`You baked **${item.name}** and pocketed **${economy.toCookieNumber(manualYield)}** manual cookies.`)
      .setTimestamp()
      .addFields(
        { name: 'Rarity', value: rarity.name, inline: true },
        { name: 'Cookies', value: economy.toCookieNumber(user.cookies), inline: true },
        { name: 'CPS', value: economy.toCookieNumber(cps), inline: true },
        { name: 'Passive payout', value: `+${economy.toCookieNumber(passive.gained)} (${Math.floor(passive.elapsedMs / 1000)}s)`, inline: true },
      );

    if (interaction.guild) {
      embed.setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });
    }

    embed.setThumbnail(economy.getCookieImage(item.id));
    if (newlyEarned.length > 0) {
      embed.setAuthor({
        name: 'New achievement unlocked!',
        iconURL: economy.getAchievementImage(newlyEarned[0].id),
      });
      embed.addFields({
        name: '🏆 New achievements',
        value: newlyEarned.slice(0, 4).map((achievement) => `• **${achievement.name}**`).join('\n'),
      });
    }

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bakery_nav:buildings').setLabel('Store').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bakery_nav:inventory').setLabel('Inventory').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bakery_nav:stats').setLabel('Stats').setStyle(ButtonStyle.Secondary),
      ),
    ];

    if (golden) {
      const seconds = Math.max(1, Math.floor((golden.expiresAt - Date.now()) / 1000));
      embed.addFields({
        name: '🌟 Golden Cookie!',
        value: `Smash it within **${seconds}s** or it mocks your reflexes forever.`,
      });
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`bake_golden_claim:${interaction.user.id}:${golden.token}`)
            .setLabel('Claim Golden Cookie')
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }

    return interaction.reply({ embeds: [embed], components });
  },
};
