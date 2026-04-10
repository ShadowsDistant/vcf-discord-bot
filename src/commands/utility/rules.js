'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show a condensed version of the server rules.'),

  async execute(interaction) {
    const links = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Full Rules')
        .setStyle(ButtonStyle.Link)
        .setURL('https://docs.valleycorrectional.xyz/community-rules/our-rules'),
    );

    return interaction.reply({
      embeds: [
        embeds
          .info(
            '  Condensed Rules',
            [
              '1. Be respectful to all members and staff.',
              '2. No harassment, hate speech, threats, or NSFW content.',
              '3. No spam, excessive caps, or disruptive behavior.',
              '4. Follow Discord ToS and server staff instructions.',
              '5. Keep moderation and shift-related actions professional and honest.',
              '6. Use channels for their intended purpose.',
            ].join('\n'),
            interaction.guild,
          )
          .setFooter({
            text: `${interaction.guild.name} • Full rules may include additional details`,
            iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
          }),
      ],
      components: [links],
    });
  },
};
