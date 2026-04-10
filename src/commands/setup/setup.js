'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // ── Basic config ──────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('logs')
        .setDescription('Set the channel where moderation actions are logged.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('The text channel to use for mod logs.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome')
        .setDescription('Configure the welcome message sent when a member joins.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('The text channel to send welcome messages in.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('message')
            .setDescription(
              'Custom welcome text. Use {user} for mention, {server} for server name.',
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('removewelcome').setDescription('Disable welcome messages for this server.'),
    )
    .addSubcommand((sub) =>
      sub.setName('removelogs').setDescription('Disable mod-log messages for this server.'),
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View the current bot configuration for this server.'),
    )

    // ── Shift DM toggle ───────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName('shiftdm')
        .setDescription('Enable or disable DMs sent to staff when they start or end a shift.')
        .addBooleanOption((o) =>
          o
            .setName('enabled')
            .setDescription('true = send DMs, false = no DMs.')
            .setRequired(true),
        ),
    )

    // ── Staff Roles ───────────────────────────────────────────────────────────
    .addSubcommandGroup((group) =>
      group
        .setName('staffroles')
        .setDescription('Manage roles that are allowed to use the shift system.')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Allow a role to clock in/out of shifts.')
            .addRoleOption((o) =>
              o.setName('role').setDescription('The role to add.').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a role from the staff shift list.')
            .addRoleOption((o) =>
              o.setName('role').setDescription('The role to remove.').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('List all configured staff roles.'),
        ),
    )

    // ── Mod Roles ─────────────────────────────────────────────────────────────
    .addSubcommandGroup((group) =>
      group
        .setName('modroles')
        .setDescription(
          'Assign roles to moderation permission levels (moderator / senior mod / leadership).',
        )
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Assign a role to a moderation level.')
            .addStringOption((o) =>
              o
                .setName('level')
                .setDescription('The permission level to assign.')
                .setRequired(true)
                .addChoices(
                  { name: 'Moderator', value: 'moderatorRoleId' },
                  { name: 'Senior Moderator', value: 'seniorModRoleId' },
                  { name: 'Moderation Leadership', value: 'managementRoleId' },
                ),
            )
            .addRoleOption((o) =>
              o.setName('role').setDescription('The role to assign.').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('clear')
            .setDescription('Remove the role assignment for a moderation level.')
            .addStringOption((o) =>
              o
                .setName('level')
                .setDescription('The permission level to clear.')
                .setRequired(true)
                .addChoices(
                  { name: 'Moderator', value: 'moderatorRoleId' },
                  { name: 'Senior Moderator', value: 'seniorModRoleId' },
                  { name: 'Moderation Leadership', value: 'managementRoleId' },
                ),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName('view').setDescription('View the current mod-role assignments.'),
        ),
    )

    // ── Shift Quota ───────────────────────────────────────────────────────────
    .addSubcommandGroup((group) =>
      group
        .setName('quota')
        .setDescription('Configure shift quota requirements and notifications.')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Set the minimum required shift time per wave period.')
            .addIntegerOption((o) =>
              o
                .setName('hours')
                .setDescription('Required shift hours per wave period.')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(168),
            )
            .addStringOption((o) =>
              o
                .setName('period')
                .setDescription('The wave period label (informational).')
                .addChoices(
                  { name: 'Weekly', value: 'weekly' },
                  { name: 'Bi-weekly', value: 'biweekly' },
                  { name: 'Monthly', value: 'monthly' },
                ),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('notify')
            .setDescription('Set the channel where quota notifications are posted.')
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setDescription('Text channel for quota notifications.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName('disable').setDescription('Disable shift quota requirements.'),
        )
        .addSubcommand((sub) =>
          sub.setName('view').setDescription('View the current quota configuration.'),
        ),
    )

    // ── SID Role ──────────────────────────────────────────────────────────────
    .addSubcommandGroup((group) =>
      group
        .setName('sid')
        .setDescription('Configure the Specialized Investigations Division (SID) role.')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Assign a role as the SID role.')
            .addRoleOption((o) =>
              o.setName('role').setDescription('The role to assign as SID.').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName('clear').setDescription('Remove the SID role assignment.'),
        )
        .addSubcommand((sub) =>
          sub.setName('view').setDescription('View the currently configured SID role.'),
        ),
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;

    // ── Basic config ──────────────────────────────────────────────────────────

    if (!group && sub === 'logs') {
      const channel = interaction.options.getChannel('channel');
      db.setConfig(guild.id, 'logChannelId', channel.id);
      return interaction.reply({
        embeds: [
          embeds
            .setup('  Mod Log Channel Set', `Moderation actions will now be logged in ${channel}.`, guild)
            .addFields({ name: '  Channel', value: `${channel} (\`${channel.id}\`)`, inline: true }),
        ],
        ephemeral: true,
      });
    }

    if (!group && sub === 'welcome') {
      const channel = interaction.options.getChannel('channel');
      const message =
        interaction.options.getString('message') ??
        'Welcome to **{server}**, {user}! Please review the server rules.';
      db.setConfig(guild.id, 'welcomeChannelId', channel.id);
      db.setConfig(guild.id, 'welcomeMessage', message);
      return interaction.reply({
        embeds: [
          embeds
            .setup('  Welcome Messages Configured', `New members will be greeted in ${channel}.`, guild)
            .addFields(
              { name: '  Channel', value: `${channel}`, inline: true },
              {
                name: '  Message Preview',
                value: message
                  .replace('{user}', `<@${interaction.user.id}>`)
                  .replace('{server}', guild.name),
              },
            ),
        ],
        ephemeral: true,
      });
    }

    if (!group && sub === 'removewelcome') {
      db.deleteConfig(guild.id, 'welcomeChannelId');
      db.deleteConfig(guild.id, 'welcomeMessage');
      return interaction.reply({
        embeds: [embeds.success('Welcome messages have been disabled for this server.', guild)],
        ephemeral: true,
      });
    }

    if (!group && sub === 'removelogs') {
      db.deleteConfig(guild.id, 'logChannelId');
      return interaction.reply({
        embeds: [embeds.success('Mod logging has been disabled for this server.', guild)],
        ephemeral: true,
      });
    }

    if (!group && sub === 'shiftdm') {
      const enabled = interaction.options.getBoolean('enabled');
      db.setConfig(guild.id, 'shiftDmsEnabled', enabled);
      return interaction.reply({
        embeds: [
          embeds.setup(
            enabled ? '  Shift DMs Enabled' : '  Shift DMs Disabled',
            enabled
              ? 'Staff will now receive a DM when they clock in and out of shifts.'
              : 'Staff will no longer receive DMs for shift events.',
            guild,
          ),
        ],
        ephemeral: true,
      });
    }

    if (!group && sub === 'view') {
      const config = db.getConfig(guild.id);

      const logCh = config.logChannelId ? `<#${config.logChannelId}>` : '`Not set`';
      const welcomeCh = config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : '`Not set`';
      const welcomeMsg = config.welcomeMessage ?? '`Not set`';
      const shiftDms = config.shiftDmsEnabled ? 'Enabled' : 'Disabled';

      const staffRoles = (config.staffRoleIds ?? []);
      const staffRolesDisplay =
        staffRoles.length > 0 ? staffRoles.map((id) => `<@&${id}>`).join(', ') : '`Not set`';

      const modRoles = [
        `**Moderator:** ${config.moderatorRoleId ? `<@&${config.moderatorRoleId}>` : '`Not set`'}`,
        `**Senior Mod:** ${config.seniorModRoleId ? `<@&${config.seniorModRoleId}>` : '`Not set`'}`,
        `**Leadership:** ${config.managementRoleId ? `<@&${config.managementRoleId}>` : '`Not set`'}`,
      ].join('\n');

      const quotaDisplay = config.quotaMs
        ? `${(config.quotaMs / 3_600_000).toFixed(1)}h per **${config.quotaPeriod ?? 'wave'}**`
        : '`Not set`';
      const quotaNotifCh = config.quotaNotifChannelId
        ? `<#${config.quotaNotifChannelId}>`
        : '`Not set`';
      const sidRole = config.sidRoleId ? `<@&${config.sidRoleId}>` : '`Not set`';

      return interaction.reply({
        embeds: [
          embeds
            .setup('  Server Configuration', `Current bot settings for **${guild.name}**.`, guild)
            .setThumbnail(guild.iconURL({ dynamic: true }) ?? null)
            .addFields(
              { name: '  Mod Log Channel', value: logCh, inline: true },
              { name: '  Welcome Channel', value: welcomeCh, inline: true },
              { name: '  Shift DMs', value: shiftDms, inline: true },
              { name: '  Welcome Message', value: welcomeMsg },
              { name: '  Staff Roles', value: staffRolesDisplay },
              { name: '  Mod Roles', value: modRoles },
              { name: '  SID Role', value: sidRole, inline: true },
              { name: '⏱  Shift Quota', value: quotaDisplay, inline: true },
              { name: '  Quota Notifications', value: quotaNotifCh, inline: true },
            ),
        ],
        ephemeral: true,
      });
    }

    // ── Staff Roles ───────────────────────────────────────────────────────────

    if (group === 'staffroles') {
      const config = db.getConfig(guild.id);
      const staffRoles = config.staffRoleIds ?? [];

      if (sub === 'add') {
        const role = interaction.options.getRole('role');
        if (staffRoles.includes(role.id)) {
          return interaction.reply({
            embeds: [embeds.warning(`${role} is already a staff role.`, guild)],
            ephemeral: true,
          });
        }
        db.setConfig(guild.id, 'staffRoleIds', [...staffRoles, role.id]);
        return interaction.reply({
          embeds: [
            embeds
              .setup('  Staff Role Added', `${role} can now use the shift system.`, guild)
              .addFields({ name: '  Role', value: `${role} (\`${role.id}\`)`, inline: true }),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'remove') {
        const role = interaction.options.getRole('role');
        if (!staffRoles.includes(role.id)) {
          return interaction.reply({
            embeds: [embeds.warning(`${role} is not a configured staff role.`, guild)],
            ephemeral: true,
          });
        }
        db.setConfig(guild.id, 'staffRoleIds', staffRoles.filter((id) => id !== role.id));
        return interaction.reply({
          embeds: [
            embeds.setup('  Staff Role Removed', `${role} has been removed from the staff list.`, guild),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'list') {
        if (staffRoles.length === 0) {
          return interaction.reply({
            embeds: [
              embeds.setup(
                '  Staff Roles',
                'No staff roles are configured. Anyone can currently use the shift system.',
                guild,
              ),
            ],
            ephemeral: true,
          });
        }
        return interaction.reply({
          embeds: [
            embeds
              .setup('  Staff Roles', 'Roles permitted to use the shift system:', guild)
              .addFields(
                staffRoles.map((id, i) => ({
                  name: `Role ${i + 1}`,
                  value: `<@&${id}> (\`${id}\`)`,
                  inline: true,
                })),
              ),
          ],
          ephemeral: true,
        });
      }
    }

    // ── Mod Roles ─────────────────────────────────────────────────────────────

    if (group === 'modroles') {
      const config = db.getConfig(guild.id);

      if (sub === 'set') {
        const levelKey = interaction.options.getString('level');
        const role = interaction.options.getRole('role');
        db.setConfig(guild.id, levelKey, role.id);

        const levelLabel = {
          moderatorRoleId: 'Moderator',
          seniorModRoleId: 'Senior Moderator',
          managementRoleId: 'Moderation Leadership',
        }[levelKey];

        return interaction.reply({
          embeds: [
            embeds
              .setup(`  Mod Role Set — ${levelLabel}`, `${role} has been assigned to the **${levelLabel}** level.`, guild)
              .addFields(
                { name: '  Role', value: `${role}`, inline: true },
                { name: '  Level', value: `\`${levelLabel}\``, inline: true },
              ),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'clear') {
        const levelKey = interaction.options.getString('level');
        db.deleteConfig(guild.id, levelKey);
        const levelLabel = {
          moderatorRoleId: 'Moderator',
          seniorModRoleId: 'Senior Moderator',
          managementRoleId: 'Moderation Leadership',
        }[levelKey];
        return interaction.reply({
          embeds: [
            embeds.success(`The **${levelLabel}** mod-role assignment has been cleared.`, guild),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'view') {
        const lines = [
          `**Moderator:** ${config.moderatorRoleId ? `<@&${config.moderatorRoleId}>` : '`Not set`'}`,
          `**Senior Moderator:** ${config.seniorModRoleId ? `<@&${config.seniorModRoleId}>` : '`Not set`'}`,
          `**Leadership:** ${config.managementRoleId ? `<@&${config.managementRoleId}>` : '`Not set`'}`,
        ].join('\n');
        return interaction.reply({
          embeds: [
            embeds
              .setup('  Moderation Role Assignments', lines, guild)
              .addFields({
                name: '  How It Works',
                value:
                  'When mod roles are configured, users must hold the appropriate (or higher) role to use moderation commands. Higher roles satisfy lower-level checks.',
              }),
          ],
          ephemeral: true,
        });
      }
    }

    // ── Shift Quota ───────────────────────────────────────────────────────────

    if (group === 'quota') {
      if (sub === 'set') {
        const hours = interaction.options.getInteger('hours');
        const period = interaction.options.getString('period') ?? 'weekly';
        db.setConfig(guild.id, 'quotaMs', hours * 3_600_000);
        db.setConfig(guild.id, 'quotaPeriod', period);
        return interaction.reply({
          embeds: [
            embeds
              .setup('⏱  Shift Quota Set', `Staff members must complete **${hours} hours** of shift time per **${period}** wave.`, guild)
              .addFields(
                { name: '⏱  Required Time', value: `\`${hours}h\``, inline: true },
                { name: '  Period', value: `\`${period}\``, inline: true },
              ),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'notify') {
        const channel = interaction.options.getChannel('channel');
        db.setConfig(guild.id, 'quotaNotifChannelId', channel.id);
        return interaction.reply({
          embeds: [
            embeds
              .setup('  Quota Notification Channel Set', `Quota notifications will be posted in ${channel}.`, guild)
              .addFields({ name: '  Channel', value: `${channel}`, inline: true }),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'disable') {
        db.deleteConfig(guild.id, 'quotaMs');
        db.deleteConfig(guild.id, 'quotaPeriod');
        return interaction.reply({
          embeds: [embeds.success('Shift quota requirements have been disabled.', guild)],
          ephemeral: true,
        });
      }

      if (sub === 'view') {
        const config = db.getConfig(guild.id);
        const quotaDisplay = config.quotaMs
          ? `\`${(config.quotaMs / 3_600_000).toFixed(1)}h\` per **${config.quotaPeriod ?? 'wave'}**`
          : '`Not configured`';
        const notifCh = config.quotaNotifChannelId
          ? `<#${config.quotaNotifChannelId}>`
          : '`Not set`';
        return interaction.reply({
          embeds: [
            embeds
              .setup('⏱  Quota Configuration', 'Current shift quota settings.', guild)
              .addFields(
                { name: '⏱  Required Shift Time', value: quotaDisplay, inline: true },
                { name: '  Notification Channel', value: notifCh, inline: true },
              ),
          ],
          ephemeral: true,
        });
      }
    }

    // ── SID Role ──────────────────────────────────────────────────────────────

    if (group === 'sid') {
      if (sub === 'set') {
        const role = interaction.options.getRole('role');
        db.setConfig(guild.id, 'sidRoleId', role.id);
        return interaction.reply({
          embeds: [
            embeds
              .setup('  SID Role Set', `${role} has been configured as the **Specialized Investigations Division (SID)** role.`, guild)
              .addFields({ name: '  Role', value: `${role} (\`${role.id}\`)`, inline: true }),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'clear') {
        db.deleteConfig(guild.id, 'sidRoleId');
        return interaction.reply({
          embeds: [embeds.success('The SID role assignment has been cleared.', guild)],
          ephemeral: true,
        });
      }

      if (sub === 'view') {
        const config = db.getConfig(guild.id);
        const sidMention = config.sidRoleId ? `<@&${config.sidRoleId}>` : '`Not configured`';
        return interaction.reply({
          embeds: [
            embeds
              .setup('  SID Role', 'Specialized Investigations Division role configuration.', guild)
              .addFields(
                { name: '  SID Role', value: sidMention, inline: true },
                {
                  name: '  About SID',
                  value:
                    'The SID role is used to identify members of the Specialized Investigations Division. Staff with this role can use SID-related features.',
                },
              ),
          ],
          ephemeral: true,
        });
      }
    }
  },
};
