'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const { PALETTE } = require('../../utils/embeds');

const VERIFICATION_LEVELS = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Very High',
};

const NSFW_LEVELS = {
  0: 'Default',
  1: 'Explicit',
  2: 'Safe',
  3: 'Age Restricted',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information about this server.'),

  async execute(interaction) {
    const { guild } = interaction;
    await guild.fetch();

    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

    const embed = new EmbedBuilder()
      .setColor(PALETTE.primary)
      .setTitle(`  ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }) ?? null)
      .addFields(
        { name: '🆔  Server ID', value: `\`${guild.id}\``, inline: true },
        { name: '  Owner', value: owner ? `${owner.user}` : 'Unknown', inline: true },
        { name: '  Region', value: guild.preferredLocale ?? 'Unknown', inline: true },
        {
          name: '  Created',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`,
        },
        {
          name: '  Members',
          value: [
            `Total: **${guild.memberCount}**`,
            `Humans: **${guild.members.cache.filter((m) => !m.user.bot).size}**`,
            `Bots: **${guild.members.cache.filter((m) => m.user.bot).size}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '  Channels',
          value: [
            `Text: **${textChannels}**`,
            `Voice: **${voiceChannels}**`,
            `Categories: **${categories}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '  Roles',
          value: `${guild.roles.cache.size}`,
          inline: true,
        },
        {
          name: '  Boosts',
          value: `Level **${guild.premiumTier}** — **${guild.premiumSubscriptionCount ?? 0}** boosts`,
          inline: true,
        },
        {
          name: '  Verification Level',
          value: VERIFICATION_LEVELS[guild.verificationLevel] ?? 'Unknown',
          inline: true,
        },
        {
          name: '  NSFW Level',
          value: NSFW_LEVELS[guild.nsfwLevel] ?? 'Unknown',
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({
        text: guild.name,
        iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
      });

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 }));
    }

    if (guild.description) {
      embed.setDescription(guild.description);
    }

    return interaction.reply({ embeds: [embed] });
  },
};
