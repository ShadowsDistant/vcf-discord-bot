'use strict';

const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../../utils/database');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('View Profile')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false),

  async execute(interaction) {
    const target = interaction.targetUser;
    const shift = db.getActiveShift(interaction.guild.id, target.id);
    const warnings = db.getWarnings(interaction.guild.id, target.id);
    const snapshot = economy.getUserSnapshot(interaction.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Profile: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Warnings', value: `**${warnings.length}**`, inline: true },
        { name: 'Shift Status', value: shift ? '🟢 On Shift' : '⚪ Off Shift', inline: true },
        { name: 'Bakery', value: `**${snapshot.user.bakeryName ?? 'My Bakery'}**`, inline: true },
        { name: 'Cookies', value: economy.toCookieNumber(snapshot.user.cookies ?? 0), inline: true },
        { name: 'CPS', value: economy.toCookieNumber(economy.computeCps(snapshot.user, Date.now())), inline: true },
        { name: 'Achievements', value: `${(snapshot.user.milestones ?? []).length}`, inline: true },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
