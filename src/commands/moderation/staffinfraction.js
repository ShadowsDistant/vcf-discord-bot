'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { hasModLevel, hasSidRole, MOD_LEVEL } = require('../../utils/permissions');
const { ALL_STAFF_ROLE_IDS } = require('../../utils/roles');

const SEVERITY_COLORS = {
  minor: 0xfee75c,
  moderate: 0xf57c00,
  severe: 0xed4245,
};

function getStaffRoleIds(guildId) {
  return [...ALL_STAFF_ROLE_IDS];
}

function isConfiguredStaffMember(member, guildId) {
  const roleIds = getStaffRoleIds(guildId);
  if (!roleIds.length) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffinfraction')
    .setDescription('Manage staff infractions for the team.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── Issue an infraction ───────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('issue')
        .setDescription('Issue a formal infraction to a staff member.')
        .addUserOption((o) =>
          o
            .setName('staff')
            .setDescription('The staff member to receive the infraction.')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('reason')
            .setDescription('The reason for the infraction.')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('severity')
            .setDescription('Severity of the infraction.')
              .setRequired(true)
              .addChoices(
                { name: 'Minor', value: 'minor' },
                { name: 'Moderate', value: 'moderate' },
                { name: 'Severe', value: 'severe' },
              ),
        )
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription(
              'Additional disciplinary action taken (e.g. "Verbal warning", "Demotion").',
            ),
        ),
    )

    // ── View a staff member's infractions ─────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription("View a staff member's infraction record.")
        .addUserOption((o) =>
          o
            .setName('staff')
            .setDescription('The staff member to look up.')
            .setRequired(true),
        ),
    )

    // ── Remove an infraction ──────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Void/remove a specific infraction from a staff member.')
        .addUserOption((o) =>
          o
            .setName('staff')
            .setDescription('The staff member.')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('The infraction ID (shown in /staffinfraction view).')
            .setRequired(true),
        ),
    )

    // ── List all infractions across the guild ─────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all staff members with active infractions.'),
    ),

  async execute(interaction) {
    // Require SID or moderation leadership level
    const hasAccess =
      hasSidRole(interaction.member, interaction.guild.id) ||
      hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management);
    if (!hasAccess) {
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

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ── issue ─────────────────────────────────────────────────────────────────
    if (sub === 'issue') {
      const staffUser = interaction.options.getUser('staff');
      const reason = interaction.options.getString('reason');
      const severity = interaction.options.getString('severity');
      const action = interaction.options.getString('action');
      const staffMember = await interaction.guild.members.fetch(staffUser.id).catch(() => null);

      // Cannot infract yourself
      if (staffUser.id === interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('You cannot issue an infraction to yourself.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!staffMember) {
        return interaction.reply({
          embeds: [embeds.error('That user is not currently in this server.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!isConfiguredStaffMember(staffMember, guildId)) {
        return interaction.reply({
          embeds: [
            embeds.error(
              'That user is not part of the staff team.',
              interaction.guild,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const record = db.addStaffInfraction(guildId, staffUser.id, {
        issuedById: interaction.user.id,
        reason,
        severity,
        action,
      });

      const infractionEmbed = embeds
        .base(interaction.guild)
        .setColor(SEVERITY_COLORS[severity] ?? 0xfee75c)
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
          { name: 'Severity', value: severity.charAt(0).toUpperCase() + severity.slice(1), inline: true },
          { name: 'Reason', value: reason },
          ...(action ? [{ name: 'Additional Action', value: action }] : []),
          { name: 'Infraction ID', value: `\`${record.id}\``, inline: true },
        );

      await interaction.reply({ embeds: [infractionEmbed] });

      // Attempt to DM the staff member
      try {
        const dmEmbed = embeds
          .base(null)
          .setColor(SEVERITY_COLORS[severity] ?? 0xfee75c)
          .setTitle(`Staff Infraction — ${interaction.guild.name}`)
          .setDescription(
            `You have received a **${severity}** staff infraction in **${interaction.guild.name}**.`,
          )
          .addFields(
            { name: 'Reason', value: reason },
            ...(action ? [{ name: 'Additional Action', value: action }] : []),
            { name: 'Infraction ID', value: `\`${record.id}\`` },
          );
        await staffUser.send({ embeds: [dmEmbed] });
      } catch {
        // DMs disabled — ignore
      }

      // Log to mod-log channel if configured
      const logChannelId = db.getConfig(guildId).logChannelId;
      if (logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        if (logChannel?.isTextBased()) {
          await logChannel.send({ embeds: [infractionEmbed] }).catch(() => null);
        }
      }

      return;
    }

    // ── view ──────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const staffUser = interaction.options.getUser('staff');
      const infractions = db.getStaffInfractions(guildId, staffUser.id);

      if (!infractions.length) {
        return interaction.reply({
          embeds: [
            embeds.info(
                'No Infractions',
              `${staffUser} has no recorded staff infractions.`,
              interaction.guild,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const fieldLines = infractions.map((inf, idx) => {
        const ts = `<t:${Math.floor(new Date(inf.timestamp).getTime() / 1000)}:D>`;
        const actionLine = inf.action ? `\nAction: ${inf.action}` : '';
        return `**#${idx + 1}** — \`${inf.severity}\` — ID: \`${inf.id}\`\nReason: ${inf.reason}${actionLine}\nDate: ${ts} — Issued by <@${inf.issuedById}>`;
      });

      // Split into chunks of 5 to stay within embed limits
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

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const staffUser = interaction.options.getUser('staff');
      const idStr = interaction.options.getString('id');
      const id = parseInt(idStr, 10);

      if (isNaN(id)) {
        return interaction.reply({
          embeds: [embeds.error('Invalid infraction ID. Please provide the numeric ID shown in `/staffinfraction view`.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const removed = db.removeStaffInfraction(guildId, staffUser.id, id);
      if (!removed) {
        return interaction.reply({
          embeds: [embeds.error(`No infraction with ID \`${id}\` found for ${staffUser}.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        embeds: [
          embeds.success(
            `Infraction \`${id}\` has been removed from ${staffUser}'s record.`,
            interaction.guild,
          ),
        ],
      });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const all = db.getAllStaffInfractions(guildId);
      const withInfractions = all.filter((e) => e.infractions.length > 0);

      if (!withInfractions.length) {
        return interaction.reply({
          embeds: [
            embeds.info(
               'Staff Infractions',
              'No staff members have recorded infractions.',
              interaction.guild,
            ),
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
  },
};
