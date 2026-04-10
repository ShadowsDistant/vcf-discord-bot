'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftroles')
    .setDescription('View all roles currently allowed to start shifts.')
    .setDMPermission(false),

  async execute(interaction) {
    const config = db.getConfig(interaction.guild.id);
    const staffRoles = config.staffRoleIds ?? [];

    if (!staffRoles.length) {
      return interaction.reply({
        embeds: [
          embeds.info(
            '  Shift Roles',
            'No roles are currently allowed to start shifts.',
            interaction.guild,
          ),
        ],
      });
    }

    return interaction.reply({
      embeds: [
        embeds
          .shift('  Shift Roles', 'These roles are currently allowed to start shifts:', interaction.guild)
          .addFields(
            staffRoles.map((id, i) => ({
              name: `Role ${i + 1}`,
              value: `<@&${id}> (\`${id}\`)`,
              inline: true,
            })),
          ),
      ],
    });
  },
};
