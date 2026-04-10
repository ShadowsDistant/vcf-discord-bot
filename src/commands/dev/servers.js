'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

const DEV_USER_ID = process.env.DEV_USER_ID ?? '757698506411475005';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servers')
    .setDescription('[Dev] List all servers the bot is currently in.'),

  async execute(interaction) {
    if (interaction.user.id !== DEV_USER_ID) {
      return interaction.reply({
        embeds: [embeds.error('This command is restricted to the bot developer.', interaction.guild ?? null)],
        ephemeral: true,
      });
    }

    const guilds = interaction.client.guilds.cache;
    const total = guilds.size;

    // Build a paginated-friendly list (max 20 guilds displayed)
    const listed = guilds
      .first(20)
      .map((g, idx) => `\`${(idx + 1).toString().padStart(2, '0')}.\` **${g.name}** — \`${g.id}\` — ${g.memberCount.toLocaleString()} members`)
      .join('\n');

    const totalMembers = guilds.reduce((sum, g) => sum + g.memberCount, 0);

    return interaction.reply({
      embeds: [
        embeds
          .dev(
            `🌐  Server List (${total})`,
            listed || 'No servers found.',
            interaction.guild ?? null,
          )
          .addFields(
            { name: '📊  Total Servers', value: `\`${total}\``, inline: true },
            { name: '👥  Total Members', value: `\`${totalMembers.toLocaleString()}\``, inline: true },
          ),
      ],
      ephemeral: true,
    });
  },
};
