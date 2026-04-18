'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const analytics = require('../../utils/analytics');
const { sendModerationActionDm, sendModLog, sendCommandLog } = require('../../utils/moderationNotifications');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to warn.').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Reason for the warning. Start typing to see preset reasons.')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction) {
    // Mod-role check (Moderator level required when roles are configured)
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (target.id === interaction.user.id) {
      return interaction.reply({
        embeds: [embeds.error('You cannot warn yourself.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const warnings = db.addWarning(interaction.guild.id, target.id, {
      moderatorId: interaction.user.id,
      reason,
    });
    await sendModerationActionDm({
      user: target,
      guild: interaction.guild,
      action: 'Warning',
      reason,
      moderatorTag: interaction.user.tag,
    });
    await sendModLog({
      guild: interaction.guild,
      target,
      moderator: interaction.user,
      action: 'Warn',
      reason,
      extra: `Total warnings: **${warnings.length}**`,
    });
    await sendCommandLog({
      guild: interaction.guild,
      moderator: interaction.user,
      action: 'Warn',
      target: `${target.tag} (${target.id})`,
      details: `Reason: ${reason} — Total warnings: ${warnings.length}`,
    });
    analytics.recordModAction(interaction.guild.id, 'warn', Date.now());

    return interaction.reply({
      embeds: [
        embeds
          .modAction({
            action: 'Member Warned',
            emoji: '',
            target,
            moderator: interaction.user,
            reason,
            guild: interaction.guild,
          })
          .setColor(0xfee75c)
          .addFields({
            name: '  Total Warnings',
            value: `${warnings.length}`,
            inline: true,
          }),
      ],
    });
  },
};
