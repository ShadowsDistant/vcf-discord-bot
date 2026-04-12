'use strict';

const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('View Bakery')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false),

  async execute(interaction) {
    const target = interaction.targetUser;
    const snapshot = economy.getUserSnapshot(interaction.guild.id, target.id);
    const user = snapshot.user;
    const rarestItemId = Object.entries(user.inventory ?? {})
      .filter(([, qty]) => qty > 0)
      .sort((a, b) => {
        const rarityDiff = economy.RARITY_ORDER.indexOf(economy.ITEM_MAP.get(b[0])?.rarity ?? 'common')
          - economy.RARITY_ORDER.indexOf(economy.ITEM_MAP.get(a[0])?.rarity ?? 'common');
        return rarityDiff || (b[1] - a[1]);
      })[0]?.[0] ?? null;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🍪 ${user.bakeryEmoji ?? '🍪'} ${user.bakeryName ?? 'My Bakery'}`)
      .setDescription(`Public bakery stats for ${target}.`)
      .addFields(
        { name: 'Rank', value: user.rankId ?? 'rookie', inline: true },
        { name: 'CPS', value: economy.toCookieNumber(economy.computeCps(user, Date.now())), inline: true },
        { name: 'Achievements', value: `${(user.milestones ?? []).length}`, inline: true },
        {
          name: 'Rarest Item',
          value: rarestItemId ? `${economy.getItemEmoji(rarestItemId, interaction.guild)} ${economy.ITEM_MAP.get(rarestItemId)?.name ?? rarestItemId}` : 'None yet',
          inline: false,
        },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
