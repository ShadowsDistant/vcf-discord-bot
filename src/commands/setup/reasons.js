'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

const TYPE_LABELS = { ban: '🔨  Ban', kick: '👢  Kick', warn: '⚠️  Warn' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reasons')
    .setDescription('Manage preset reasons for ban, kick, and warn actions.')
    // No blanket permission – checked per-subcommand so /reasons list is open to staff
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a preset reason. (Requires Manage Guild)')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Which action type this reason applies to.')
            .setRequired(true)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Warn', value: 'warn' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('reason')
            .setDescription('The preset reason text (max 200 characters).')
            .setRequired(true)
            .setMaxLength(200),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a preset reason by its ID. (Requires Manage Guild)')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('The action type.')
            .setRequired(true)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Warn', value: 'warn' },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName('id')
            .setDescription('The numeric ID shown in /reasons list.')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all preset reasons for an action type.')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Filter by action type (leave blank for all).')
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Warn', value: 'warn' },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;

    // add/remove require Manage Guild
    if (sub === 'add' || sub === 'remove') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [embeds.error('You need the **Manage Server** permission to manage preset reasons.', guild)],
          ephemeral: true,
        });
      }
    }

    if (sub === 'add') {
      const type = interaction.options.getString('type');
      const reason = interaction.options.getString('reason');
      const existing = db.getPresetReasons(guild.id, type);

      if (existing.length >= 25) {
        return interaction.reply({
          embeds: [embeds.error(`You can have at most 25 preset reasons per type. Remove some first.`, guild)],
          ephemeral: true,
        });
      }

      const entry = db.addPresetReason(guild.id, type, reason);
      return interaction.reply({
        embeds: [
          embeds
            .setup(
              `${TYPE_LABELS[type]}  Preset Reason Added`,
              `A new preset reason has been added for **${type}** actions.`,
              guild,
            )
            .addFields(
              { name: '🆔  ID', value: `\`${entry.id}\``, inline: true },
              { name: '📋  Reason', value: reason },
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'remove') {
      const type = interaction.options.getString('type');
      const id = interaction.options.getInteger('id');

      const removed = db.removePresetReason(guild.id, type, id);
      if (!removed) {
        return interaction.reply({
          embeds: [embeds.error(`No preset reason with ID \`${id}\` found for **${type}** actions.`, guild)],
          ephemeral: true,
        });
      }
      return interaction.reply({
        embeds: [embeds.success(`Preset reason \`${id}\` has been removed from **${type}** presets.`, guild)],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const filterType = interaction.options.getString('type');
      const types = filterType ? [filterType] : ['ban', 'kick', 'warn'];

      const embed = embeds
        .setup('📋  Preset Reasons', 'Configured preset reasons for moderation actions.', guild);

      let anyFound = false;
      for (const type of types) {
        const reasons = db.getPresetReasons(guild.id, type);
        if (reasons.length === 0) continue;
        anyFound = true;
        embed.addFields({
          name: `${TYPE_LABELS[type]} (${reasons.length})`,
          value: reasons
            .map((r) => `\`${r.id}\`  ${r.reason}`)
            .join('\n')
            .slice(0, 1024),
        });
      }

      if (!anyFound) {
        embed.setDescription(
          `No preset reasons configured${filterType ? ` for **${filterType}**` : ''} yet.\nUse \`/reasons add\` to create one.`,
        );
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
