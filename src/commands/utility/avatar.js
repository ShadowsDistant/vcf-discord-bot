'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { PALETTE } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Display a user's avatar.")
    .addUserOption((o) =>
      o.setName('user').setDescription('The user whose avatar to show (defaults to you).'),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;

    const globalAvatar = target.displayAvatarURL({ dynamic: true, size: 1024 });
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const serverAvatar = member?.displayAvatarURL({ dynamic: true, size: 1024 }) ?? null;

    const embed = new EmbedBuilder()
      .setColor(PALETTE.primary)
      .setTitle(`🖼️  ${target.tag}'s Avatar`)
      .setImage(serverAvatar ?? globalAvatar)
      .setTimestamp()
      .setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    // If the user has a server-specific avatar, also link the global one
    if (serverAvatar && serverAvatar !== globalAvatar) {
      embed.setDescription(`[Server Avatar](${serverAvatar}) · [Global Avatar](${globalAvatar})`);
    } else {
      embed.setDescription(`[Open Full Size](${globalAvatar})`);
    }

    return interaction.reply({ embeds: [embed] });
  },
};
