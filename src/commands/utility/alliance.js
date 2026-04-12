'use strict';

const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const alliances = require('../../utils/bakeAlliances');
const economy = require('../../utils/bakeEconomy');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alliance')
    .setDescription('Manage bakery alliances and co-op progress.')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a new alliance.')
        .addStringOption((o) => o.setName('name').setDescription('Alliance name').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('join')
        .setDescription('Join an alliance by ID or name.')
        .addStringOption((o) => o.setName('alliance').setDescription('Alliance ID or name').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('leave').setDescription('Leave your current alliance.'))
    .addSubcommand((s) => s.setName('info').setDescription('View your alliance details.'))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('View alliance CPS leaderboard.'))
    .addSubcommand((s) => s.setName('challenge').setDescription('View your alliance co-op challenge progress.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);
      const result = alliances.createAlliance(interaction.guild.id, interaction.user.id, name);
      if (!result.ok) {
        return interaction.reply({
          embeds: [embeds.error(result.reason, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [embeds.success(`Alliance created: **${result.alliance.name}** (ID: \`${result.alliance.id}\`)`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'join') {
      const value = interaction.options.getString('alliance', true);
      const result = alliances.joinAlliance(interaction.guild.id, interaction.user.id, value);
      if (!result.ok) {
        return interaction.reply({ embeds: [embeds.error(result.reason, interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        embeds: [embeds.success(`You joined **${result.alliance.name}**.`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'leave') {
      const result = alliances.leaveAlliance(interaction.guild.id, interaction.user.id);
      if (!result.ok) {
        return interaction.reply({ embeds: [embeds.error(result.reason, interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        embeds: [embeds.success('You left your alliance.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'leaderboard') {
      const ranking = alliances.getAllianceLeaderboard(interaction.guild.id);
      const lines = ranking.length
        ? ranking.slice(0, 10).map((entry, idx) => `${idx + 1}. **${entry.name}** — CPS **${economy.toCookieNumber(entry.cpsTotal)}** (${entry.memberCount} members)`).join('\n')
        : 'No alliances yet.';
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🤝 Alliance Leaderboard')
            .setDescription(lines)
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'challenge') {
      const data = alliances.getAllianceWithChallenge(interaction.guild.id, interaction.user.id);
      if (!data.alliance) {
        return interaction.reply({
          embeds: [embeds.warning('You are not currently in an alliance.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`🎯 Alliance Challenge — ${data.alliance.name}`)
            .setDescription(`Weekly co-op goal: **${economy.toCookieNumber(data.challenge.target)}** cookies baked`)
            .addFields({
              name: 'Progress',
              value: `**${economy.toCookieNumber(data.challenge.progress)} / ${economy.toCookieNumber(data.challenge.target)}**`,
            })
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const data = alliances.getMemberAlliance(interaction.guild.id, interaction.user.id);
    if (!data) {
      return interaction.reply({
        embeds: [embeds.info('Alliance', 'You are not currently in an alliance.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`Alliance: ${data.name}`)
          .setDescription(`ID: \`${data.id}\`\nOwner: <@${data.ownerId}>`)
          .addFields({
            name: `Members (${data.members.length}/${alliances.MAX_ALLIANCE_MEMBERS})`,
            value: data.members.map((memberId) => `• <@${memberId}>`).join('\n').slice(0, 1024),
          })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
