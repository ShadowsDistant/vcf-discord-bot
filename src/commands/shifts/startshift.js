'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { PALETTE } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startshift')
    .setDescription('Clock in and start your shift.')
    .setDMPermission(false),

  async execute(interaction) {
    const config = db.getConfig(interaction.guild.id);

    // ── Staff-role gate ───────────────────────────────────────────────────────
    const staffRoles = config.staffRoleIds ?? [];
    if (staffRoles.length === 0) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'No shift roles are configured yet. Management must add roles in `/setup staffroles add` before shifts can be started.',
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const hasRole = staffRoles.some((id) => interaction.member.roles.cache.has(id));
    if (!hasRole) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'You do not have a staff role that permits you to use the shift system.',
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const result = db.startShift(
      interaction.guild.id,
      interaction.user.id,
      interaction.user.tag,
    );

    if (!result) {
      return interaction.reply({
        embeds: [
          embeds.warning(
            "You're already on shift! Use `/endshift` to clock out first.",
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const startedTs = Math.floor(new Date(result.startedAt).getTime() / 1000);

    const shiftEmbed = embeds
      .shift(
        '  Shift Started',
        `Welcome back, ${interaction.user}! Your shift has begun.\n\nUse \`/endshift\` when you're done.`,
        interaction.guild,
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '  Staff Member', value: `${interaction.user}`, inline: true },
        { name: '  Started At', value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`, inline: true },
      );

    await interaction.reply({ embeds: [shiftEmbed] });

    // ── DM the user ───────────────────────────────────────────────────────────
    if (config.shiftDmsEnabled !== false) {
      const dmEmbed = new EmbedBuilder()
        .setColor(PALETTE.shift)
        .setTitle('  You Are Now On Shift')
        .setDescription(`You clocked in at **${interaction.guild.name}**.`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }) ?? null)
        .addFields(
          { name: '  Server', value: interaction.guild.name, inline: true },
          { name: '  Started At', value: `<t:${startedTs}:T>`, inline: true },
        )
        .setTimestamp();

      await interaction.user.send({ embeds: [dmEmbed] }).catch(() => null);
    }
  },
};
