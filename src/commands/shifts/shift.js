'use strict';

const {
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration, makeProgressBar } = require('../../utils/helpers');
const { PALETTE } = require('../../utils/embeds');
const { fetchLogChannel } = require('../../utils/logChannels');
const {
  hasShiftAccessRole,
  ROLE_IDS,
  MODERATION_ROLE_IDS,
  memberHasAnyRole,
} = require('../../utils/roles');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

const PANEL_CUSTOM_ID = 'shift_panel_action';
const USER_SELECT_PREFIX = 'shift_user_select:';
const MODAL_PREFIX = 'shift_modal:';
const MODERATION_MONTHLY_QUOTA_MS = 4 * 60 * 60 * 1000;
const MEDALS = ['🥇', '🥈', '🥉'];

function parseMentionUserId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const mention = raw.match(/^<@!?(\d+)>$/);
  if (mention) return mention[1];
  const id = raw.match(/^(\d+)$/);
  if (id) return id[1];
  return null;
}

async function resolveOptionalTargetUser(interaction, rawInput, defaultUser) {
  const parsed = parseMentionUserId(rawInput);
  if (!parsed) return defaultUser;
  return interaction.client.users.fetch(parsed).catch(() => defaultUser);
}

async function ensureShiftAccess(interaction) {
  if (!hasShiftAccessRole(interaction.member)) {
    await interaction.reply({
      embeds: [
        embeds.error(
          'You do not have the required role access to use shift commands.',
          interaction.guild,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

async function ensureManagementAccess(interaction) {
  if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management)) {
    await interaction.reply({
      embeds: [embeds.error('You need management-level access for this shift action.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

async function getShiftEligibleMembers(guild) {
  await guild.members.fetch().catch(() => null);
  // Collection does not have .slice(), so convert to array first.
  return [...guild.members.cache
    .filter((member) => !member.user.bot && hasShiftAccessRole(member))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .values()]
    // Discord select menus support up to 25 options.
    .slice(0, 25);
}

async function promptShiftUserSelect(interaction, action) {
  const eligible = await getShiftEligibleMembers(interaction.guild);
  if (!eligible.length) {
    return interaction.reply({
      embeds: [embeds.warning('No eligible shift users found for selection.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const actionLabel = action === 'status'
    ? 'Shift Status'
    : (action === 'log_user' ? 'Shift Log' : 'Shift History');
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${USER_SELECT_PREFIX}${action}`)
    .setPlaceholder(`Select user for ${actionLabel}`)
    .addOptions(eligible.map((member) => ({
      label: member.displayName.slice(0, 100),
      value: member.id,
      description: `${member.user.tag} • Shift-enabled user`.slice(0, 100),
    })));

  return interaction.reply({
    embeds: [embeds.info(actionLabel, 'Choose a shift-enabled user below.', interaction.guild)],
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

function buildPanelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(PANEL_CUSTOM_ID)
      .setPlaceholder('Select a shift action')
      .addOptions([
        {
          label: 'Start Shift',
          value: 'start',
          description: 'Clock in and begin your shift.',
          emoji: '🟢',
        },
        {
          label: 'End Shift',
          value: 'end',
          description: 'Clock out and finish your current shift.',
          emoji: '🔴',
        },
        {
          label: 'Shift Status',
          value: 'status',
          description: 'View on/off-shift status for a user.',
          emoji: '📍',
        },
        {
          label: 'Shift Log (User)',
          value: 'log_user',
          description: 'View detailed shift log for a user.',
          emoji: '📒',
        },
        {
          label: 'Shift Log (Active)',
          value: 'log_active',
          description: 'See all currently active shifts.',
          emoji: '🧾',
        },
        {
          label: 'Shift History',
          value: 'history',
          description: 'View recent shift history for a user.',
          emoji: '📚',
        },
        {
          label: 'Leaderboard',
          value: 'leaderboard',
          description: 'View top staff by shift time.',
          emoji: '🏆',
        },
        {
          label: 'Shift Roles',
          value: 'roles',
          description: 'View roles allowed to use shift commands.',
          emoji: '👥',
        },
        {
          label: 'Manage: List Records',
          value: 'manage_list',
          description: 'Management: list recent shift record IDs.',
          emoji: '🛠️',
        },
        {
          label: 'Manage: Edit Record',
          value: 'manage_edit',
          description: 'Management: edit a shift record duration.',
          emoji: '✏️',
        },
        {
          label: 'Manage: Delete Record',
          value: 'manage_delete',
          description: 'Management: delete a shift record.',
          emoji: '🗑️',
        },
      ]),
  );
}

function buildModal(action) {
  if (action === 'manage_list') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}${action}`)
      .setTitle('Shift User Input')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user')
            .setLabel('User mention or ID (leave blank for yourself)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(30),
        ),
      );
  }

  if (action === 'manage_edit') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}manage_edit`)
      .setTitle('Edit Shift Record')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('id')
            .setLabel('Shift record ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('minutes')
            .setLabel('New duration in minutes (1-1440)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4),
        ),
      );
  }

  if (action === 'manage_delete') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}manage_delete`)
      .setTitle('Delete Shift Record')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('id')
            .setLabel('Shift record ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20),
        ),
      );
  }

  return null;
}

async function sendShiftActionLog(interaction, title, fields = []) {
  const channel = await fetchLogChannel(interaction.guild, 'shiftLog');
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(PALETTE.shift)
    .setTitle(title)
    .addFields(
      { name: 'Staff Member', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      ...fields,
    )
    .setTimestamp()
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    });
  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function runStart(interaction) {
  const config = db.getConfig(interaction.guild.id);
  const result = db.startShift(interaction.guild.id, interaction.user.id, interaction.user.tag);

  if (!result) {
    return interaction.reply({
      embeds: [embeds.warning("You're already on shift! End your current shift first.", interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const startedTs = Math.floor(new Date(result.startedAt).getTime() / 1000);
  const shiftEmbed = embeds
    .shift(
      '🟢 Shift Started',
      `Welcome back, ${interaction.user}! Your shift has begun.`,
      interaction.guild,
    )
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 Staff Member', value: `${interaction.user}`, inline: true },
      { name: '🕐 Started At', value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`, inline: true },
    );

  await interaction.reply({ embeds: [shiftEmbed], flags: MessageFlags.Ephemeral });

  await sendShiftActionLog(interaction, '🟢 Shift Started', [
    { name: 'Started At', value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`, inline: true },
  ]);

  if (config.shiftDmsEnabled !== false) {
    const dmEmbed = new EmbedBuilder()
      .setColor(PALETTE.shift)
      .setTitle('🟢 You Are Now On Shift')
      .setDescription(`You clocked in at **${interaction.guild.name}**.`)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }) ?? null)
      .addFields(
        { name: '🏛️ Server', value: interaction.guild.name, inline: true },
        { name: '🕐 Started At', value: `<t:${startedTs}:T>`, inline: true },
      );

    await interaction.user.send({ embeds: [dmEmbed] }).catch(() => null);
  }
}

async function runEnd(interaction) {
  const record = db.endShift(interaction.guild.id, interaction.user.id);
  if (!record) {
    return interaction.reply({
      embeds: [embeds.warning("You're not currently on shift! Start a shift first.", interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const startedTs = Math.floor(new Date(record.startedAt).getTime() / 1000);
  const endedTs = Math.floor(new Date(record.endedAt).getTime() / 1000);
  const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
  const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);
  const waveTimeMs = db.getUserShiftTimeInWave(interaction.guild.id, interaction.user.id);
  const wave = db.getCurrentWave(interaction.guild.id);

  const shiftEmbed = embeds
    .shift('🔴 Shift Ended', `Thanks for your work, ${interaction.user}! Great job today.`, interaction.guild)
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 Staff Member', value: `${interaction.user}`, inline: true },
      { name: '⏱️ Duration', value: formatDuration(record.durationMs), inline: true },
      { name: '🕐 Started', value: `<t:${startedTs}:T>`, inline: true },
      { name: '🕐 Ended', value: `<t:${endedTs}:T>`, inline: true },
      { name: '📊 Total Time', value: formatDuration(totalMs), inline: true },
      { name: '📋 Total Shifts', value: `${history.length}`, inline: true },
    );

  if (wave) {
    shiftEmbed.addFields({
      name: `🌊 Wave #${wave.waveNumber} Time`,
      value: formatDuration(waveTimeMs),
      inline: true,
    });
  }

  await interaction.reply({ embeds: [shiftEmbed], flags: MessageFlags.Ephemeral });
  await sendShiftActionLog(interaction, '🔴 Shift Ended', [
    { name: 'Duration', value: formatDuration(record.durationMs), inline: true },
    { name: 'Started', value: `<t:${startedTs}:T>`, inline: true },
    { name: 'Ended', value: `<t:${endedTs}:T>`, inline: true },
  ]);
}

async function runStatus(interaction, target) {
  const active = db.getActiveShift(interaction.guild.id, target.id);

  if (!active) {
    return interaction.reply({
      embeds: [embeds.info('📍 Shift Status', `${target} is currently **off shift**.`, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const startedTs = Math.floor(new Date(active.startedAt).getTime() / 1000);
  const elapsedMs = Date.now() - new Date(active.startedAt).getTime();

  return interaction.reply({
    embeds: [
      embeds
        .shift('📍 Shift Status', `${target} is currently **🟢 on shift**.`, interaction.guild)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🕐 Started', value: `<t:${startedTs}:F>`, inline: true },
          { name: '⏱️ Elapsed', value: formatDuration(elapsedMs), inline: true },
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function runLogActive(interaction) {
  const active = db.getAllActiveShifts(interaction.guild.id);
  if (active.length === 0) {
    return interaction.reply({
      embeds: [embeds.info('🧾 Active Shifts', 'There are no active shifts right now.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(PALETTE.shift)
    .setTitle(`🧾 Active Shifts (${active.length})`)
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTimestamp();

  for (const s of active) {
    const startedTs = Math.floor(new Date(s.startedAt).getTime() / 1000);
    const elapsedMs = Date.now() - new Date(s.startedAt).getTime();
    embed.addFields({
      name: `🟢 ${s.username}`,
      value: `Started <t:${startedTs}:R> · ⏱️ **${formatDuration(elapsedMs)}**`,
    });
  }

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function runLogUser(interaction, target) {
  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  const isModerationMember = targetMember ? memberHasAnyRole(targetMember, MODERATION_ROLE_IDS) : false;
  const activeShift = db.getActiveShift(interaction.guild.id, target.id);
  const history = db.getUserShiftHistory(interaction.guild.id, target.id);
  const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const monthTimeMs = history
    .filter((s) => {
      const started = new Date(s.startedAt);
      return started.getUTCFullYear() === currentYear && started.getUTCMonth() === currentMonth;
    })
    .reduce((sum, s) => sum + s.durationMs, 0);
  const config = db.getConfig(interaction.guild.id);
  const monthlyQuotaMs = Number.isFinite(config.quotaMs) && config.quotaMs > 0
    ? config.quotaMs
    : MODERATION_MONTHLY_QUOTA_MS;
  const progressPct = Math.min(100, (monthTimeMs / monthlyQuotaMs) * 100);

  const embed = new EmbedBuilder()
    .setColor(PALETTE.shift)
    .setTitle(`📒 Shift Log — ${target.tag}`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .addFields({
      name: '📊 Statistics',
      value: [
        `Completed Shifts: **${history.length}**`,
        `Total Time: **${formatDuration(totalMs)}**`,
        `Status: ${activeShift ? '🟢 **On Shift**' : '🔴 **Off Shift**'}`,
      ].join('\n'),
    })
    .setTimestamp()
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    });

  if (activeShift) {
    const startedTs = Math.floor(new Date(activeShift.startedAt).getTime() / 1000);
    embed.addFields({ name: '🟢 Current Shift', value: `Started <t:${startedTs}:R> (<t:${startedTs}:T>)` });
  }

  if (isModerationMember) {
    embed.addFields({
      name: '📋 Monthly Quota Progress',
      value: [
        `Completed: **${formatDuration(monthTimeMs)}** / Required: **${formatDuration(monthlyQuotaMs)}**`,
        makeProgressBar(progressPct, 12),
      ].join('\n'),
    });
  }

  if (history.length > 0) {
    const recent = history.slice(-5).reverse();
    const historyLines = recent.map((s) => {
      const ts = Math.floor(new Date(s.startedAt).getTime() / 1000);
      return `<t:${ts}:D> — **${formatDuration(s.durationMs)}**`;
    });
    embed.addFields({ name: '📚 Recent Shifts (last 5)', value: historyLines.join('\n') });
  }

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function runHistory(interaction, target) {
  const history = db.getUserShiftHistory(interaction.guild.id, target.id);
  const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);
  const config = db.getConfig(interaction.guild.id);
  const wave = db.getCurrentWave(interaction.guild.id);
  const quotaMs = config.quotaMs ?? 0;
  const waveTimeMs = wave ? db.getUserShiftTimeInWave(interaction.guild.id, target.id) : 0;
  const progressPct = quotaMs > 0 ? Math.min(100, (waveTimeMs / quotaMs) * 100) : null;

  const embed = embeds
    .shift(`📚 Shift History — ${target.tag}`, 'Shift history overview.', interaction.guild)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '📋 Completed Shifts', value: `${history.length}`, inline: true },
      { name: '⏱️ Total Time', value: formatDuration(totalMs), inline: true },
    );

  if (wave && quotaMs > 0) {
    embed.addFields({
      name: `🌊 Quota Progress (Wave #${wave.waveNumber})`,
      value: [
        `Completed: **${formatDuration(waveTimeMs)}** / Required: **${formatDuration(quotaMs)}**`,
        makeProgressBar(progressPct, 12),
      ].join('\n'),
    });
  }

  if (history.length > 0) {
    const lines = history
      .slice(-10)
      .reverse()
      .map((s) => {
        const ts = Math.floor(new Date(s.startedAt).getTime() / 1000);
        return `ID \`${s.id}\` · <t:${ts}:D> — **${formatDuration(s.durationMs)}**`;
      });
    embed.addFields({ name: '📚 Recent Shifts (last 10)', value: lines.join('\n') });
  }

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function runLeaderboard(interaction) {
  const leaderboard = db.getShiftLeaderboard(interaction.guild.id);
  if (leaderboard.length === 0) {
    return interaction.reply({
      embeds: [embeds.info('🏆 Shift Leaderboard', 'No completed shifts yet. Start a shift to begin!', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const top = leaderboard.slice(0, 10);
  const rows = top.map((entry, i) => {
    const rankDisplay = MEDALS[i] ?? `**${i + 1}.**`;
    return `${rankDisplay} <@${entry.userId}> — **${formatDuration(entry.totalMs)}** (${entry.shiftCount} shift${entry.shiftCount !== 1 ? 's' : ''})`;
  });

  const embed = new EmbedBuilder()
    .setColor(PALETTE.shift)
    .setTitle('🏆 Shift Leaderboard')
    .setDescription(rows.join('\n'))
    .setTimestamp()
    .setFooter({
      text: `${leaderboard.length} staff member${leaderboard.length !== 1 ? 's' : ''} on record · ${interaction.guild.name}`,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    });

  const callerRank = leaderboard.findIndex((e) => e.userId === interaction.user.id);
  if (callerRank >= 10) {
    const callerEntry = leaderboard[callerRank];
    embed.addFields({
      name: '📍 Your Rank',
      value: `#${callerRank + 1} — **${formatDuration(callerEntry.totalMs)}** (${callerEntry.shiftCount} shift${callerEntry.shiftCount !== 1 ? 's' : ''})`,
    });
  }

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function runRoles(interaction) {
  const managementRoleIds = [...ROLE_IDS.helpManagementAccess].filter((id) => id !== ROLE_IDS.leadOverseer);
  const accessRoleLines = [
    `<@&${ROLE_IDS.moderationAccess}> (\`${ROLE_IDS.moderationAccess}\`)`,
    ...managementRoleIds.map((id) => `<@&${id}> (\`${id}\`)`),
    `<@&${ROLE_IDS.leadOverseer}> (\`${ROLE_IDS.leadOverseer}\`)`,
  ];

  return interaction.reply({
    embeds: [
      embeds
        .shift('👥 Shift Roles', 'These roles are currently allowed to use shift commands:', interaction.guild)
        .addFields({
          name: 'Shift Access',
          value: accessRoleLines.join('\n'),
          inline: true,
        }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function runManageList(interaction, targetUser) {
  if (!(await ensureManagementAccess(interaction))) return;

  const rows = (targetUser
    ? db.getUserShiftHistory(interaction.guild.id, targetUser.id)
    : db.getGuildShiftHistory(interaction.guild.id))
    .slice(-15)
    .reverse();

  if (!rows.length) {
    return interaction.reply({
      embeds: [embeds.info('🛠️ Shift Records', 'No completed shift records found.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    embeds: [
      embeds
        .shift('🛠️ Shift Records', 'Recent shift records. Use IDs with manage edit/delete actions.', interaction.guild)
        .addFields({
          name: '📋 Records',
          value: rows
            .map((s) => `\`${s.id}\` · <@${s.userId}> · ${formatDuration(s.durationMs)} · <t:${Math.floor(new Date(s.startedAt).getTime() / 1000)}:D>`)
            .join('\n'),
        }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function runManageEdit(interaction) {
  if (!(await ensureManagementAccess(interaction))) return;

  const id = parseInt(interaction.fields.getTextInputValue('id').trim(), 10);
  const minutes = parseInt(interaction.fields.getTextInputValue('minutes').trim(), 10);
  if (Number.isNaN(id)) {
    return interaction.reply({
      embeds: [embeds.error('Invalid shift record ID.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (Number.isNaN(minutes) || minutes < 1 || minutes > 1440) {
    return interaction.reply({
      embeds: [embeds.error('Minutes must be a number between 1 and 1440.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const updated = db.updateShiftRecord(interaction.guild.id, id, { durationMs: minutes * 60_000 });
  if (!updated) {
    return interaction.reply({
      embeds: [embeds.error(`No shift record found with ID \`${id}\`.`, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds: [embeds.success(`Shift record \`${id}\` updated to **${minutes} minutes**.`, interaction.guild)],
    flags: MessageFlags.Ephemeral,
  });

  await sendShiftActionLog(interaction, '✏️ Shift Record Updated', [
    { name: 'Record ID', value: `\`${id}\``, inline: true },
    { name: 'Target', value: `<@${updated.userId}>`, inline: true },
    { name: 'New Duration', value: formatDuration(minutes * 60_000), inline: true },
  ]);
}

async function runManageDelete(interaction) {
  if (!(await ensureManagementAccess(interaction))) return;

  const id = parseInt(interaction.fields.getTextInputValue('id').trim(), 10);
  if (Number.isNaN(id)) {
    return interaction.reply({
      embeds: [embeds.error('Invalid shift record ID.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = db.deleteShiftRecord(interaction.guild.id, id);
  if (!removed) {
    return interaction.reply({
      embeds: [embeds.error(`No shift record found with ID \`${id}\`.`, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds: [embeds.success(`Shift record \`${id}\` has been deleted.`, interaction.guild)],
    flags: MessageFlags.Ephemeral,
  });
  await sendShiftActionLog(interaction, '🗑️ Shift Record Deleted', [
    { name: 'Record ID', value: `\`${id}\``, inline: true },
    { name: 'Target', value: `<@${removed.userId}>`, inline: true },
    { name: 'Duration', value: formatDuration(removed.durationMs), inline: true },
  ]);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Manage all shift actions from one compact menu.')
    .setDMPermission(false),

  isShiftPanelSelect(customId) {
    return customId === PANEL_CUSTOM_ID || customId.startsWith(USER_SELECT_PREFIX);
  },

  isShiftPanelModal(customId) {
    return customId.startsWith(MODAL_PREFIX);
  },

  async handleShiftPanelSelect(interaction) {
    if (!(await ensureShiftAccess(interaction))) return;

    if (interaction.customId.startsWith(USER_SELECT_PREFIX)) {
      const action = interaction.customId.slice(USER_SELECT_PREFIX.length);
      const targetId = interaction.values?.[0];
      if (!targetId) {
        return interaction.reply({
          embeds: [embeds.error('No user was selected.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!targetMember || !hasShiftAccessRole(targetMember)) {
        return interaction.reply({
          embeds: [embeds.error('Selected user is not eligible for shifts.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (action === 'status') return runStatus(interaction, targetMember.user);
      if (action === 'log_user') return runLogUser(interaction, targetMember.user);
      if (action === 'history') return runHistory(interaction, targetMember.user);
      return interaction.reply({
        embeds: [embeds.error('Unknown shift user selection action.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const action = interaction.values?.[0];
    if (action === 'start') return runStart(interaction);
    if (action === 'end') return runEnd(interaction);
    if (action === 'log_active') return runLogActive(interaction);
    if (action === 'leaderboard') return runLeaderboard(interaction);
    if (action === 'roles') return runRoles(interaction);
    if (action === 'status' || action === 'log_user' || action === 'history') {
      return promptShiftUserSelect(interaction, action);
    }

    const modal = buildModal(action);
    if (!modal) {
      return interaction.reply({
        embeds: [embeds.error('Unknown shift panel action selected.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.showModal(modal);
  },

  async handleShiftPanelModal(interaction) {
    if (!(await ensureShiftAccess(interaction))) return;

    const action = interaction.customId.slice(MODAL_PREFIX.length);

    if (action === 'status') {
      const target = await resolveOptionalTargetUser(interaction, interaction.fields.getTextInputValue('user'), interaction.user);
      return runStatus(interaction, target);
    }

    if (action === 'log_user') {
      const target = await resolveOptionalTargetUser(interaction, interaction.fields.getTextInputValue('user'), interaction.user);
      return runLogUser(interaction, target);
    }

    if (action === 'history') {
      const target = await resolveOptionalTargetUser(interaction, interaction.fields.getTextInputValue('user'), interaction.user);
      return runHistory(interaction, target);
    }

    if (action === 'manage_list') {
      const targetInput = interaction.fields.getTextInputValue('user');
      const target = targetInput
        ? await resolveOptionalTargetUser(interaction, targetInput, null)
        : null;
      return runManageList(interaction, target);
    }

    if (action === 'manage_edit') return runManageEdit(interaction);
    if (action === 'manage_delete') return runManageDelete(interaction);

    return interaction.reply({
      embeds: [embeds.error('Unknown shift panel modal action.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async execute(interaction) {
    if (!(await ensureShiftAccess(interaction))) return;

    return interaction.reply({
      embeds: [
        embeds
          .shift('🕐 Shift Control Panel', 'Select an action below to manage shifts.', interaction.guild),
      ],
      components: [buildPanelMenu()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
