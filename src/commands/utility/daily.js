'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const challenges = require('../../utils/bakeryChallenges');
const embeds = require('../../utils/embeds');
const economy = require('../../utils/bakeEconomy');

function formatProgress(progress, target) {
  return `${economy.toCookieNumber(progress)} / ${economy.toCookieNumber(target)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('View bakery daily and weekly challenges.')
    .setDMPermission(false)
    .addBooleanOption((o) =>
      o
        .setName('claim')
        .setDescription('Claim any completed challenge rewards.'),
    ),

  async execute(interaction) {
    const shouldClaim = interaction.options.getBoolean('claim') ?? false;

    const rewards = shouldClaim
      ? challenges.claimAvailableRewards(interaction.guild.id, interaction.user.id, Date.now())
      : [];

    const status = challenges.getChallengeStatus(interaction.guild.id, interaction.user.id, Date.now());

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🍪 Daily & Weekly Challenges')
      .addFields(
        {
          name: `Daily: ${status.daily.name}`,
          value: [
            `Progress: **${formatProgress(status.daily.progress, status.daily.target)}**`,
            `Reward: **${economy.toCookieNumber(status.daily.rewardCookies)}** cookies`,
            `Status: ${status.daily.claimed ? '✅ Claimed' : (status.daily.complete ? '🎉 Complete (claim ready)' : '⏳ In progress')}`,
          ].join('\n'),
        },
        {
          name: `Weekly: ${status.weekly.name}`,
          value: [
            `Progress: **${formatProgress(status.weekly.progress, status.weekly.target)}**`,
            `Reward: **${economy.toCookieNumber(status.weekly.rewardCookies)}** cookies`,
            `Status: ${status.weekly.claimed ? '✅ Claimed' : (status.weekly.complete ? '🎉 Complete (claim ready)' : '⏳ In progress')}`,
          ].join('\n'),
        },
      )
      .setTimestamp()
      .setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    if (shouldClaim) {
      if (rewards.length > 0) {
        embed.addFields({
          name: 'Claimed Rewards',
          value: rewards.map((reward) => `• ${reward.type.toUpperCase()}: **${economy.toCookieNumber(reward.cookies)}** cookies (${reward.challenge})`).join('\n').slice(0, 1024),
        });
      } else {
        embed.addFields({ name: 'Claimed Rewards', value: 'No completed unclaimed rewards were available.' });
      }
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
