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
const { hasSidRole } = require('../../utils/permissions');
const { ALL_STAFF_ROLE_IDS } = require('../../utils/roles');
const { fetchLogChannel } = require('../../utils/logChannels');

const PANEL_CUSTOM_ID = 'staffinfraction_panel_action';
const MODAL_PREFIX = 'staffinfraction_modal:';

const ACTION_COLORS = {
  warn: 0xfee75c,
  suspended: 0xf57c00,
  terminate: 0xed4245,
  // legacy severity fallback
  minor: 0xfee75c,
  moderate: 0xf57c00,
  severe: 0xed4245,
};

const ACTION_LABELS = {
  warn: 'Warning',
  suspended: 'Suspension',
  terminate: 'Termination',
};
const ACTION_LABELS_BY_SEVERITY = {
  minor: ACTION_LABELS.warn,
  moderate: ACTION_LABELS.suspended,
  severe: ACTION_LABELS.terminate,
};

function parseMentionUserId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const mention = raw.match(/^<@!?(\d+)>$/);
  if (mention) return mention[1];
  const id = raw.match(/^(\d+)$/);
  if (id) return id[1];
  return null;
}

function isConfiguredStaffMember(member) {
  if (!ALL_STAFF_ROLE_IDS.size) return false;
  for (const roleId of ALL_STAFF_ROLE_IDS) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

function hasAccess(interaction) {
  return hasSidRole(interaction.member, interaction.guild.id);
}

function denyAccess(interaction) {
  return interaction.reply({
    embeds: [
      embeds.error(
        'You need the configured **SID** role to manage staff infractions.',
        interaction.guild,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function buildPanel() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(PANEL_CUSTOM_ID)
      .setPlaceholder('Select a staff infraction action')
      .addOptions([
        {
          label: 'Issue Warning',
          value: 'warn',
          description: 'Issue a formal written warning to a staff member.',
          emoji: '-',
        },
        {
          label: 'Issue Suspension',
          value: 'suspended',
          description: 'Issue a suspension to a staff member.',
          emoji: '🔴',
        },
        {
          label: 'Issue Termination',
          value: 'terminate',
          description: 'Issue a termination notice to a staff member.',
          emoji: '🔨',
        },
        {
          label: 'View Member Record',
          value: 'view',
          description: "View one staff member's infraction record.",
          emoji: '📄',
        },
        {
          label: 'Remove Infraction',
          value: 'remove',
          description: 'Remove one infraction by ID from a staff member.',
          emoji: '🧹',
        },
        {
          label: 'List All Infractions',
          value: 'list',
          description: 'List all staff with active infractions.',
          emoji: '📄',
        },
      ]),
  );
}

function buildIssueModal(actionType) {
  const titleByType = {
    warn: 'Issue Staff Warning',
    suspended: 'Issue Staff Suspension',
    terminate: 'Issue Staff Termination',
  };
  return new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}issue_${actionType}`)
    .setTitle(titleByType[actionType] ?? 'Issue Staff Infraction')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('staff')
          .setLabel('Staff member mention or ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('Additional details (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200),
      ),
    );
}

function buildModal(action) {
  if (action === 'warn' || action === 'suspended' || action === 'terminate') {
    return buildIssueModal(action);
  }

  if (action === 'view') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}view`)
      .setTitle('View Staff Infractions')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('staff')
            .setLabel('Staff member mention or ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
  }

  if (action === 'remove') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}remove`)
      .setTitle('Remove Staff Infraction')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('staff')
            .setLabel('Staff member mention or ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('id')
            .setLabel('Infraction ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
  }

  return null;
}

async function resolveStaffMember(interaction, input) {
  const userId = parseMentionUserId(input);
  if (!userId) return { error: 'Invalid user. Use a user mention or a user ID.' };

  const staffMember = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!staffMember) return { error: 'That user is not currently in this server.' };
  if (!isConfiguredStaffMember(staffMember)) {
    return { error: 'That user is not part of the staff team.' };
  }

  return { staffMember, staffUser: staffMember.user };
}

async function sendPunishmentLog(guild, embed) {
  const channel = await fetchLogChannel(guild, 'punishmentLog');
  if (channel) await channel.send({ embeds: [embed] }).catch(() => null);
}

async function handleIssue(interaction, actionType) {
  const resolved = await resolveStaffMember(interaction, interaction.fields.getTextInputValue('staff'));
  if (resolved.error) {
    return interaction.reply({
      embeds: [embeds.error(resolved.error, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const { staffUser } = resolved;
  if (staffUser.id === interaction.user.id) {
    return interaction.reply({
      embeds: [embeds.error('You cannot issue an infraction to yourself.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const details = interaction.fields.getTextInputValue('details').trim() || null;
  const actionLabel = ACTION_LABELS[actionType] ?? actionType;

  const record = db.addStaffInfraction(interaction.guild.id, staffUser.id, {
    issuedById: interaction.user.id,
    reason,
    severity: actionType === 'warn' ? 'minor' : actionType === 'suspended' ? 'moderate' : 'severe',
    action: details ? `${actionLabel} — ${details}` : actionLabel,
  });

  const color = ACTION_COLORS[actionType] ?? 0xfee75c;

  const infractionEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Staff ${actionLabel} Issued`)
    .setThumbnail(staffUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'Staff Member', value: `${staffUser} (\`${staffUser.tag}\`)`, inline: true },
      { name: 'Issued By', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      { name: 'Action Type', value: actionLabel, inline: true },
      { name: 'Reason', value: reason },
      ...(details ? [{ name: 'Additional Details', value: details }] : []),
      { name: 'Infraction ID', value: `\`${record.id}\``, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined });

  await interaction.reply({ embeds: [infractionEmbed], flags: MessageFlags.Ephemeral });

  // DM the staff member
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Staff ${actionLabel} — ${interaction.guild.name}`)
      .setDescription(`You have received a **${actionLabel}** in **${interaction.guild.name}**.`)
      .addFields(
        { name: 'Reason', value: reason },
        ...(details ? [{ name: 'Additional Details', value: details }] : []),
        { name: 'Infraction ID', value: `\`${record.id}\`` },
        { name: 'Issued By', value: interaction.user.tag },
      )
      .setTimestamp();
    await staffUser.send({ embeds: [dmEmbed] });
  } catch {
    // ignore DM failure
  }

  // Log to punishment channel
  await sendPunishmentLog(interaction.guild, infractionEmbed);
}

async function handleView(interaction) {
  const resolved = await resolveStaffMember(interaction, interaction.fields.getTextInputValue('staff'));
  if (resolved.error) {
    return interaction.reply({
      embeds: [embeds.error(resolved.error, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const { staffUser } = resolved;
  const infractions = db.getStaffInfractions(interaction.guild.id, staffUser.id);

  if (!infractions.length) {
    return interaction.reply({
      embeds: [
        embeds.info('No Infractions', `${staffUser} has no recorded staff infractions.`, interaction.guild),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const fieldLines = infractions.map((inf, idx) => {
    const ts = `<t:${Math.floor(new Date(inf.timestamp).getTime() / 1000)}:D>`;
    const expectedDefaultAction = ACTION_LABELS_BY_SEVERITY[inf.severity] ?? null;
    const actionLine = inf.action && inf.action !== expectedDefaultAction ? `\nAction: ${inf.action}` : '';
    return `**#${idx + 1}** — \`${inf.severity}\` — ID: \`${inf.id}\`\nReason: ${inf.reason}${actionLine}\nDate: ${ts} — Issued by <@${inf.issuedById}>`;
  });

  const chunks = [];
  for (let i = 0; i < fieldLines.length; i += 5) {
    chunks.push(fieldLines.slice(i, i + 5).join('\n\n'));
  }

  const countSummary = {
    minor: infractions.filter((i) => i.severity === 'minor').length,
    moderate: infractions.filter((i) => i.severity === 'moderate').length,
    severe: infractions.filter((i) => i.severity === 'severe').length,
  };

  const viewEmbed = embeds
    .base(interaction.guild)
    .setColor(0x5865f2)
    .setTitle(`Staff Infractions — ${staffUser.tag}`)
    .setThumbnail(staffUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: 'Summary',
        value: `Minor/Warn: **${countSummary.minor}** | Moderate/Suspend: **${countSummary.moderate}** | Severe/Terminate: **${countSummary.severe}**`,
      },
      ...chunks.map((chunk, i) => ({
        name: chunks.length > 1 ? `Infractions (${i + 1}/${chunks.length})` : 'Infractions',
        value: chunk,
      })),
    );

  return interaction.reply({ embeds: [viewEmbed], flags: MessageFlags.Ephemeral });
}

async function handleRemove(interaction) {
  const resolved = await resolveStaffMember(interaction, interaction.fields.getTextInputValue('staff'));
  if (resolved.error) {
    return interaction.reply({
      embeds: [embeds.error(resolved.error, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const id = parseInt(interaction.fields.getTextInputValue('id').trim(), 10);
  if (Number.isNaN(id)) {
    return interaction.reply({
      embeds: [embeds.error('Invalid infraction ID. Please provide a numeric ID.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = db.removeStaffInfraction(interaction.guild.id, resolved.staffUser.id, id);
  if (!removed) {
    return interaction.reply({
      embeds: [embeds.error(`No infraction with ID \`${id}\` found for ${resolved.staffUser}.`, interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    embeds: [embeds.success(`Infraction \`${id}\` has been removed from ${resolved.staffUser}'s record.`, interaction.guild)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleList(interaction) {
  const all = db.getAllStaffInfractions(interaction.guild.id);
  const withInfractions = all.filter((e) => e.infractions.length > 0);

  if (!withInfractions.length) {
    return interaction.reply({
      embeds: [
        embeds.info('Staff Infractions', 'No staff members have recorded infractions.', interaction.guild),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = withInfractions.map((e) => {
    const counts = {
      minor: e.infractions.filter((i) => i.severity === 'minor').length,
      moderate: e.infractions.filter((i) => i.severity === 'moderate').length,
      severe: e.infractions.filter((i) => i.severity === 'severe').length,
    };
    return `<@${e.staffUserId}> — Warn: ${counts.minor} / Suspend: ${counts.moderate} / Terminate: ${counts.severe}`;
  });

  const listEmbed = embeds
    .base(interaction.guild)
    .setColor(0x5865f2)
    .setTitle('All Staff Infractions')
    .setDescription(lines.join('\n'));

  return interaction.reply({ embeds: [listEmbed], flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffinfraction')
    .setDescription('Manage staff infractions using a compact action menu.')
    .setDMPermission(false),

  isStaffInfractionPanelSelect(customId) {
    return customId === PANEL_CUSTOM_ID;
  },

  isStaffInfractionPanelModal(customId) {
    return customId.startsWith(MODAL_PREFIX);
  },

  async handleStaffInfractionPanelSelect(interaction) {
    if (!hasAccess(interaction)) return denyAccess(interaction);

    const action = interaction.values?.[0];
    if (action === 'list') return handleList(interaction);

    const modal = buildModal(action);
    if (!modal) {
      return interaction.reply({
        embeds: [embeds.error('Unknown staff infraction action selected.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.showModal(modal);
  },

  async handleStaffInfractionPanelModal(interaction) {
    if (!hasAccess(interaction)) return denyAccess(interaction);

    const action = interaction.customId.slice(MODAL_PREFIX.length);
    if (action === 'issue_warn') return handleIssue(interaction, 'warn');
    if (action === 'issue_suspended') return handleIssue(interaction, 'suspended');
    if (action === 'issue_terminate') return handleIssue(interaction, 'terminate');
    if (action === 'view') return handleView(interaction);
    if (action === 'remove') return handleRemove(interaction);

    return interaction.reply({
      embeds: [embeds.error('Unknown staff infraction modal action.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async execute(interaction) {
    if (!hasAccess(interaction)) return denyAccess(interaction);

    return interaction.reply({
      embeds: [
        embeds
          .base(interaction.guild)
          .setColor(0x5865f2)
          .setTitle('Staff Infractions Panel')
          .setDescription(
            'Select an action below to manage staff infractions.\n\n'
            + '- **Warn** — Issue a written warning\n'
            + '🔴 **Suspended** — Issue a suspension\n'
            + '🔨 **Terminate** — Issue a termination\n'
            + '📄 **View** — View a member\'s record\n'
            + '🧹 **Remove** — Remove an infraction by ID\n'
            + '📄 **List** — List all staff with infractions',
          ),
      ],
      components: [buildPanel()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
