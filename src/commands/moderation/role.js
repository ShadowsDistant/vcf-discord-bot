'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a role to a member.')
        .addUserOption((o) =>
          o.setName('user').setDescription('The member to add the role to.').setRequired(true),
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('The role to add.').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Reason for adding the role.'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from a member.')
        .addUserOption((o) =>
          o.setName('user').setDescription('The member to remove the role from.').setRequired(true),
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('The role to remove.').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Reason for removing the role.'),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not a member of this server.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (role.managed) {
      return interaction.reply({
        embeds: [embeds.error('That role is managed by an integration and cannot be assigned manually.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({
        embeds: [embeds.error('I cannot assign a role that is equal to or higher than my highest role.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (sub === 'add') {
      if (member.roles.cache.has(role.id)) {
        return interaction.reply({
          embeds: [embeds.warning(`${target} already has the ${role} role.`, interaction.guild)],
          ephemeral: true,
        });
      }

      try {
        await member.roles.add(role, `${interaction.user.tag}: ${reason}`);

        return interaction.reply({
          embeds: [
            embeds
              .success(`Added ${role} to ${target}.`, interaction.guild)
              .addFields(
                { name: '  Member', value: `${target} (\`${target.tag}\`)`, inline: true },
                { name: '  Role', value: `${role}`, inline: true },
                { name: '  Moderator', value: `${interaction.user}`, inline: true },
                { name: '  Reason', value: reason },
              ),
          ],
        });
      } catch (err) {
        return interaction.reply({
          embeds: [embeds.error(`Failed to add role: \`${err.message}\``, interaction.guild)],
          ephemeral: true,
        });
      }
    }

    if (sub === 'remove') {
      if (!member.roles.cache.has(role.id)) {
        return interaction.reply({
          embeds: [embeds.warning(`${target} does not have the ${role} role.`, interaction.guild)],
          ephemeral: true,
        });
      }

      try {
        await member.roles.remove(role, `${interaction.user.tag}: ${reason}`);

        return interaction.reply({
          embeds: [
            embeds
              .success(`Removed ${role} from ${target}.`, interaction.guild)
              .addFields(
                { name: '  Member', value: `${target} (\`${target.tag}\`)`, inline: true },
                { name: '  Role', value: `${role}`, inline: true },
                { name: '  Moderator', value: `${interaction.user}`, inline: true },
                { name: '  Reason', value: reason },
              ),
          ],
        });
      } catch (err) {
        return interaction.reply({
          embeds: [embeds.error(`Failed to remove role: \`${err.message}\``, interaction.guild)],
          ephemeral: true,
        });
      }
    }
  },
};
