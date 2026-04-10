'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { getCategoryIds, getCategoryLabel, isCategoryEnabledByDefault } = require('../../utils/automod');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

const PUNISHMENT_LABELS = {
  delete: 'Delete message only',
  delete_timeout: 'Delete message + timeout user',
  delete_kick: 'Delete message + kick user',
  timeout: 'Timeout user only',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure the preset automod system.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── Enable / Disable ─────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable the entire automod system.')
        .addBooleanOption((o) =>
          o
            .setName('enabled')
            .setDescription('true = on, false = off.')
            .setRequired(true),
        ),
    )

    // ── Category toggling ────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('category')
        .setDescription('Enable or disable a specific filter category.')
        .addStringOption((o) => {
          const opt = o
            .setName('category')
            .setDescription('The filter category to toggle.')
            .setRequired(true);
          for (const catId of getCategoryIds()) {
            opt.addChoices({ name: getCategoryLabel(catId), value: catId });
          }
          return opt;
        })
        .addBooleanOption((o) =>
          o
            .setName('enabled')
            .setDescription('true = on, false = off.')
            .setRequired(true),
        ),
    )

    // ── Punishment preset ────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('punishment')
        .setDescription('Set the punishment applied when automod triggers.')
        .addStringOption((o) =>
          o
            .setName('preset')
            .setDescription('Punishment preset.')
            .setRequired(true)
            .addChoices(
              { name: 'Delete message only', value: 'delete' },
              { name: 'Delete message + timeout', value: 'delete_timeout' },
              { name: 'Delete message + kick', value: 'delete_kick' },
              { name: 'Timeout only', value: 'timeout' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('timeout_duration')
            .setDescription(
              'Timeout duration when using a timeout preset (e.g. 5m, 1h). Defaults to 5m.',
            ),
        ),
    )

    // ── Log channel ──────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('logchannel')
        .setDescription('Set the channel where automod actions are logged.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('The text channel to log automod actions in.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )

    // ── Exempt role ──────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('exemptrole')
        .setDescription('Exempt a role from automod scanning.')
        .addRoleOption((o) =>
          o.setName('role').setDescription('The role to exempt.').setRequired(true),
        )
        .addBooleanOption((o) =>
          o
            .setName('add')
            .setDescription('true = add exemption, false = remove exemption.')
            .setRequired(true),
        ),
    )

    // ── Status view ──────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('View the current automod configuration.'),
    ),

  async execute(interaction) {
    // Senior moderation level check
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.seniorMod)) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'You need the **Senior Moderator** permission level (or higher) to configure automod.',
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const config = db.getAutomodConfig(guildId);

    // ── toggle ───────────────────────────────────────────────────────────────
    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      config.enabled = enabled;
      db.setAutomodConfig(guildId, config);
      return interaction.reply({
        embeds: [
          embeds.success(
            `AutoMod has been **${enabled ? 'enabled' : 'disabled'}** for this server.`,
            interaction.guild,
          ),
        ],
      });
    }

    // ── category ─────────────────────────────────────────────────────────────
    if (sub === 'category') {
      const catId = interaction.options.getString('category');
      const enabled = interaction.options.getBoolean('enabled');
      db.setAutomodCategory(guildId, catId, enabled);
      return interaction.reply({
        embeds: [
          embeds.success(
            `The **${getCategoryLabel(catId)}** filter has been **${enabled ? 'enabled' : 'disabled'}**.`,
            interaction.guild,
          ),
        ],
      });
    }

    // ── punishment ───────────────────────────────────────────────────────────
    if (sub === 'punishment') {
      const { parseDuration } = require('../../utils/helpers');
      const preset = interaction.options.getString('preset');
      const durationStr = interaction.options.getString('timeout_duration');

      config.punishment = preset;

      if (durationStr) {
        const ms = parseDuration(durationStr);
        if (!ms) {
          return interaction.reply({
            embeds: [
              embeds.error(
                'Invalid timeout duration. Use formats like `5m`, `1h`, `1d`.',
                interaction.guild,
              ),
            ],
            ephemeral: true,
          });
        }
        config.timeoutDuration = ms;
      }

      db.setAutomodConfig(guildId, config);

      const timeoutInfo =
        (preset === 'delete_timeout' || preset === 'timeout') && config.timeoutDuration
          ? ` Timeout duration: **${durationStr ?? '5m (default)'}**.`
          : '';

      return interaction.reply({
        embeds: [
          embeds.success(
            `AutoMod punishment set to: **${PUNISHMENT_LABELS[preset]}**.${timeoutInfo}`,
            interaction.guild,
          ),
        ],
      });
    }

    // ── logchannel ───────────────────────────────────────────────────────────
    if (sub === 'logchannel') {
      const channel = interaction.options.getChannel('channel');
      config.logChannelId = channel.id;
      db.setAutomodConfig(guildId, config);
      return interaction.reply({
        embeds: [
          embeds.success(
            `AutoMod actions will now be logged in ${channel}.`,
            interaction.guild,
          ),
        ],
      });
    }

    // ── exemptrole ───────────────────────────────────────────────────────────
    if (sub === 'exemptrole') {
      const role = interaction.options.getRole('role');
      const add = interaction.options.getBoolean('add');
      if (!config.exemptRoles) config.exemptRoles = [];

      if (add) {
        if (!config.exemptRoles.includes(role.id)) config.exemptRoles.push(role.id);
        db.setAutomodConfig(guildId, config);
        return interaction.reply({
          embeds: [
            embeds.success(`${role} is now **exempt** from automod scanning.`, interaction.guild),
          ],
        });
      } else {
        config.exemptRoles = config.exemptRoles.filter((id) => id !== role.id);
        db.setAutomodConfig(guildId, config);
        return interaction.reply({
          embeds: [
            embeds.success(
              `${role} is **no longer exempt** from automod scanning.`,
              interaction.guild,
            ),
          ],
        });
      }
    }

    // ── status ───────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const allCats = getCategoryIds();
      const catMap = config.categories ?? {};

      const catLines = allCats
        .map((c) => {
          const on = Object.prototype.hasOwnProperty.call(catMap, c)
            ? catMap[c] !== false
            : isCategoryEnabledByDefault(c);
          return `${on ? 'Enabled' : 'Disabled'}: **${getCategoryLabel(c)}** (\`${c}\`)`;
        })
        .join('\n');

      const exemptMentions =
        config.exemptRoles?.length
          ? config.exemptRoles.map((id) => `<@&${id}>`).join(', ')
          : 'None';

      const logMention = config.logChannelId ? `<#${config.logChannelId}>` : 'Not set';

      const statusEmbed = embeds
        .base(interaction.guild)
        .setColor(0x5865f2)
        .setTitle('AutoMod Configuration')
        .addFields(
          {
            name: 'System Status',
            value: config.enabled ? 'Enabled' : 'Disabled',
            inline: true,
          },
          {
            name: 'Punishment',
            value: PUNISHMENT_LABELS[config.punishment ?? 'delete'] ?? config.punishment,
            inline: true,
          },
          {
            name: 'Timeout Duration',
            value: config.timeoutDuration
              ? `${Math.round(config.timeoutDuration / 60000)} minute(s)`
              : '5 minutes (default)',
            inline: true,
          },
          { name: 'Filter Categories', value: catLines || 'None configured' },
          { name: 'Exempt Roles', value: exemptMentions, inline: true },
          { name: 'Log Channel', value: logMention, inline: true },
        );

      return interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    }
  },
};
