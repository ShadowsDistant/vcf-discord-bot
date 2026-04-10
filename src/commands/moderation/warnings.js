'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { truncate } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("View a member's warnings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to check.').setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const warnings = db.getWarnings(interaction.guild.id, target.id);

    if (warnings.length === 0) {
      return interaction.reply({
        embeds: [
          embeds.info(
            `Warnings for ${target.tag}`,
            '  This user has no warnings.',
            interaction.guild,
          ),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`  Warnings for ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setFooter({
        text: `${warnings.length} warning${warnings.length !== 1 ? 's' : ''} total · ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      })
      .setTimestamp();

    // Show up to 10 most recent warnings
    const recent = warnings.slice(-10).reverse();
    for (const [i, w] of recent.entries()) {
      embed.addFields({
        name: `#${warnings.length - i}  —  <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:D>`,
        value: `**Reason:** ${truncate(w.reason, 200)}\n**Moderator:** <@${w.moderatorId}>`,
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
