'use strict';

const {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { hasModLevel, hasSidRole, MOD_LEVEL } = require('../../utils/permissions');
const { ALL_STAFF_ROLE_IDS } = require('../../utils/roles');

const PANEL_CUSTOM_ID = 'staffinfraction_panel_action';
const MODAL_PREFIX = 'staffinfraction_modal:';

const SEVERITY_COLORS = {
  minor: 0xfee75c,
  moderate: 0xf57c00,
  severe: 0xed4245,
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

function getStaffRoleIds() {
  return [...ALL_STAFF_ROLE_IDS];
}

function isConfiguredStaffMember(member) {
  const roleIds = getStaffRoleIds();
  if (!roleIds.length) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasAccess(interaction) {
  return (
    hasSidRole(interaction.member, interaction.guild.id)
    || hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management)
  );
}

function denyAccess(interaction) {
  return interaction.reply({
    embeds: [
      embeds.error(
        'You need the configured **SID** role or moderation leadership access to manage staff infractions.',
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
          label: 'Issue Infraction',
          value: 'issue',
          description: 'Issue a formal infraction to a staff member.',
          emoji: '⚠️',
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
          emoji: '📋',
        },
      ]),
  );
}

function buildModal(action) {
  if (action === 'issue') {
    return new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}issue`)
      .setTitle('Issue Staff Infraction')
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
            .setCustomId('severity')
            .setLabel('Severity (minor/moderate/severe)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(12),
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
            .setCustomId('action')
            .setLabel('Additional action (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200),
        ),
      );
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

async function handleIssue(interaction) {
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

  const severityRaw = interaction.fields.getTextInputValue('severity').trim().toLowerCase();
  if (!['minor', 'moderate', 'severe'].includes(severityRaw)) {
    return interaction.reply({
      embeds: [embeds.error('Invalid severity. Use `minor`, `moderate`, or `severe`.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const action = interaction.fields.getTextInputValue('action').trim() || null;

  const record = db.addStaffInfraction(interaction.guild.id, staffUser.id, {
    issuedById: interaction.user.id,
    reason,
    severity: severityRaw,
    action,
  });

  const infractionEmbed = embeds
    .base(interaction.guild)
    .setColor(SEVERITY_COLORS[severityRaw] ?? 0xfee75c)
    .setTitle('Staff Infraction Issued')
    .setThumbnail(staffUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: 'Staff Member',
        value: `${staffUser} (\`${staffUser.tag}\`)`,
        inline: true,
      },
      {
        name: 'Issued By',
        value: `${interaction.user} (\`${interaction.user.tag}\`)`,
        inline: true,
      },
      { name: 'Severity', value: severityRaw.charAt(0).toUpperCase() + severityRaw.slice(1), inline: true },
      { name: 'Reason', value: reason },
      ...(action ? [{ name: 'Additional Action', value: action }] : []),
      { name: 'Infraction ID', value: `\`${record.id}\``, inline: true },
    );

  await interaction.reply({ embeds: [infractionEmbed], flags: MessageFlags.Ephemeral });

  try {
    const dmEmbed = embeds
      .base(null)
      .setColor(SEVERITY_COLORS[severityRaw] ?? 0xfee75c)
      .setTitle(`Staff Infraction — ${interaction.guild.name}`)
      .setDescription(
        `You have received a **${severityRaw}** staff infraction in **${interaction.guild.name}**.`,
      )
      .addFields(
        { name: 'Reason', value: reason },
        ...(action ? [{ name: 'Additional Action', value: action }] : []),
        { name: 'Infraction ID', value: `\`${record.id}\`` },
      );
    await staffUser.send({ embeds: [dmEmbed] });
  } catch {
    // ignore DM failure
  }

  const logChannelId = db.getConfig(interaction.guild.id).logChannelId;
  if (logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(logChannelId);
    if (logChannel?.isTextBased()) {
      await logChannel.send({ embeds: [infractionEmbed] }).catch(() => null);
    }
  }
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
    const actionLine = inf.action ? `\nAction: ${inf.action}` : '';
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
        value: `Minor: **${countSummary.minor}** | Moderate: **${countSummary.moderate}** | Severe: **${countSummary.severe}**`,
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
    return `<@${e.staffUserId}> — Minor: ${counts.minor} / Moderate: ${counts.moderate} / Severe: ${counts.severe}`;
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
    if (action === 'issue') return handleIssue(interaction);
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
          .setDescription('Select an action below to manage staff infractions.'),
      ],
      components: [buildPanel()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
