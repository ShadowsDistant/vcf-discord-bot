'use strict';

const {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { getCategoryIds, getCategoryLabel, isCategoryEnabledByDefault } = require('../../utils/automod');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const { parseDuration } = require('../../utils/helpers');

const PANEL_CUSTOM_ID = 'automod_panel_action';
const MODAL_PREFIX = 'automod_modal:';

const PUNISHMENT_LABELS = {
  delete: 'Delete message only',
  delete_timeout: 'Delete message + timeout user',
  delete_kick: 'Delete message + kick user',
  timeout: 'Timeout user only',
};

function parseMentionOrId(input, type) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const mentionPattern = type === 'channel' ? /^<#(\d+)>$/ : /^<@&(\d+)>$/;
  const mentionMatch = raw.match(mentionPattern);
  if (mentionMatch) return mentionMatch[1];
  const idMatch = raw.match(/^(\d+)$/);
  if (idMatch) return idMatch[1];
  return null;
}

function buildStatusEmbed(interaction, config) {
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

  return embeds
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
}

async function ensureAccess(interaction) {
  if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.seniorMod)) {
    await interaction.reply({
      embeds: [
        embeds.error(
          'You need the **Senior Moderator** permission level (or higher) to configure automod.',
          interaction.guild,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

function buildActionMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(PANEL_CUSTOM_ID)
      .setPlaceholder('Select an automod action')
      .addOptions([
        {
          label: 'Toggle System',
          value: 'toggle',
          description: 'Enable or disable all automod scanning.',
          emoji: '⚙️',
        },
        {
          label: 'Set Category',
          value: 'category',
          description: 'Enable or disable one automod category.',
          emoji: '🧩',
        },
        {
          label: 'Set Punishment',
          value: 'punishment',
          description: 'Set punishment preset and timeout duration.',
          emoji: '🛡️',
        },
        {
          label: 'Set Log Channel',
          value: 'logchannel',
          description: 'Set where automod actions are logged.',
          emoji: '📝',
        },
        {
          label: 'Manage Exempt Role',
          value: 'exemptrole',
          description: 'Add or remove an exempt role.',
          emoji: '👥',
        },
        {
          label: 'View Status',
          value: 'status',
          description: 'Show the full current automod configuration.',
          emoji: '📊',
        },
      ]),
  );
}

function buildActionModal(action) {
  if (action === 'toggle') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}toggle`)
      .setTitle('AutoMod: Toggle System')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('enabled')
            .setLabel('Enabled? (true/false/on/off)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10),
        ),
      );
  }

  if (action === 'category') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}category`)
      .setTitle('AutoMod: Set Category')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Category ID (e.g. profanity)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('enabled')
            .setLabel('Enabled? (true/false/on/off)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10),
        ),
      );
  }

  if (action === 'punishment') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}punishment`)
      .setTitle('AutoMod: Set Punishment')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('preset')
            .setLabel('Preset: delete/delete_timeout/delete_kick/timeout')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(40),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('timeout_duration')
            .setLabel('Timeout duration (optional, e.g. 5m/1h/1d)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20),
        ),
      );
  }

  if (action === 'logchannel') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}logchannel`)
      .setTitle('AutoMod: Set Log Channel')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel')
            .setLabel('Channel mention or ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30),
        ),
      );
  }

  if (action === 'exemptrole') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}exemptrole`)
      .setTitle('AutoMod: Manage Exempt Role')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role')
            .setLabel('Role mention or ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('add')
            .setLabel('Action: add/remove')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10),
        ),
      );
  }

  return null;
}

function parseBooleanInput(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['true', 'on', 'enable', 'enabled', 'yes', 'y', '1'].includes(value)) return true;
  if (['false', 'off', 'disable', 'disabled', 'no', 'n', '0'].includes(value)) return false;
  return null;
}

async function handleToggleModal(interaction, config) {
  const enabled = parseBooleanInput(interaction.fields.getTextInputValue('enabled'));
  if (enabled === null) {
    return interaction.reply({
      embeds: [embeds.error('Invalid value for `enabled`. Use true/false or on/off.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  config.enabled = enabled;
  db.setAutomodConfig(interaction.guild.id, config);
  return interaction.reply({
    embeds: [
      embeds.success(`AutoMod has been **${enabled ? 'enabled' : 'disabled'}** for this server.`, interaction.guild),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCategoryModal(interaction) {
  const catId = interaction.fields.getTextInputValue('category').trim();
  const enabled = parseBooleanInput(interaction.fields.getTextInputValue('enabled'));

  if (!getCategoryIds().includes(catId)) {
    return interaction.reply({
      embeds: [
        embeds.error(
          `Unknown category \`${catId}\`. Valid categories: ${getCategoryIds().join(', ')}`,
          interaction.guild,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (enabled === null) {
    return interaction.reply({
      embeds: [embeds.error('Invalid value for `enabled`. Use true/false or on/off.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  db.setAutomodCategory(interaction.guild.id, catId, enabled);
  return interaction.reply({
    embeds: [
      embeds.success(
        `The **${getCategoryLabel(catId)}** filter has been **${enabled ? 'enabled' : 'disabled'}**.`,
        interaction.guild,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePunishmentModal(interaction, config) {
  const preset = interaction.fields.getTextInputValue('preset').trim();
  const timeoutDurationRaw = interaction.fields.getTextInputValue('timeout_duration').trim();
  if (!Object.prototype.hasOwnProperty.call(PUNISHMENT_LABELS, preset)) {
    return interaction.reply({
      embeds: [
        embeds.error(
          'Invalid punishment preset. Use: `delete`, `delete_timeout`, `delete_kick`, or `timeout`.',
          interaction.guild,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  config.punishment = preset;
  if (timeoutDurationRaw) {
    const ms = parseDuration(timeoutDurationRaw);
    if (!ms) {
      return interaction.reply({
        embeds: [embeds.error('Invalid timeout duration. Use formats like `5m`, `1h`, `1d`.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    config.timeoutDuration = ms;
  }

  db.setAutomodConfig(interaction.guild.id, config);

  const timeoutInfo =
    (preset === 'delete_timeout' || preset === 'timeout') && config.timeoutDuration
      ? ` Timeout duration: **${timeoutDurationRaw || `${Math.round(config.timeoutDuration / 60000)}m`}**.`
      : '';

  return interaction.reply({
    embeds: [
      embeds.success(`AutoMod punishment set to: **${PUNISHMENT_LABELS[preset]}**.${timeoutInfo}`, interaction.guild),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleLogChannelModal(interaction, config) {
  const channelRaw = interaction.fields.getTextInputValue('channel');
  const channelId = parseMentionOrId(channelRaw, 'channel');
  if (!channelId) {
    return interaction.reply({
      embeds: [embeds.error('Invalid channel. Use a channel mention like `#logs` or a channel ID.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
    return interaction.reply({
      embeds: [embeds.error('That channel must be a valid server text channel.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  config.logChannelId = channel.id;
  db.setAutomodConfig(interaction.guild.id, config);
  return interaction.reply({
    embeds: [embeds.success(`AutoMod actions will now be logged in ${channel}.`, interaction.guild)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleExemptRoleModal(interaction, config) {
  const roleRaw = interaction.fields.getTextInputValue('role');
  const addRaw = interaction.fields.getTextInputValue('add');
  const roleId = parseMentionOrId(roleRaw, 'role');
  if (!roleId) {
    return interaction.reply({
      embeds: [embeds.error('Invalid role. Use a role mention like `@Role` or a role ID.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const role = interaction.guild.roles.cache.get(roleId) ?? await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    return interaction.reply({
      embeds: [embeds.error('That role was not found in this server.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const addValue = String(addRaw).trim().toLowerCase();
  const add = ['add', 'true', 'on', 'enable', 'enabled', 'yes', 'y', '1'].includes(addValue);
  const remove = ['remove', 'false', 'off', 'disable', 'disabled', 'no', 'n', '0'].includes(addValue);
  if (!add && !remove) {
    return interaction.reply({
      embeds: [embeds.error('Invalid action. Use `add` or `remove`.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!config.exemptRoles) config.exemptRoles = [];

  if (add) {
    if (!config.exemptRoles.includes(role.id)) config.exemptRoles.push(role.id);
    db.setAutomodConfig(interaction.guild.id, config);
    return interaction.reply({
      embeds: [embeds.success(`${role} is now **exempt** from automod scanning.`, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  config.exemptRoles = config.exemptRoles.filter((id) => id !== role.id);
  db.setAutomodConfig(interaction.guild.id, config);
  return interaction.reply({
    embeds: [embeds.success(`${role} is **no longer exempt** from automod scanning.`, interaction.guild)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure AutoMod using a compact action menu.')
    .setDMPermission(false),

  isAutomodPanelSelect(customId) {
    return customId === PANEL_CUSTOM_ID;
  },

  isAutomodPanelModal(customId) {
    return customId.startsWith(MODAL_PREFIX);
  },

  async handleAutomodPanelSelect(interaction) {
    if (!(await ensureAccess(interaction))) return;

    const action = interaction.values?.[0];
    if (action === 'status') {
      const config = db.getAutomodConfig(interaction.guild.id);
      return interaction.reply({
        embeds: [buildStatusEmbed(interaction, config)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = buildActionModal(action);
    if (!modal) {
      return interaction.reply({
        embeds: [embeds.error('Unknown automod action selected.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.showModal(modal);
  },

  async handleAutomodPanelModal(interaction) {
    if (!(await ensureAccess(interaction))) return;

    const action = interaction.customId.slice(MODAL_PREFIX.length);
    const config = db.getAutomodConfig(interaction.guild.id);

    if (action === 'toggle') return handleToggleModal(interaction, config);
    if (action === 'category') return handleCategoryModal(interaction, config);
    if (action === 'punishment') return handlePunishmentModal(interaction, config);
    if (action === 'logchannel') return handleLogChannelModal(interaction, config);
    if (action === 'exemptrole') return handleExemptRoleModal(interaction, config);

    return interaction.reply({
      embeds: [embeds.error('Unknown automod modal action.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async execute(interaction) {
    if (!(await ensureAccess(interaction))) return;

    return interaction.reply({
      embeds: [
        embeds
          .base(interaction.guild)
          .setColor(0x5865f2)
          .setTitle('AutoMod Control Panel')
          .setDescription('Select an action from the menu below to configure AutoMod.'),
      ],
      components: [buildActionMenu()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
