'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');
const { formatDuration } = require('../utils/helpers');
const { fetchRobloxProfileByUsername, createRobloxEmbed } = require('../utils/roblox');
const { ROLE_IDS } = require('../utils/roles');
const { UPDATE_LOGS, createUpdateEmbed } = require('../utils/updateLogs');
const economy = require('../utils/bakeEconomy');
const bakeCommand = require('../commands/utility/bake');
const { version: botVersion } = require('../../package.json');

/** Commands whose `reason` option supports preset-reason autocomplete. */
const REASON_AUTOCOMPLETE_COMMANDS = new Set(['ban', 'kick', 'warn']);
const ERROR_DETAIL_LIMIT = 500;

async function sendBakeAdminLog(interaction, targetUserId, action, details) {
  const channelId = economy.getAdminLogChannelId(interaction.guild.id);
  if (!channelId) return;
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Bake Admin Action')
    .setDescription([
      `**Moderator:** ${interaction.user.tag} (\`${interaction.user.id}\`)`,
      `**Target:** <@${targetUserId}> (\`${targetUserId}\`)`,
      `**Action:** ${action}`,
      `**Details:** ${details}`,
    ].join('\n'))
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => null);
}

function getErrorDetails(err) {
  if (!err) return 'Unknown error.';
  const errorName = typeof err.name === 'string' && err.name.trim().length > 0 ? err.name.trim() : 'Error';
  const errorMessage = typeof err.message === 'string' && err.message.trim().length > 0
    ? err.message.trim()
    : String(err);
  const combined = `${errorName}: ${errorMessage}`;
  if (combined.length <= ERROR_DETAIL_LIMIT) return combined;
  return `${combined.slice(0, ERROR_DETAIL_LIMIT - 3)}...`;
}

function getButtonOwnerId(interaction) {
  const commandOwnerId = interaction.message?.interactionMetadata?.user?.id
    ?? interaction.message?.interaction?.user?.id
    ?? null;
  return commandOwnerId;
}

function normalizeLookupValue(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveItemId(input) {
  const raw = String(input ?? '').trim();
  const byId = raw.toLowerCase();
  if (economy.ITEM_MAP.has(byId)) return byId;
  const normalized = normalizeLookupValue(raw);
  if (!normalized) return null;
  const found = economy.ITEMS.find((item) =>
    normalizeLookupValue(item.id) === normalized || normalizeLookupValue(item.name) === normalized);
  return found?.id ?? null;
}

function resolveBuildingId(input) {
  const raw = String(input ?? '').trim();
  const exact = economy.BUILDINGS.find((building) => building.id === raw || building.name === raw);
  if (exact) return exact.id;
  const normalized = normalizeLookupValue(raw);
  if (!normalized) return null;
  const found = economy.BUILDINGS.find((building) =>
    normalizeLookupValue(building.id) === normalized || normalizeLookupValue(building.name) === normalized);
  return found?.id ?? null;
}

function parseMentionOrId(input, type) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const mentionPattern = type === 'channel' ? /^<#(\d+)>$/ : /^<@&(\d+)>$/;
  const mentionMatch = raw.match(mentionPattern);
  if (mentionMatch) return mentionMatch[1];
  const idMatch = raw.match(/^(\d+)$/);
  if (idMatch) return idMatch[1];
  return null;
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('bake_golden_claim:')) {
        const [, ownerId, token] = interaction.customId.split(':');
        if (ownerId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('That Golden Cookie belongs to someone else, crumb thief.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const result = economy.claimGoldenCookie(interaction.guild.id, interaction.user.id, token);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.success(result.description, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const ownerId = getButtonOwnerId(interaction);
      if (ownerId && ownerId !== interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('These buttons belong to someone else\'s command.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakery_nav:')) {
        const requestedView = interaction.customId.split(':')[1];
        const view = requestedView === 'codex' ? 'guide' : requestedView;
        const viewOptions = view === 'guide' ? { section: 'cookies', page: 0 } : {};
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, view, viewOptions);
        const components = economy.buildDashboardComponents(snapshot.user, view, { guild: interaction.guild, ...viewOptions });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bake_again') {
        return interaction.update(bakeCommand.buildBakeReply(interaction.guild, interaction.user.id));
      }

      if (interaction.customId.startsWith('bakery_guide_prev:') || interaction.customId.startsWith('bakery_guide_next:')) {
        const [, section, currentPageRaw] = interaction.customId.split(':');
        const currentPage = Number.parseInt(currentPageRaw, 10) || 0;
        const targetPage = interaction.customId.startsWith('bakery_guide_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'guide', { section, page: targetPage });
        const components = economy.buildDashboardComponents(snapshot.user, 'guide', { section, page: targetPage, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_codex_prev:') || interaction.customId.startsWith('bakery_codex_next:')) {
        const currentPage = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const targetPage = interaction.customId.startsWith('bakery_codex_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'guide', { section: 'cookies', page: targetPage });
        const components = economy.buildDashboardComponents(snapshot.user, 'guide', { section: 'cookies', page: targetPage, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_achievements_prev:') || interaction.customId.startsWith('bakery_achievements_next:')) {
        const currentPage = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const targetPage = interaction.customId.startsWith('bakery_achievements_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'achievements', { page: targetPage });
        const components = economy.buildDashboardComponents(snapshot.user, 'achievements', { page: targetPage, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_open_marketplace') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, 0, 'all');
        const components = economy.getMarketplaceComponents(snapshot.guildState, 0, 'all');
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId === 'bakery_set_name') {
        return interaction.showModal(economy.modalForBakeryName());
      }

      if (interaction.customId === 'bakery_set_listing' || interaction.customId === 'market_list_item') {
        return interaction.showModal(economy.modalForListItem());
      }

      if (interaction.customId.startsWith('bakery_build_buy:')) {
        const [, buildingId, qtyRaw] = interaction.customId.split(':');
        const quantity = Number.parseInt(qtyRaw, 10);
        const result = economy.buyBuilding(interaction.guild.id, interaction.user.id, buildingId, quantity);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'buildings', { buildingId });
        const components = economy.buildDashboardComponents(snapshot.user, 'buildings', { buildingId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_upgrade_buy:')) {
        const upgradeId = interaction.customId.split(':')[1];
        const result = economy.buyUpgrade(interaction.guild.id, interaction.user.id, upgradeId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'upgrades', { upgradeId });
        const components = economy.buildDashboardComponents(snapshot.user, 'upgrades', { upgradeId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_item_action:')) {
        const [, action, itemId] = interaction.customId.split(':');
        let result = null;
        if (action === 'sell') result = economy.sellInventoryItem(interaction.guild.id, interaction.user.id, itemId, false);
        if (action === 'sellall') result = economy.sellInventoryItem(interaction.guild.id, interaction.user.id, itemId, true);
        if (action === 'consume') result = economy.consumeInventoryItem(interaction.guild.id, interaction.user.id, itemId);
        if (action === 'inspect') {
          const details = economy.inspectItem(interaction.guild.id, interaction.user.id, itemId);
          if (!details) {
            return interaction.reply({
              embeds: [embeds.error('Could not inspect that item.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            embeds: [economy.buildItemInspectEmbed(interaction.guild, details)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!result?.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result?.reason ?? 'Could not process item action.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const dashboard = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'inventory');
        const components = economy.buildDashboardComponents(snapshot.user, 'inventory', { guild: interaction.guild });
        return interaction.update({ embeds: [dashboard], components });
      }

      if (interaction.customId.startsWith('market_prev:') || interaction.customId.startsWith('market_next:')) {
        const [, pageRaw, rarityFilter] = interaction.customId.split(':');
        const currentPage = Number.parseInt(pageRaw, 10) || 0;
        const targetPage = interaction.customId.startsWith('market_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, targetPage, rarityFilter || 'all');
        const components = economy.getMarketplaceComponents(snapshot.guildState, market.pageIndex, rarityFilter || 'all');
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId === 'market_my_listings') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const mine = (snapshot.guildState.marketplace.listings ?? []).filter((listing) => listing.sellerId === interaction.user.id);
        if (!mine.length) {
          return interaction.reply({
            embeds: [embeds.info('My Listings', 'You have no active listings.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const listEmbed = embeds.info(
          'My Listings',
          mine.slice(0, 10).map((listing) => `\`${listing.id}\` • ${economy.ITEM_MAP.get(listing.itemId)?.name ?? listing.itemId} x${listing.quantity} @ ${economy.toCookieNumber(listing.pricePerUnit)}`).join('\n'),
          interaction.guild,
        );
        const row = new ActionRowBuilder().addComponents(
          mine.slice(0, 5).map((listing) => new ButtonBuilder()
            .setCustomId(`market_cancel:${listing.id}`)
            .setLabel(`Cancel #${listing.id}`)
            .setStyle(ButtonStyle.Danger)),
        );
        return interaction.reply({ embeds: [listEmbed], components: [row], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'market_back_bakery') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'home');
        const components = economy.buildDashboardComponents(snapshot.user, 'home', { guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('market_cancel:')) {
        const listingId = Number.parseInt(interaction.customId.split(':')[1], 10);
        const result = economy.cancelListing(interaction.guild.id, interaction.user.id, listingId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.success(`Listing #${listingId} cancelled and returned to inventory.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_view_refresh:')) {
        const targetUserId = interaction.customId.split(':')[1];
        const embed = economy.getUserDataEmbed(interaction.guild, targetUserId);
        return interaction.update({ embeds: [embed] });
      }

      if (interaction.customId.startsWith('userinfo_roblox:')) {
        const [, targetId, encodedQuery] = interaction.customId.split(':');
        if (!targetId) {
          return interaction.reply({
            embeds: [embeds.error('Invalid Roblox button payload.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
        const targetMember = targetUser
          ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
          : null;
        const nickname = decodeURIComponent(encodedQuery || '')
          || targetMember?.nickname
          || targetUser?.username;

        if (!nickname) {
          return interaction.reply({
            embeds: [embeds.error('Could not determine a Roblox username for this user.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const robloxData = await fetchRobloxProfileByUsername(nickname);
          if (!robloxData) {
            return interaction.editReply({
              embeds: [
                embeds.error(`No Roblox user found for **${nickname}**.`, interaction.guild),
              ],
            });
          }
          const embed = createRobloxEmbed(interaction.guild, robloxData, nickname);
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply({
            embeds: [
              embeds.error(
                `An error occurred while fetching Roblox data: ${err.message}`,
                interaction.guild,
              ),
            ],
          });
        }
      }

      if (interaction.customId === 'portal_startshift') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to start a shift.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const result = db.startShift(interaction.guild.id, interaction.user.id, interaction.user.tag);
        if (!result) {
          return interaction.reply({
            embeds: [embeds.warning("You're already on shift! Use End Shift to clock out first.", interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const startedTs = Math.floor(new Date(result.startedAt).getTime() / 1000);
        return interaction.reply({
          embeds: [
            embeds
              .shift('  Shift Started', `Welcome back, ${interaction.user}! Your shift has begun.`, interaction.guild)
              .addFields({
                name: '  Started At',
                value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`,
                inline: true,
              }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'portal_endshift') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to end a shift.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const record = db.endShift(interaction.guild.id, interaction.user.id);
        if (!record) {
          return interaction.reply({
            embeds: [embeds.warning("You're not currently on shift.", interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const startedTs = Math.floor(new Date(record.startedAt).getTime() / 1000);
        const endedTs = Math.floor(new Date(record.endedAt).getTime() / 1000);
        return interaction.reply({
          embeds: [
            embeds
              .shift('  Shift Ended', `Thanks for your work, ${interaction.user}!`, interaction.guild)
              .addFields(
                { name: '  Duration', value: formatDuration(record.durationMs), inline: true },
                { name: '  Started', value: `<t:${startedTs}:T>`, inline: true },
                { name: '  Ended', value: `<t:${endedTs}:T>`, inline: true },
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'portal_shiftdetails') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to view shift details.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
        const totalMs = history.reduce((sum, shift) => sum + shift.durationMs, 0);
        const active = db.getActiveShift(interaction.guild.id, interaction.user.id);

        const detailEmbed = embeds
          .shift('📋 Detailed Shift Overview', 'Your complete shift breakdown.', interaction.guild)
          .addFields(
            { name: 'Status', value: active ? '**On Shift**' : '**Off Shift**', inline: true },
            { name: 'Completed Shifts', value: `**${history.length}**`, inline: true },
            { name: 'Total Time', value: `**${formatDuration(totalMs)}**`, inline: true },
          );

        if (active) {
          const startedTs = Math.floor(new Date(active.startedAt).getTime() / 1000);
          detailEmbed.addFields({
            name: 'Current Shift',
            value: `Started <t:${startedTs}:F> (<t:${startedTs}:R>)`,
          });
        }

        if (history.length > 0) {
          const recent = history
            .slice(-10)
            .reverse()
            .map((shift) => {
              const startedTs = Math.floor(new Date(shift.startedAt).getTime() / 1000);
              return `ID \`${shift.id}\` · <t:${startedTs}:D> — **${formatDuration(shift.durationMs)}**`;
            });
          detailEmbed.addFields({
            name: 'Recent Shifts (last 10)',
            value: recent.join('\n'),
          });
        }

        return interaction.reply({
          embeds: [detailEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('bakery_inventory_filter:')) {
        const page = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const rarityFilter = interaction.values[0] ?? 'all';
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'inventory', { page, rarityFilter });
        const components = economy.buildDashboardComponents(snapshot.user, 'inventory', { page, rarityFilter, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_inventory_item') {
        const itemId = interaction.values[0];
        const item = economy.ITEM_MAP.get(itemId);
        if (!item) {
          return interaction.reply({
            embeds: [embeds.error('Unknown inventory item selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const inspect = economy.inspectItem(interaction.guild.id, interaction.user.id, itemId);
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bakery_item_action:sell:${itemId}`).setLabel('Sell').setStyle(ButtonStyle.Success).setEmoji(economy.getButtonEmoji(interaction.guild, ['Paid_in_full', 'sell'], '💰')),
          new ButtonBuilder().setCustomId(`bakery_item_action:sellall:${itemId}`).setLabel('Sell All').setStyle(ButtonStyle.Success).setEmoji(economy.getButtonEmoji(interaction.guild, ['International_exchange', 'sell_all'], '💸')),
          new ButtonBuilder().setCustomId(`bakery_item_action:consume:${itemId}`).setLabel('Consume').setStyle(ButtonStyle.Primary).setEmoji(economy.getButtonEmoji(interaction.guild, ['Cookie_dough', 'consume'], '🍽️')),
          new ButtonBuilder().setCustomId(`bakery_item_action:inspect:${itemId}`).setLabel('Inspect').setStyle(ButtonStyle.Secondary).setEmoji(economy.getButtonEmoji(interaction.guild, ['Polymath', 'inspect'], '🔍')),
        );
        return interaction.reply({
          embeds: [economy.buildItemInspectEmbed(interaction.guild, inspect)],
          components: [actionRow],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'bakery_building_select') {
        const buildingId = interaction.values[0];
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'buildings', { buildingId });
        const components = economy.buildDashboardComponents(snapshot.user, 'buildings', { buildingId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_upgrade_select') {
        const upgradeId = interaction.values[0];
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'upgrades', { upgradeId });
        const components = economy.buildDashboardComponents(snapshot.user, 'upgrades', { upgradeId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_guide_section:')) {
        const page = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const section = interaction.values[0] ?? 'cookies';
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'guide', { section, page });
        const components = economy.buildDashboardComponents(snapshot.user, 'guide', { section, page, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('market_filter:')) {
        const page = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const rarityFilter = interaction.values[0] ?? 'all';
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, page, rarityFilter);
        const components = economy.getMarketplaceComponents(snapshot.guildState, market.pageIndex, rarityFilter);
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId === 'market_select_listing') {
        const listingId = Number.parseInt(interaction.values[0], 10);
        const result = economy.buyListing(interaction.guild.id, interaction.user.id, listingId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, 0, 'all');
        const components = economy.getMarketplaceComponents(snapshot.guildState, 0, 'all');
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId.startsWith('bakeadmin_action:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin menu is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const action = interaction.values[0];
        if (['give_cookies', 'remove_cookies', 'give_item', 'set_building', 'set_log_channel'].includes(action)) {
          const modal = economy.modalForAdminAction(actorId, targetId, action);
          return interaction.showModal(modal);
        }
        if (action === 'unlock_upgrade') {
          return interaction.reply({
            embeds: [embeds.info('Unlock Upgrade', 'Select upgrade to unlock.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_upgrade_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select upgrade')
                  .addOptions(economy.UPGRADES.slice(0, 25).map((upgrade) => ({ label: upgrade.name.slice(0, 100), value: upgrade.id }))),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'grant_achievement') {
          return interaction.reply({
            embeds: [embeds.info('Grant Achievement', 'Select milestone to grant.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_achievement_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select achievement')
                  .addOptions(economy.ACHIEVEMENTS.slice(0, 25).map((achievement) => ({
                    label: achievement.name.slice(0, 100),
                    value: achievement.id,
                    emoji: economy.getAchievementEmoji(achievement, interaction.guild),
                  }))),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'trigger_golden') {
          economy.adminForceGolden(interaction.guild.id, targetId);
          await sendBakeAdminLog(interaction, targetId, 'Trigger Golden Cookie', 'Forced Golden Cookie on next /bake');
          return interaction.reply({
            embeds: [embeds.success(`Forced Golden Cookie for <@${targetId}> on next bake.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'reset_user') {
          const modal = new ModalBuilder()
            .setCustomId(`bakeadmin_modal:${actorId}:${targetId}:reset_user`)
            .setTitle('Reset User Data')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('confirm')
                  .setLabel('Type RESET to confirm')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            );
          return interaction.showModal(modal);
        }
        if (action === 'view_user') {
          const statsEmbed = economy.getUserDataEmbed(interaction.guild, targetId);
          const refresh = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bakeadmin_view_refresh:${targetId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
          );
          return interaction.reply({
            embeds: [statsEmbed],
            components: [refresh],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (interaction.customId.startsWith('bakeadmin_upgrade_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const upgradeId = interaction.values[0];
        const ok = economy.adminUnlockUpgrade(interaction.guild.id, targetId, upgradeId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not unlock that upgrade.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await sendBakeAdminLog(interaction, targetId, 'Unlock Upgrade', `Upgrade: ${upgradeId}`);
        return interaction.reply({
          embeds: [embeds.success(`Unlocked upgrade \`${upgradeId}\` for <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_achievement_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const achievementId = interaction.values[0];
        const ok = economy.adminGrantAchievement(interaction.guild.id, targetId, achievementId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not grant that achievement.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await sendBakeAdminLog(interaction, targetId, 'Grant Achievement', `Achievement: ${achievementId}`);
        return interaction.reply({
          embeds: [embeds.success(`Granted achievement \`${achievementId}\` to <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'updates_log_select') {
        const selectedIndex = Number.parseInt(interaction.values[0], 10);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex >= UPDATE_LOGS.length) {
          return interaction.reply({
            embeds: [embeds.error('Invalid update log selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const selected = UPDATE_LOGS[selectedIndex];
        const updatedEmbed = createUpdateEmbed(interaction.guild, botVersion, selected, selectedIndex);
        return interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'bakery_modal_name') {
        const name = interaction.fields.getTextInputValue('name').trim();
        const emoji = interaction.fields.getTextInputValue('emoji').trim();
        const resolvedEmoji = economy.resolveBakeryEmojiInput(interaction.guild, emoji);
        if (!name) {
          return interaction.reply({
            embeds: [embeds.error('Bakery name cannot be empty.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        economy.setBakeryIdentity(interaction.guild.id, interaction.user.id, name, resolvedEmoji || undefined);
        return interaction.reply({
          embeds: [embeds.success(`Your bakery is now **${resolvedEmoji || '🍪'} ${name}**. Branding complete.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'market_modal_list') {
        const itemId = interaction.fields.getTextInputValue('itemId').trim().toLowerCase();
        const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity').trim(), 10);
        const price = Number.parseInt(interaction.fields.getTextInputValue('price').trim(), 10);
        if (!economy.ITEM_MAP.has(itemId)) {
          return interaction.reply({
            embeds: [embeds.error('Invalid item ID.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(price) || price <= 0) {
          return interaction.reply({
            embeds: [embeds.error('Quantity and price must be positive integers.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const result = economy.listItemForSale(interaction.guild.id, interaction.user.id, interaction.user.tag, itemId, quantity, price);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.success(`Listed **${quantity}x ${economy.ITEM_MAP.get(itemId).name}** for **${economy.toCookieNumber(price)}** each.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_modal:')) {
        const [, actorId, targetId, action] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'give_cookies' || action === 'remove_cookies') {
          const amountRaw = interaction.fields.getTextInputValue('amount').trim();
          const amount = Number.parseInt(amountRaw, 10);
          if (!Number.isInteger(amount) || amount <= 0) {
            return interaction.reply({
              embeds: [embeds.error('Amount must be a positive integer.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const delta = action === 'remove_cookies' ? -amount : amount;
          economy.adminGiveCookies(interaction.guild.id, targetId, delta);
          await sendBakeAdminLog(interaction, targetId, action === 'remove_cookies' ? 'Remove Cookies' : 'Give Cookies', `${delta} cookies`);
          return interaction.reply({
            embeds: [embeds.success(`${delta >= 0 ? 'Gave' : 'Removed'} **${economy.toCookieNumber(Math.abs(delta))}** cookies ${delta >= 0 ? 'to' : 'from'} <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'give_item') {
          const itemId = resolveItemId(interaction.fields.getTextInputValue('itemId'));
          const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity').trim(), 10);
          if (!Number.isInteger(quantity) || quantity <= 0) {
            return interaction.reply({
              embeds: [embeds.error('Quantity must be a positive integer.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const ok = economy.adminGiveItem(interaction.guild.id, targetId, itemId, quantity);
          if (!ok) {
            return interaction.reply({
              embeds: [embeds.error('Invalid item. Use item ID or full item name.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          await sendBakeAdminLog(interaction, targetId, 'Give Item', `${itemId} x${quantity}`);
          return interaction.reply({
            embeds: [embeds.success(`Gave **${quantity}x ${economy.ITEM_MAP.get(itemId).name}** to <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'set_building') {
          const buildingId = resolveBuildingId(interaction.fields.getTextInputValue('buildingId'));
          const count = Number.parseInt(interaction.fields.getTextInputValue('count').trim(), 10);
          if (!Number.isInteger(count) || count < 0) {
            return interaction.reply({
              embeds: [embeds.error('Count must be a non-negative integer.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const ok = economy.adminSetBuilding(interaction.guild.id, targetId, buildingId, count);
          if (!ok) {
            return interaction.reply({
              embeds: [embeds.error('Invalid building. Use building ID or full building name.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          await sendBakeAdminLog(interaction, targetId, 'Set Building Count', `${buildingId}=${count}`);
          return interaction.reply({
            embeds: [embeds.success(`Set **${buildingId}** to **${count}** for <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'set_log_channel') {
          const channelId = parseMentionOrId(interaction.fields.getTextInputValue('value'), 'channel');
          if (!channelId || !interaction.guild.channels.cache.has(channelId)) {
            return interaction.reply({
              embeds: [embeds.error('Invalid channel. Use a channel mention like `#logs` or a channel ID.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          economy.setAdminLogChannel(interaction.guild.id, channelId);
          return interaction.reply({
            embeds: [embeds.success(`Set bake admin log channel to <#${channelId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'reset_user') {
          const confirm = interaction.fields.getTextInputValue('confirm').trim();
          if (confirm !== 'RESET') {
            return interaction.reply({
              embeds: [embeds.warning('Reset cancelled. Type `RESET` exactly next time.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          economy.adminResetUser(interaction.guild.id, targetId);
          await sendBakeAdminLog(interaction, targetId, 'Reset User', 'Full economy reset');
          return interaction.reply({
            embeds: [embeds.success(`Reset all baking data for <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    // ── Autocomplete ────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);

      if (
        REASON_AUTOCOMPLETE_COMMANDS.has(interaction.commandName) &&
        focused.name === 'reason' &&
        interaction.guildId
      ) {
        const presets = db.getPresetReasons(interaction.guildId, interaction.commandName);
        const query = focused.value.toLowerCase();
        const matches = presets
          .filter((r) => r.reason.toLowerCase().includes(query))
          .slice(0, 25)
          .map((r) => ({ name: r.reason.slice(0, 100), value: r.reason }));
        await interaction.respond(matches).catch(() => null);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      const missingCommandEmbed = embeds
        .error(
          'This command is no longer available. If it still appears, redeploy slash commands to clean stale registrations.',
          interaction.guild ?? null,
        )
        .addFields({
          name: '  Command',
          value: `\`/${interaction.commandName}\``,
          inline: true,
        });
      await interaction.reply({ embeds: [missingCommandEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error executing ${interaction.commandName}:`, err);

      const errorEmbed = embeds
        .error(
          'An unexpected error occurred while running this command. Please try again later.',
          interaction.guild ?? null,
        )
        .addFields(
          {
            name: '  Command',
            value: `\`/${interaction.commandName}\``,
            inline: true,
          },
          {
            name: '  Error Details',
            value: `\`${getErrorDetails(err)}\``,
          },
        );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  },
};
