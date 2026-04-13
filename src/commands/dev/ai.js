'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { randomBytes } = require('crypto');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const economy = require('../../utils/bakeEconomy');
const analytics = require('../../utils/analytics');
const { fetchLogChannel } = require('../../utils/logChannels');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const { sendModerationActionDm } = require('../../utils/moderationNotifications');
const { isDevUser } = require('../../utils/roles');

const NVIDIA_BUILD_AI_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const REQUEST_TIMEOUT_MS = 30000;
const WEB_SEARCH_TIMEOUT_MS = 10000;
const MCP_DOCS_TIMEOUT_MS = 12000;
const REQUEST_TEMPERATURE = 0.1;
const MAX_TOOL_ROUNDS = 6;
const MAX_FIELDS = 10;
const MAX_COMPONENT_ROWS = 5;
const AI_COMPONENT_TTL_MINUTES = 10;
const AI_COMPONENT_TTL_MS = AI_COMPONENT_TTL_MINUTES * 60 * 1000;
const MAX_STORED_CONVERSATIONS = 500;
const CONVERSATION_STALE_HOURS = 6;
const WEB_SEARCH_DEFAULT_LIMIT = 5;
const WEB_SEARCH_MAX_LIMIT = 8;
const WEB_SEARCH_MAX_FLATTENED_RESULTS = 20;
const MCP_DOCS_URL = 'https://docs.valleycorrectional.xyz/mcp';
const MCP_DOCS_SNIPPET_MAX_CHARS = 3000;
const MAX_CONTEXT_MESSAGES = 24;
const MAX_TOOL_LOG_LINES = 12;
const DEFAULT_EMBED_COLOR = 0x808080;
const MAX_BOT_SERVER_LIST = 50;
const MODERATION_CONFIRM_TTL_MS = 10 * 60 * 1000;

const AI_MODELS = Object.freeze([
  { displayName: 'Gemma 4 31B', value: 'google/gemma-4-31b-it' },
]);
const DEFAULT_MODEL = AI_MODELS[0].value;
const MODEL_DISPLAY_NAME_BY_VALUE = new Map(AI_MODELS.map((entry) => [entry.value, entry.displayName]));

const conversationStates = new Map();
const aiComponentStates = new Map();
const pendingModerationConfirmations = new Map();

function asString(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function truncate(text, max) {
  const normalized = asString(text, '').trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text ?? '';
      return '';
    })
    .join('\n')
    .trim();
}

function extractStructuredPayload(text) {
  const trimmed = asString(text, '').trim();
  if (!trimmed) return null;

  const direct = safeJsonParse(trimmed);
  if (direct && typeof direct === 'object') return direct;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    const parsed = safeJsonParse(fencedMatch[1]);
    if (parsed && typeof parsed === 'object') return parsed;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const maybe = safeJsonParse(trimmed.slice(firstBrace, lastBrace + 1));
    if (maybe && typeof maybe === 'object') return maybe;
  }

  return null;
}

function getModelDisplayName(model) {
  return MODEL_DISPLAY_NAME_BY_VALUE.get(model) ?? model;
}

function getNvidiaApiKey() {
  const value = asString(process.env.NVIDIA_API_KEY, '').trim();
  return value || '';
}

function pruneConversationStates(now = Date.now()) {
  const entries = [...conversationStates.entries()]
    .sort((a, b) => (a[1]?.updatedAt ?? 0) - (b[1]?.updatedAt ?? 0));
  if (entries.length > MAX_STORED_CONVERSATIONS) {
    const overflow = entries.length - MAX_STORED_CONVERSATIONS;
    for (const [messageId] of entries.slice(0, overflow)) {
      conversationStates.delete(messageId);
    }
  }
  const staleCutoff = now - (CONVERSATION_STALE_HOURS * 60 * 60 * 1000);
  for (const [messageId, state] of conversationStates.entries()) {
    if ((state?.updatedAt ?? 0) < staleCutoff) conversationStates.delete(messageId);
  }
}

function pruneComponentStates(now = Date.now()) {
  for (const [token, state] of aiComponentStates.entries()) {
    if ((state?.expiresAt ?? 0) <= now) aiComponentStates.delete(token);
  }
}

function pruneModerationConfirmations(now = Date.now()) {
  for (const [key, state] of pendingModerationConfirmations.entries()) {
    if ((state?.expiresAt ?? 0) <= now) pendingModerationConfirmations.delete(key);
  }
}

function parseDiscordId(value) {
  const match = asString(value, '').trim().match(/^(?:<@!?(\d+)>|(\d+))$/);
  return match?.[1] ?? match?.[2] ?? '';
}

function buildModerationConfirmationKey(guildId, moderatorId, token) {
  return `${guildId}:${moderatorId}:${token}`;
}

function formatAutoModRule(rule) {
  const actions = Array.isArray(rule?.actions) ? rule.actions : [];
  return {
    id: rule.id,
    name: rule.name,
    enabled: Boolean(rule.enabled),
    eventType: rule.eventType,
    triggerType: rule.triggerType,
    exemptRoles: [...(rule.exemptRoles ?? [])],
    exemptChannels: [...(rule.exemptChannels ?? [])],
    actions: actions.map((action) => ({
      type: action.type,
      channelId: action.metadata?.channel,
      durationSeconds: action.metadata?.durationSeconds ?? null,
      customMessage: action.metadata?.customMessage ?? null,
    })),
  };
}

async function sendAiModerationLog(guild, payload) {
  const logChannel = await fetchLogChannel(guild, 'automod');
  if (!logChannel) return false;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('AI Moderation Action')
    .setDescription(payload.description)
    .addFields(
      { name: 'Action', value: payload.action, inline: true },
      { name: 'Moderator', value: payload.moderator, inline: true },
      { name: 'Target', value: payload.target, inline: true },
      { name: 'Reason', value: payload.reason || 'No reason provided.' },
    )
    .setTimestamp()
    .setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  const sent = await logChannel.send({ embeds: [embed] }).catch(() => null);
  return Boolean(sent);
}

function normalizeColor(value, fallback = DEFAULT_EMBED_COLOR) {
  const colorValue = Number(value);
  if (Number.isInteger(colorValue) && colorValue >= 0 && colorValue <= 0xffffff) return colorValue;
  return fallback;
}

function normalizeHttpUrl(value, maxLength = 500) {
  const raw = truncate(value, maxLength);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeButton(button) {
  const label = truncate(button?.label, 80);
  if (!label) return null;

  const rawStyle = asString(button?.style, 'primary').toLowerCase();
  const style = ['primary', 'secondary', 'success', 'danger', 'link'].includes(rawStyle) ? rawStyle : 'primary';
  const prompt = truncate(button?.prompt, 1500);
  const url = style === 'link' ? truncate(button?.url, 500) : '';

  if (style === 'link') {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    } catch {
      return null;
    }
  }

  return {
    label,
    style,
    prompt: style === 'link' ? '' : (prompt || label),
    url,
    disabled: Boolean(button?.disabled),
  };
}

function normalizeSelectMenu(selectMenu) {
  const placeholder = truncate(selectMenu?.placeholder, 150) || 'Choose an option';
  const rawOptions = Array.isArray(selectMenu?.options) ? selectMenu.options : [];
  const options = [];
  const seenValues = new Set();

  for (const [index, option] of rawOptions.entries()) {
    if (options.length >= 25) break;
    const label = truncate(option?.label, 100);
    if (!label) continue;
    const value = truncate(option?.value, 100) || `opt_${index + 1}`;
    if (seenValues.has(value)) continue;
    seenValues.add(value);
    const description = truncate(option?.description, 100);
    const prompt = truncate(option?.prompt, 1500) || label;
    options.push({
      label,
      value,
      description,
      prompt,
      default: Boolean(option?.default),
    });
  }

  if (!options.length) return null;

  const parsedMinValues = Number(selectMenu?.min_values);
  const parsedMaxValues = Number(selectMenu?.max_values);
  const requestedMinValues = Number.isFinite(parsedMinValues) ? parsedMinValues : 1;
  const requestedMaxValues = Number.isFinite(parsedMaxValues) ? parsedMaxValues : 1;
  const minValues = Math.min(options.length, Math.max(1, requestedMinValues));
  const maxValues = Math.min(options.length, Math.max(minValues, requestedMaxValues));

  return {
    placeholder,
    minValues,
    maxValues,
    options,
  };
}

function normalizePayload(payload, fallbackText) {
  const title = truncate(payload?.title, 256) || 'AI Response';
  const text = truncate(payload?.text, 4096)
    || truncate(payload?.summary, 4096)
    || truncate(fallbackText, 4096)
    || 'No response.';
  const answer = truncate(payload?.answer, 1024);
  const footer = truncate(payload?.footer, 2048);
  const color = normalizeColor(payload?.color);
  const thumbnail = normalizeHttpUrl(payload?.thumbnail_url ?? payload?.thumbnail?.url ?? payload?.thumbnail, 500);

  const fields = [];
  const rawFields = Array.isArray(payload?.fields) ? payload.fields : [];
  for (const field of rawFields) {
    if (fields.length >= MAX_FIELDS) break;
    const fieldName = truncate(field?.name, 256);
    const fieldValue = truncate(field?.value, 1024);
    if (!fieldName || !fieldValue) continue;

    const normalizedFieldButtons = Array.isArray(field?.buttons)
      ? field.buttons.map(normalizeButton).filter(Boolean).slice(0, 5)
      : [];
    const normalizedFieldSelects = Array.isArray(field?.select_menus)
      ? field.select_menus.map(normalizeSelectMenu).filter(Boolean).slice(0, 2)
      : [];

    fields.push({
      name: fieldName,
      value: fieldValue,
      inline: Boolean(field?.inline),
      buttons: normalizedFieldButtons,
      selectMenus: normalizedFieldSelects,
    });
  }

  const topButtons = Array.isArray(payload?.buttons)
    ? payload.buttons.map(normalizeButton).filter(Boolean).slice(0, 20)
    : [];
  const topSelectMenus = Array.isArray(payload?.select_menus)
    ? payload.select_menus.map(normalizeSelectMenu).filter(Boolean).slice(0, 5)
    : [];

  return {
    title,
    text,
    answer,
    footer,
    color,
    thumbnail,
    fields,
    buttons: topButtons,
    selectMenus: topSelectMenus,
  };
}

function buildToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'get_server_overview',
        description: 'Get high-level stats and metadata for the current Discord server.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_vcf_mcp_docs',
        description: 'Fetch Valley Correctional MCP docs and return relevant snippets.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional keyword query used to filter docs lines.',
            },
            max_chars: {
              type: 'integer',
              minimum: 300,
              maximum: 3000,
              description: 'Maximum characters to return in docs snippet output.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for up-to-date public information and return concise result snippets.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 8,
              description: 'Maximum number of web results/snippets to return.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_server_features',
        description: 'Get enabled server features and locale settings.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_current_channel',
        description: 'Get metadata for the current channel where the AI request was made.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_channels',
        description: 'List channels in this server, optionally filtered by type.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['all', 'text', 'voice', 'forum', 'announcement', 'category'],
              description: 'Channel type filter.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum number of channels to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_channel_details',
        description: 'Get details for a specific channel by channel ID.',
        parameters: {
          type: 'object',
          properties: {
            channel_id: { type: 'string', description: 'Discord channel ID.' },
          },
          required: ['channel_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_roles',
        description: 'List server roles by highest position first.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum number of roles to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_role_details',
        description: 'Get details for a role by role ID.',
        parameters: {
          type: 'object',
          properties: {
            role_id: { type: 'string', description: 'Discord role ID.' },
          },
          required: ['role_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'find_member',
        description: 'Find members by username, tag, nickname, or ID.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search term for username, display name, tag, or ID.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              description: 'Maximum number of members to return.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_members',
        description: 'List server members, optionally filtered to members with a specific role ID.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 25,
              description: 'Maximum number of members to return.',
            },
            role_id: {
              type: 'string',
              description: 'Optional role ID to filter members who have this role.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_member_details',
        description: 'Get details for a specific member by user ID.',
        parameters: {
          type: 'object',
          properties: {
            member_id: { type: 'string', description: 'Discord user ID of the member.' },
          },
          required: ['member_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_emojis',
        description: 'List custom server emojis with metadata.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum number of emojis to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_user_profile_summary',
        description: 'Get profile details for a specific server member including moderation and bakery stats.',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID or mention for the target member.' },
          },
          required: ['user_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_user_bakery_summary',
        description: 'Get bakery-specific stats for a specific user in this server.',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID or mention for the target member.' },
          },
          required: ['user_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_bot_servers',
        description: 'List Discord servers the bot is currently in (name, id, member count).',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_BOT_SERVER_LIST,
              description: 'Maximum number of servers to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_discord_automod_rules',
        description: 'List native Discord AutoMod rules currently configured for this server.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'configure_discord_automod',
        description: 'Create or update native Discord AutoMod rules in this server.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create_keyword_preset_rule', 'create_mention_spam_rule', 'toggle_rule'],
            },
            rule_name: { type: 'string', description: 'Rule name for new rules.' },
            preset: {
              type: 'string',
              enum: ['profanity', 'sexual_content', 'slurs'],
              description: 'Preset for keyword preset rules.',
            },
            mention_limit: {
              type: 'integer',
              minimum: 3,
              maximum: 50,
              description: 'Mention limit for mention spam rule.',
            },
            log_channel_id: {
              type: 'string',
              description: 'Optional text channel ID for AutoMod alert actions.',
            },
            custom_message: {
              type: 'string',
              description: 'Optional custom message sent to users when blocked.',
            },
            rule_id: { type: 'string', description: 'Rule ID for toggle action.' },
            enabled: { type: 'boolean', description: 'Enabled state for toggle action.' },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'prepare_moderation_action',
        description: 'Prepare a moderation action and return a confirmation token. This does NOT execute moderation.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['warn', 'timeout', 'kick', 'ban'] },
            user_id: { type: 'string', description: 'Target user ID or mention.' },
            reason: { type: 'string', description: 'Moderation reason.' },
            timeout_minutes: {
              type: 'integer',
              minimum: 1,
              maximum: 40320,
              description: 'Required for timeout actions. Max 28 days.',
            },
            delete_days: {
              type: 'integer',
              minimum: 0,
              maximum: 7,
              description: 'Optional for ban actions.',
            },
          },
          required: ['action', 'user_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'confirm_moderation_action',
        description: 'Execute a previously prepared moderation action after explicit user confirmation phrase is present.',
        parameters: {
          type: 'object',
          properties: {
            confirmation_token: { type: 'string', description: 'Token returned by prepare_moderation_action.' },
          },
          required: ['confirmation_token'],
          additionalProperties: false,
        },
      },
    },
  ];
}

function formatChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    name: channel.name ?? channel.id,
    type: ChannelType[channel.type] ?? String(channel.type),
    parentId: channel.parentId ?? null,
    position: Number.isFinite(channel.position) ? channel.position : null,
    nsfw: Boolean(channel.nsfw),
    topic: truncate(channel.topic, 300),
  };
}

function formatMember(member) {
  if (!member) return null;
  const topRoles = [...member.roles.cache.values()]
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .slice(0, 8)
    .map((role) => ({ id: role.id, name: role.name }));

  return {
    id: member.id,
    username: member.user.username,
    tag: member.user.tag,
    displayName: member.displayName,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.user.createdAt?.toISOString() ?? null,
    bot: member.user.bot,
    roles: topRoles,
  };
}

function flattenDuckDuckGoRelatedTopics(topics = [], results = []) {
  for (const topic of topics) {
    if (results.length >= WEB_SEARCH_MAX_FLATTENED_RESULTS) break;
    if (Array.isArray(topic?.Topics)) {
      flattenDuckDuckGoRelatedTopics(topic.Topics, results);
      continue;
    }
    const text = truncate(topic?.Text, 280);
    if (!text) continue;
    const url = asString(topic?.FirstURL, '').trim();
    results.push({ text, url });
  }
  return results;
}

async function runWebSearch(query, limit = WEB_SEARCH_DEFAULT_LIMIT) {
  const normalizedQuery = asString(query, '').trim();
  if (!normalizedQuery) return { ok: false, error: 'query is required.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);
  try {
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', normalizedQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `Web search failed with status ${response.status}.` };
    }

    const data = await response.json();
    const snippets = [];

    const abstractText = truncate(data?.AbstractText, 300);
    const abstractUrl = asString(data?.AbstractURL, '').trim();
    if (abstractText) snippets.push({ text: abstractText, url: abstractUrl });

    const related = flattenDuckDuckGoRelatedTopics(data?.RelatedTopics ?? []);
    for (const item of related) {
      if (snippets.length >= limit) break;
      snippets.push(item);
    }

    return {
      ok: true,
      query: normalizedQuery,
      heading: truncate(data?.Heading, 120),
      snippets: snippets.slice(0, limit),
      source: 'DuckDuckGo Instant Answer API',
    };
  } catch (error) {
    return {
      ok: false,
      error: `Web search request failed: ${truncate(error.message, 300)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtmlToText(html) {
  return asString(html, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runMcpDocsTool(query, maxChars) {
  const limit = Math.min(
    MCP_DOCS_SNIPPET_MAX_CHARS,
    Math.max(300, Number(maxChars) || 1200),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_DOCS_TIMEOUT_MS);
  try {
    const response = await fetch(MCP_DOCS_URL, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `MCP docs request failed with status ${response.status}.` };
    }

    const html = await response.text();
    const plainText = stripHtmlToText(html);
    if (!plainText) return { ok: false, error: 'MCP docs response was empty.' };

    const lines = plainText
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const normalizedQuery = asString(query, '').trim().toLowerCase();
    const relevant = normalizedQuery
      ? lines.filter((line) => line.toLowerCase().includes(normalizedQuery))
      : lines;

    const selectedLines = (relevant.length > 0 ? relevant : lines).slice(0, 25);
    const snippet = truncate(selectedLines.join('\n'), limit);

    return {
      ok: true,
      source: MCP_DOCS_URL,
      query: normalizedQuery || null,
      snippet,
      matchedLines: relevant.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: `MCP docs request failed: ${truncate(error.message, 300)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runTool(context, name, args) {
  const guild = context.guild;
  const parsedArgs = typeof args === 'string' ? safeJsonParse(args) ?? {} : args ?? {};

  if (name === 'get_vcf_mcp_docs') {
    return runMcpDocsTool(parsedArgs.query, parsedArgs.max_chars);
  }

  if (name === 'search_web') {
    const limit = Math.min(WEB_SEARCH_MAX_LIMIT, Math.max(1, Number(parsedArgs.limit) || WEB_SEARCH_DEFAULT_LIMIT));
    return runWebSearch(parsedArgs.query, limit);
  }

  if (!guild) {
    return { ok: false, error: 'Guild context is required for this tool.' };
  }

  if (name === 'get_server_overview') {
    return {
      ok: true,
      server: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        roleCount: guild.roles.cache.size,
        channelCount: guild.channels.cache.size,
        emojiCount: guild.emojis.cache.size,
        verificationLevel: guild.verificationLevel,
        nsfwLevel: guild.nsfwLevel,
        boostLevel: guild.premiumTier,
      },
    };
  }

  if (name === 'get_server_features') {
    return {
      ok: true,
      features: [...(guild.features ?? [])],
      preferredLocale: guild.preferredLocale ?? null,
      explicitContentFilter: guild.explicitContentFilter ?? null,
      mfaLevel: guild.mfaLevel ?? null,
    };
  }

  if (name === 'get_current_channel') {
    return {
      ok: true,
      channel: formatChannel(context.channel),
    };
  }

  if (name === 'list_channels') {
    const wantedType = asString(parsedArgs.type, 'all').toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(parsedArgs.limit) || 15));

    let channels = [...guild.channels.cache.values()].sort((a, b) => a.position - b.position);
    channels = channels.filter((channel) => {
      switch (wantedType) {
        case 'text':
          return channel.type === ChannelType.GuildText;
        case 'voice':
          return channel.type === ChannelType.GuildVoice;
        case 'forum':
          return channel.type === ChannelType.GuildForum;
        case 'announcement':
          return channel.type === ChannelType.GuildAnnouncement;
        case 'category':
          return channel.type === ChannelType.GuildCategory;
        default:
          return true;
      }
    });

    return {
      ok: true,
      filter: wantedType,
      channels: channels.slice(0, limit).map(formatChannel),
      totalMatching: channels.length,
    };
  }

  if (name === 'get_channel_details') {
    const channelId = asString(parsedArgs.channel_id, '').trim();
    if (!channelId) return { ok: false, error: 'channel_id is required.' };
    const channel = guild.channels.cache.get(channelId) ?? null;
    if (!channel) return { ok: false, error: 'Channel not found.' };
    return { ok: true, channel: formatChannel(channel) };
  }

  if (name === 'list_roles') {
    const limit = Math.min(50, Math.max(1, Number(parsedArgs.limit) || 15));
    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, limit);

    return {
      ok: true,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        memberCount: role.members.size,
        mentionable: role.mentionable,
      })),
      totalRoles: guild.roles.cache.size - 1,
    };
  }

  if (name === 'get_role_details') {
    const roleId = asString(parsedArgs.role_id, '').trim();
    if (!roleId) return { ok: false, error: 'role_id is required.' };
    const role = guild.roles.cache.get(roleId) ?? null;
    if (!role || role.id === guild.id) return { ok: false, error: 'Role not found.' };
    return {
      ok: true,
      role: {
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        memberCount: role.members.size,
        mentionable: role.mentionable,
        managed: role.managed,
      },
    };
  }

  if (name === 'find_member') {
    const query = asString(parsedArgs.query, '').trim().toLowerCase();
    const limit = Math.min(20, Math.max(1, Number(parsedArgs.limit) || 8));
    if (!query) return { ok: false, error: 'query is required.' };

    const results = [...guild.members.cache.values()]
      .filter((member) => {
        const username = member.user.username.toLowerCase();
        const tag = member.user.tag.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        return (
          member.id.includes(query)
          || username.includes(query)
          || tag.includes(query)
          || displayName.includes(query)
        );
      })
      .slice(0, limit)
      .map(formatMember);

    return {
      ok: true,
      query,
      results,
      totalReturned: results.length,
    };
  }

  if (name === 'list_members') {
    const limit = Math.min(25, Math.max(1, Number(parsedArgs.limit) || 10));
    const roleId = asString(parsedArgs.role_id, '').trim();
    let members = [...guild.members.cache.values()];
    if (roleId) {
      members = members.filter((member) => member.roles.cache.has(roleId));
    }
    const selected = members
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, limit)
      .map(formatMember);

    return {
      ok: true,
      roleFilter: roleId || null,
      members: selected,
      totalMatching: members.length,
    };
  }

  if (name === 'get_member_details') {
    const memberId = asString(parsedArgs.member_id, '').trim();
    if (!memberId) return { ok: false, error: 'member_id is required.' };
    const member = guild.members.cache.get(memberId) ?? null;
    if (!member) return { ok: false, error: 'Member not found in this guild.' };
    return {
      ok: true,
      member: formatMember(member),
    };
  }

  if (name === 'list_emojis') {
    const limit = Math.min(50, Math.max(1, Number(parsedArgs.limit) || 20));
    const emojis = [...guild.emojis.cache.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        available: emoji.available,
      }));

    return {
      ok: true,
      emojis,
      totalEmojis: guild.emojis.cache.size,
    };
  }

  if (name === 'get_user_profile_summary') {
    const userId = parseDiscordId(parsedArgs.user_id);
    if (!userId) return { ok: false, error: 'user_id is required.' };
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, error: 'Member not found in this guild.' };
    const warnings = db.getWarnings(guild.id, userId);
    const activeShift = (() => {
      try {
        return db.getActiveShift(guild.id, userId);
      } catch {
        return null;
      }
    })();
    const snapshot = economy.getUserSnapshot(guild.id, userId);
    const cps = economy.computeCps(snapshot.user, Date.now());
    return {
      ok: true,
      member: formatMember(member),
      moderation: {
        warningCount: warnings.length,
        latestWarning: warnings[warnings.length - 1] ?? null,
      },
      shift: {
        onShift: Boolean(activeShift),
        activeShiftId: activeShift?.id ?? null,
        startedAt: activeShift?.startedAt ?? null,
      },
      bakery: {
        bakeryName: snapshot.user.bakeryName ?? 'My Bakery',
        bakeryEmoji: snapshot.user.bakeryEmoji ?? economy.getCookieEmoji(guild),
        cookies: snapshot.user.cookies ?? 0,
        cps,
        achievements: (snapshot.user.milestones ?? []).length,
      },
    };
  }

  if (name === 'get_user_bakery_summary') {
    const userId = parseDiscordId(parsedArgs.user_id);
    if (!userId) return { ok: false, error: 'user_id is required.' };
    const snapshot = economy.getUserSnapshot(guild.id, userId);
    const user = snapshot.user;
    const rarestItemId = Object.entries(user.inventory ?? {})
      .filter(([, qty]) => qty > 0)
      .sort((a, b) => {
        const rarityDiff = economy.RARITY_ORDER.indexOf(economy.ITEM_MAP.get(b[0])?.rarity ?? 'common')
          - economy.RARITY_ORDER.indexOf(economy.ITEM_MAP.get(a[0])?.rarity ?? 'common');
        return rarityDiff || (b[1] - a[1]);
      })[0]?.[0] ?? null;
    return {
      ok: true,
      bakery: {
        userId,
        bakeryName: user.bakeryName ?? 'My Bakery',
        bakeryEmoji: user.bakeryEmoji ?? economy.getCookieEmoji(guild),
        rankId: user.rankId ?? 'rookie',
        cookies: user.cookies ?? 0,
        cps: economy.computeCps(user, Date.now()),
        achievements: (user.milestones ?? []).length,
        totalBuildings: Object.values(user.buildings ?? {}).reduce((sum, count) => sum + (Number(count) || 0), 0),
        rarestItem: rarestItemId
          ? {
            id: rarestItemId,
            name: economy.ITEM_MAP.get(rarestItemId)?.name ?? rarestItemId,
            rarity: economy.ITEM_MAP.get(rarestItemId)?.rarity ?? 'common',
          }
          : null,
      },
    };
  }

  if (name === 'list_bot_servers') {
    const client = context.client;
    if (!client) return { ok: false, error: 'Client context is unavailable.' };
    const limit = Math.min(MAX_BOT_SERVER_LIST, Math.max(1, Number(parsedArgs.limit) || 20));
    const guilds = [...client.guilds.cache.values()]
      .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        memberCount: entry.memberCount ?? null,
      }));
    return {
      ok: true,
      servers: guilds,
      totalServers: client.guilds.cache.size,
    };
  }

  if (name === 'list_discord_automod_rules') {
    const rules = await guild.autoModerationRules.fetch().catch(() => null);
    if (!rules) return { ok: false, error: 'Failed to fetch native Discord AutoMod rules.' };
    const all = [...rules.values()].map(formatAutoModRule);
    return {
      ok: true,
      rules: all,
      totalRules: all.length,
    };
  }

  if (name === 'configure_discord_automod') {
    const actorMember = await guild.members.fetch(context.user.id).catch(() => null);
    if (!actorMember || !hasModLevel(actorMember, guild.id, MOD_LEVEL.seniorMod)) {
      return { ok: false, error: 'You need Senior Moderator access to configure Discord AutoMod.' };
    }

    const action = asString(parsedArgs.action, '').trim();
    const logChannelId = parseDiscordId(parsedArgs.log_channel_id);
    const customMessage = truncate(parsedArgs.custom_message, 150);
    let actionPayloads = [{ type: AutoModerationActionType.BlockMessage }];

    if (logChannelId) {
      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) {
        return { ok: false, error: 'log_channel_id is not a valid text channel.' };
      }
      actionPayloads = [
        ...actionPayloads,
        { type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannel.id } },
      ];
    }
    if (customMessage) {
      actionPayloads = actionPayloads.map((entry) => (
        entry.type === AutoModerationActionType.BlockMessage
          ? { ...entry, metadata: { customMessage } }
          : entry
      ));
    }

    if (action === 'create_keyword_preset_rule') {
      const presetName = asString(parsedArgs.preset, '').trim();
      const presetValue = {
        profanity: 1,
        sexual_content: 2,
        slurs: 3,
      }[presetName];
      if (!presetValue) return { ok: false, error: 'preset is required (profanity, sexual_content, or slurs).' };
      const ruleName = truncate(parsedArgs.rule_name, 100) || `AI AutoMod Preset (${presetName})`;
      const rule = await guild.autoModerationRules.create({
        name: ruleName,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.KeywordPreset,
        triggerMetadata: { presets: [presetValue], allowList: [] },
        actions: actionPayloads,
        enabled: true,
        reason: `${context.user.tag}: AI tool Discord AutoMod setup`,
      }).catch((error) => ({ error }));
      if (rule?.error) return { ok: false, error: `Failed to create rule: ${truncate(rule.error.message, 250)}` };
      return { ok: true, action, rule: formatAutoModRule(rule) };
    }

    if (action === 'create_mention_spam_rule') {
      const mentionLimit = Math.min(50, Math.max(3, Number(parsedArgs.mention_limit) || 5));
      const ruleName = truncate(parsedArgs.rule_name, 100) || `AI Mention Spam (${mentionLimit})`;
      const rule = await guild.autoModerationRules.create({
        name: ruleName,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.MentionSpam,
        triggerMetadata: { mentionTotalLimit: mentionLimit },
        actions: actionPayloads,
        enabled: true,
        reason: `${context.user.tag}: AI tool Discord AutoMod setup`,
      }).catch((error) => ({ error }));
      if (rule?.error) return { ok: false, error: `Failed to create rule: ${truncate(rule.error.message, 250)}` };
      return { ok: true, action, rule: formatAutoModRule(rule) };
    }

    if (action === 'toggle_rule') {
      const ruleId = parseDiscordId(parsedArgs.rule_id);
      if (!ruleId) return { ok: false, error: 'rule_id is required for toggle_rule.' };
      const enabled = Boolean(parsedArgs.enabled);
      const rules = await guild.autoModerationRules.fetch().catch(() => null);
      const existing = rules?.get(ruleId) ?? null;
      if (!existing) return { ok: false, error: 'Rule not found.' };
      const updated = await existing.edit({
        enabled,
        reason: `${context.user.tag}: AI tool Discord AutoMod toggle`,
      }).catch((error) => ({ error }));
      if (updated?.error) return { ok: false, error: `Failed to update rule: ${truncate(updated.error.message, 250)}` };
      return { ok: true, action, rule: formatAutoModRule(updated) };
    }

    return { ok: false, error: 'Unknown configure_discord_automod action.' };
  }

  if (name === 'prepare_moderation_action') {
    const actorMember = await guild.members.fetch(context.user.id).catch(() => null);
    if (!actorMember || !hasModLevel(actorMember, guild.id, MOD_LEVEL.moderator)) {
      return { ok: false, error: 'You need Moderator access to prepare moderation actions.' };
    }
    const action = asString(parsedArgs.action, '').trim();
    if (!['warn', 'timeout', 'kick', 'ban'].includes(action)) {
      return { ok: false, error: 'action must be one of warn, timeout, kick, or ban.' };
    }
    if (action === 'ban' && !hasModLevel(actorMember, guild.id, MOD_LEVEL.seniorMod)) {
      return { ok: false, error: 'You need Senior Moderator access to prepare ban actions.' };
    }
    const targetId = parseDiscordId(parsedArgs.user_id);
    if (!targetId) return { ok: false, error: 'user_id is required.' };
    if (targetId === context.user.id) return { ok: false, error: 'You cannot moderate yourself.' };
    const reason = truncate(parsedArgs.reason, 300) || 'No reason provided.';
    const timeoutMinutesRaw = Number(parsedArgs.timeout_minutes);
    if (action === 'timeout' && (!Number.isFinite(timeoutMinutesRaw) || timeoutMinutesRaw <= 0)) {
      return { ok: false, error: 'timeout_minutes is required for timeout actions.' };
    }
    const timeoutMinutes = action === 'timeout'
      ? Math.min(40320, Math.max(1, Math.floor(timeoutMinutesRaw)))
      : null;
    const deleteDays = Math.min(7, Math.max(0, Number(parsedArgs.delete_days) || 0));
    const confirmationToken = randomBytes(3).toString('hex').toLowerCase();
    const key = buildModerationConfirmationKey(guild.id, context.user.id, confirmationToken);
    pendingModerationConfirmations.set(key, {
      action,
      targetId,
      reason,
      timeoutMinutes: action === 'timeout' ? timeoutMinutes : null,
      deleteDays: action === 'ban' ? deleteDays : 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + MODERATION_CONFIRM_TTL_MS,
    });
    pruneModerationConfirmations();
    return {
      ok: true,
      prepared: true,
      action,
      targetId,
      reason,
      confirmationToken,
      confirmationPhrase: `CONFIRM MODERATION ${confirmationToken}`,
      expiresInMinutes: Math.round(MODERATION_CONFIRM_TTL_MS / 60_000),
      note: 'Do not execute moderation until the user sends the exact confirmation phrase.',
    };
  }

  if (name === 'confirm_moderation_action') {
    pruneModerationConfirmations();
    const confirmationToken = asString(parsedArgs.confirmation_token, '').trim();
    const normalizedToken = confirmationToken.toLowerCase();
    if (!normalizedToken) return { ok: false, error: 'confirmation_token is required.' };
    const key = buildModerationConfirmationKey(guild.id, context.user.id, normalizedToken);
    const pending = pendingModerationConfirmations.get(key);
    if (!pending) return { ok: false, error: 'No pending moderation action found for that token.' };
    const expectedPhrase = `confirm moderation ${normalizedToken}`;
    const latestPrompt = asString(context.latestPrompt, '').trim().toLowerCase();
    if (latestPrompt !== expectedPhrase) {
      return {
        ok: false,
        error: `Confirmation phrase mismatch. Send exactly: "CONFIRM MODERATION ${normalizedToken.toUpperCase()}".`,
      };
    }

    const target = await guild.members.fetch(pending.targetId).catch(() => null);
    if (!target && pending.action !== 'ban') {
      pendingModerationConfirmations.delete(key);
      return { ok: false, error: 'Target member not found in this guild.' };
    }

    try {
      if (pending.action === 'warn') {
        db.addWarning(guild.id, pending.targetId, {
          moderatorId: context.user.id,
          reason: pending.reason,
        });
        await sendModerationActionDm({
          user: target.user,
          guild,
          action: 'Warning',
          reason: pending.reason,
          moderatorTag: context.user.tag,
        });
        analytics.recordModAction(guild.id, 'warn', Date.now());
      }

      if (pending.action === 'timeout') {
        if (!target?.moderatable) {
          return { ok: false, error: 'I cannot timeout that user due to role hierarchy/permissions.' };
        }
        await sendModerationActionDm({
          user: target.user,
          guild,
          action: 'Timeout',
          reason: pending.reason,
          moderatorTag: context.user.tag,
          duration: `${pending.timeoutMinutes} minute(s)`,
        });
        await target.timeout(pending.timeoutMinutes * 60_000, `${context.user.tag}: ${pending.reason}`);
      }

      if (pending.action === 'kick') {
        if (!target?.kickable) {
          return { ok: false, error: 'I cannot kick that user due to role hierarchy/permissions.' };
        }
        await sendModerationActionDm({
          user: target.user,
          guild,
          action: 'Kick',
          reason: pending.reason,
          moderatorTag: context.user.tag,
        });
        await target.kick(`${context.user.tag}: ${pending.reason}`);
        analytics.recordModAction(guild.id, 'kick', Date.now());
      }

      if (pending.action === 'ban') {
        const banTarget = target?.user ?? pending.targetId;
        // Fetch only when target is no longer a guild member so we can still attempt a DM.
        const banDmUser = target?.user ?? await context.client.users.fetch(pending.targetId).catch(() => null);
        // DM delivery may fail (privacy settings/blocks); moderation still proceeds and logs internally.
        await sendModerationActionDm({
          user: banDmUser,
          guild,
          action: 'Ban',
          reason: pending.reason,
          moderatorTag: context.user.tag,
        });
        await guild.members.ban(banTarget, {
          reason: `${context.user.tag}: ${pending.reason}`,
          deleteMessageSeconds: pending.deleteDays * 86400,
        });
        analytics.recordModAction(guild.id, 'ban', Date.now());
      }

      await sendAiModerationLog(guild, {
        description: 'A moderation action was executed through the `/ai` confirmation workflow.',
        action: pending.action.toUpperCase(),
        moderator: `${context.user.tag} (\`${context.user.id}\`)`,
        target: `<@${pending.targetId}> (\`${pending.targetId}\`)`,
        reason: pending.reason,
      });
      pendingModerationConfirmations.delete(key);
      return {
        ok: true,
        executed: true,
        action: pending.action,
        targetId: pending.targetId,
        reason: pending.reason,
      };
    } catch (error) {
      return { ok: false, error: `Moderation execution failed: ${truncate(error.message, 250)}` };
    }
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

async function requestNvidiaBuildAiChat({ apiKey, model, messages, tools }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${NVIDIA_BUILD_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: REQUEST_TEMPERATURE,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`NVIDIA Build AI API ${response.status} (${model}): ${truncate(body, 400)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt(model) {
  return [
    'You are an assistant for a Discord moderation/community server.',
    'Use tools when needed to inspect server context.',
    'Safety rules:',
    '- Never claim a moderation action has been executed unless confirm_moderation_action succeeds.',
    '- Never request, expose, or infer secrets/tokens/credentials.',
    '- You may use server tools, moderation tools, and Discord AutoMod tools only as defined.',
    '- For moderation actions, always call prepare_moderation_action first.',
    '- After prepare_moderation_action returns a token, instruct the user to send EXACTLY: CONFIRM MODERATION <token>.',
    '- Only call confirm_moderation_action when the user message exactly matches that phrase.',
    '- Refuse harmful, abusive, illegal, or privacy-invasive requests.',
    '- Keep responses professional and concise.',
    '- Keep formatting consistent between runs.',
    '- Use search_web only for general public info and cite uncertainty when needed.',
    '- Use get_vcf_mcp_docs for Valley Correctional MCP docs lookups.',
    '',
    `Model display name: ${getModelDisplayName(model)}.`,
    'Return ONLY valid JSON with this structure:',
    '{',
    '  "title": "short title",',
    '  "text": "short embed description",',
    '  "answer": "main answer text",',
    '  "fields": [',
    '    {',
    '      "name": "field name",',
    '      "value": "field value",',
    '      "inline": false,',
    '      "buttons": [',
    '        {"label":"button text","style":"primary|secondary|success|danger|link","prompt":"follow-up prompt","url":"https://example.com"}',
    '      ],',
    '      "select_menus": [',
    '        {"placeholder":"Choose option","options":[{"label":"Option A","value":"a","description":"Optional","prompt":"follow-up prompt"}]}',
    '      ]',
    '    }',
    '  ],',
    '  "buttons": [',
    '    {"label":"button text","style":"primary|secondary|success|danger|link","prompt":"follow-up prompt","url":"https://example.com"}',
    '  ],',
    '  "select_menus": [',
    '    {"placeholder":"Choose option","options":[{"label":"Option A","value":"a","description":"Optional","prompt":"follow-up prompt"}]}',
    '  ],',
    '  "thumbnail_url": "https://example.com/image.png",',
    '  "footer": "short footer",',
    '  "color": 8421504',
    '}',
    'Guidance for consistency:',
    '- Keep title and text stable and clear across runs.',
    '- Use color 8421504 (grey) when no specific color is needed.',
    '- Use answer for main output and fields for structured detail.',
    '- Add buttons/select menus only when they provide clear next steps.',
  ].join('\n');
}

function trimMessagesForContext(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const systemMessage = messages.find((msg) => msg?.role === 'system') ?? null;
  const nonSystem = messages.filter((msg) => msg?.role !== 'system').slice(-MAX_CONTEXT_MESSAGES);
  return systemMessage ? [systemMessage, ...nonSystem] : nonSystem;
}

async function runAiCompletion({
  apiKey,
  model,
  context,
  prompt,
  priorMessages = [],
}) {
  const tools = buildToolDefinitions();
  const messages = priorMessages.length
    ? [...priorMessages]
    : [{ role: 'system', content: buildSystemPrompt(model) }];

  if (!messages.some((msg) => msg?.role === 'system')) {
    messages.unshift({ role: 'system', content: buildSystemPrompt(model) });
  }

  messages.push({ role: 'user', content: prompt });

  let rawFinalText = '';
  let structured = null;
  const toolUsage = [];
  let roundsUsed = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let hasTotalTokensFromApi = false;

  for (let i = 0; i < MAX_TOOL_ROUNDS; i += 1) {
    const data = await requestNvidiaBuildAiChat({
      apiKey,
      model,
      messages,
      tools,
    });
    roundsUsed = i + 1;

    const usage = data?.usage ?? {};
    const promptDelta = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    const completionDelta = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
    const hasTotalFromUsage = usage?.total_tokens != null;
    const totalDelta = Number(usage.total_tokens);
    if (Number.isFinite(promptDelta) && promptDelta > 0) promptTokens += promptDelta;
    if (Number.isFinite(completionDelta) && completionDelta > 0) completionTokens += completionDelta;
    if (hasTotalFromUsage && Number.isFinite(totalDelta) && totalDelta >= 0) {
      hasTotalTokensFromApi = true;
      totalTokens += totalDelta;
    }

    const choice = data?.choices?.[0]?.message;
    if (!choice) throw new Error(`No response choices were returned by the AI provider (${model}).`);

    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: choice.content ?? '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const toolName = call?.function?.name;
        const toolArgs = call?.function?.arguments ?? '{}';
        const result = await runTool(context, toolName, toolArgs);
        toolUsage.push({
          name: asString(toolName, 'unknown_tool'),
          args: truncate(asString(toolArgs, '{}'), 220),
          ok: result?.ok !== false,
          error: truncate(asString(result?.error, ''), 160),
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    rawFinalText = extractTextContent(choice.content);
    structured = extractStructuredPayload(rawFinalText);
    messages.push({ role: 'assistant', content: rawFinalText || choice.content || '' });
    break;
  }

  if (!hasTotalTokensFromApi && (promptTokens || completionTokens)) {
    totalTokens = promptTokens + completionTokens;
  }

  return {
    rawFinalText,
    structured,
    toolUsage,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
    roundsUsed,
    messages: trimMessagesForContext(messages),
  };
}

function createAiEmbed(guild, payload, modelDisplayName) {
  const embed = new EmbedBuilder()
    .setColor(payload.color)
    .setTitle(payload.title)
    .setDescription(payload.text)
    .setTimestamp()
    .setFooter({
      text: payload.footer || `${guild?.name ?? 'Server'} · ${modelDisplayName}`,
      iconURL: guild?.iconURL({ dynamic: true }) ?? undefined,
    });

  if (payload.thumbnail) {
    embed.setThumbnail(payload.thumbnail);
  }

  if (payload.answer) {
    embed.addFields({
      name: 'Answer',
      value: payload.answer,
    });
  }

  for (const field of payload.fields) {
    embed.addFields({
      name: field.name,
      value: field.value,
      inline: field.inline,
    });
  }

  return embed;
}

function formatToolUsageLines(toolUsage) {
  const entries = Array.isArray(toolUsage) ? toolUsage : [];
  if (!entries.length) return ['No tools were used in this response.'];
  return entries
    .slice(-MAX_TOOL_LOG_LINES)
    .map((entry, index) => {
      const status = entry.ok ? '✅' : '❌';
      const args = entry.args ? ` · args: \`${truncate(entry.args, 120)}\`` : '';
      const err = entry.ok ? '' : ` · ${truncate(entry.error, 90)}`;
      return `${index + 1}. ${status} \`${entry.name}\`${args}${err}`;
    });
}

function createAiToolsEmbed(guild, modelDisplayName, toolUsage, details = {}) {
  const lines = formatToolUsageLines(toolUsage);
  const {
    responseTimeMs = 0,
    roundsUsed = 0,
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
  } = details;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('AI Response Details')
    .setDescription(lines.join('\n').slice(0, 4096))
    .addFields({
      name: 'Response',
      value: [
        `Model: \`${modelDisplayName}\``,
        `Response time: \`${responseTimeMs} ms\``,
        `Model rounds: \`${roundsUsed}\``,
        `Prompt tokens: \`${promptTokens}\``,
        `Completion tokens: \`${completionTokens}\``,
        `Total tokens: \`${totalTokens}\``,
      ].join('\n').slice(0, 1024),
      inline: false,
    })
    .setTimestamp()
    .setFooter({
      text: `${guild?.name ?? 'Server'} · ${modelDisplayName}`,
      iconURL: guild?.iconURL({ dynamic: true }) ?? undefined,
    });
}

function resolveButtonStyle(style) {
  switch (style) {
    case 'secondary':
      return ButtonStyle.Secondary;
    case 'success':
      return ButtonStyle.Success;
    case 'danger':
      return ButtonStyle.Danger;
    case 'link':
      return ButtonStyle.Link;
    default:
      return ButtonStyle.Primary;
  }
}

function newComponentToken() {
  return randomBytes(16).toString('hex');
}

function buildAiComponents(payload, ownerId) {
  pruneComponentStates();

  const token = newComponentToken();
  const interactiveButtons = [];
  const interactiveSelectMenus = [];

  const orderedButtons = [
    ...payload.buttons,
    ...payload.fields.flatMap((field) => field.buttons ?? []),
  ].slice(0, 20);

  const orderedSelectMenus = [
    ...payload.selectMenus,
    ...payload.fields.flatMap((field) => field.selectMenus ?? []),
  ].slice(0, 8);

  const actionRows = [];
  let usedRows = 0;
  const maxActionRows = MAX_COMPONENT_ROWS - 1;

  let buttonCursor = 0;
  while (buttonCursor < orderedButtons.length && usedRows < maxActionRows) {
    const row = new ActionRowBuilder();
    let added = 0;

    while (buttonCursor < orderedButtons.length && added < 5) {
      const button = orderedButtons[buttonCursor];
      buttonCursor += 1;
      const style = resolveButtonStyle(button.style);

      if (button.style === 'link') {
        if (!button.url) continue;
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(button.label)
            .setURL(button.url)
            .setDisabled(button.disabled),
        );
        added += 1;
        continue;
      }

      const actionIndex = interactiveButtons.length;
      interactiveButtons.push({ prompt: button.prompt || button.label });
      row.addComponents(
        new ButtonBuilder()
          .setStyle(style)
          .setLabel(button.label)
          .setCustomId(`ai_btn:${ownerId}:${token}:${actionIndex}`)
          .setDisabled(button.disabled),
      );
      added += 1;
    }

    if (row.components.length > 0) {
      actionRows.push(row);
      usedRows += 1;
    }
  }

  for (const selectMenu of orderedSelectMenus) {
    if (usedRows >= maxActionRows) break;

    const actionIndex = interactiveSelectMenus.length;
    const optionPrompts = Object.fromEntries(selectMenu.options.map((option) => [option.value, option.prompt]));
    interactiveSelectMenus.push({ optionPrompts });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ai_sel:${ownerId}:${token}:${actionIndex}`)
      .setPlaceholder(selectMenu.placeholder)
      .setMinValues(selectMenu.minValues)
      .setMaxValues(selectMenu.maxValues)
      .addOptions(selectMenu.options.map((option) => ({
        label: option.label,
        value: option.value,
        description: option.description || undefined,
        default: option.default,
      })));

    actionRows.push(new ActionRowBuilder().addComponents(menu));
    usedRows += 1;
  }

  return {
    token,
    actionRows,
    interactiveButtons,
    interactiveSelectMenus,
  };
}

function buildAiViewSelectorRow(ownerId, token, activeView) {
  const currentView = activeView === 'tools' ? 'tools' : 'output';
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`ai_viewsel:${ownerId}:${token}`)
    .setPlaceholder('Select view type')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      {
        label: 'Output View',
        value: 'output',
        description: 'Show the structured AI answer',
        default: currentView === 'output',
      },
      {
        label: 'Tools & Details View',
        value: 'tools',
        description: 'Show tools used and response metadata',
        default: currentView === 'tools',
      },
    ));
}

function buildAiViewComponents(ownerId, token, actionRows, activeView) {
  const rows = [buildAiViewSelectorRow(ownerId, token, activeView)];
  rows.push(...(Array.isArray(actionRows) ? actionRows.slice(0, MAX_COMPONENT_ROWS - 1) : []));
  return rows;
}

function registerAiComponentState({
  token,
  ownerId,
  interactiveButtons,
  interactiveSelectMenus,
  actionRows,
  outputEmbed,
  toolsEmbed,
}) {
  aiComponentStates.set(token, {
    token,
    ownerId,
    interactiveButtons: Array.isArray(interactiveButtons) ? interactiveButtons : [],
    interactiveSelectMenus: Array.isArray(interactiveSelectMenus) ? interactiveSelectMenus : [],
    actionRows: Array.isArray(actionRows) ? actionRows : [],
    outputEmbed,
    toolsEmbed,
    expiresAt: Date.now() + AI_COMPONENT_TTL_MS,
  });
}

function buildAiOutputPayload(state) {
  return {
    embeds: [state.outputEmbed],
    components: buildAiViewComponents(state.ownerId, state.token, state.actionRows, 'output'),
  };
}

function buildAiToolsPayload(state) {
  return {
    embeds: [state.toolsEmbed],
    components: buildAiViewComponents(state.ownerId, state.token, state.actionRows, 'tools'),
  };
}

function storeConversationState(messageId, state) {
  conversationStates.set(messageId, {
    ...state,
    updatedAt: Date.now(),
  });
  pruneConversationStates();
}

function getConversationState(messageId) {
  pruneConversationStates();
  return conversationStates.get(messageId) ?? null;
}

function hasConversationState(messageId) {
  return getConversationState(messageId) !== null;
}

function buildInteractionContext(source) {
  return {
    guild: source.guild,
    channel: source.channel,
    client: source.client,
    user: source.user ?? source.author,
  };
}

async function generateAiResponse({
  source,
  prompt,
  model,
  priorMessages,
}) {
  const selectedModel = AI_MODELS.find((entry) => entry.value === model)?.value ?? DEFAULT_MODEL;
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured.');
  }

  const modelDisplayName = getModelDisplayName(selectedModel);
  const startedAt = Date.now();

  const completion = await runAiCompletion({
    apiKey,
    model: selectedModel,
    context: {
      ...buildInteractionContext(source),
      latestPrompt: prompt,
    },
    prompt,
    priorMessages,
  });
  const responseTimeMs = Date.now() - startedAt;

  const normalized = normalizePayload(completion.structured, completion.rawFinalText);
  const outputEmbed = createAiEmbed(source.guild, normalized, modelDisplayName);
  const toolsEmbed = createAiToolsEmbed(source.guild, modelDisplayName, completion.toolUsage, {
    responseTimeMs,
    roundsUsed: completion.roundsUsed,
    promptTokens: completion.usage?.promptTokens ?? 0,
    completionTokens: completion.usage?.completionTokens ?? 0,
    totalTokens: completion.usage?.totalTokens ?? 0,
  });
  const ownerId = source.user?.id ?? source.author?.id;
  let outputPayload = { embeds: [outputEmbed], components: [] };
  let toolsPayload = { embeds: [toolsEmbed], components: [] };

  if (ownerId) {
    const componentBundle = buildAiComponents(normalized, ownerId);
    registerAiComponentState({
      token: componentBundle.token,
      ownerId,
      interactiveButtons: componentBundle.interactiveButtons,
      interactiveSelectMenus: componentBundle.interactiveSelectMenus,
      actionRows: componentBundle.actionRows,
      outputEmbed,
      toolsEmbed,
    });
    const state = aiComponentStates.get(componentBundle.token);
    if (state) {
      outputPayload = buildAiOutputPayload(state);
      toolsPayload = buildAiToolsPayload(state);
    }
  }

  return {
    outputPayload,
    toolsPayload,
    completionMessages: completion.messages,
    model: selectedModel,
  };
}

function parseAiComponentCustomId(customId) {
  const parts = asString(customId, '').split(':');
  if (parts.length !== 4) return null;
  const [kind, ownerId, token, actionIndexRaw] = parts;
  if (kind !== 'ai_btn' && kind !== 'ai_sel') return null;
  if (actionIndexRaw.length > 6) return null;
  if (!/^\d+$/.test(actionIndexRaw)) return null;
  const actionIndex = Number.parseInt(actionIndexRaw, 10);
  if (!Number.isInteger(actionIndex) || actionIndex < 0) return null;
  return {
    kind,
    ownerId,
    token,
    actionIndex,
  };
}

function parseAiViewCustomId(customId) {
  const parts = asString(customId, '').split(':');
  if (parts.length !== 4) return null;
  const [kind, ownerId, token, view] = parts;
  if (kind !== 'ai_view') return null;
  if (view !== 'output' && view !== 'tools') return null;
  return {
    ownerId,
    token,
    view,
  };
}

function parseAiViewSelectCustomId(customId) {
  const parts = asString(customId, '').split(':');
  if (parts.length !== 3) return null;
  const [kind, ownerId, token] = parts;
  if (kind !== 'ai_viewsel') return null;
  return {
    ownerId,
    token,
  };
}

function isAiComponentCustomId(customId) {
  const value = asString(customId, '');
  return value.startsWith('ai_btn:') || value.startsWith('ai_sel:') || value.startsWith('ai_view:') || value.startsWith('ai_viewsel:');
}

function isUnknownInteractionError(error) {
  if (!error || typeof error !== 'object') return false;
  if (Number(error.code) === 10062) return true;
  return asString(error.message, '').toLowerCase().includes('unknown interaction');
}

async function handleAiComponentInteraction(interaction) {
  try {
    const viewToggle = parseAiViewCustomId(interaction.customId);
    const viewSelect = parseAiViewSelectCustomId(interaction.customId);
    const parsed = parseAiComponentCustomId(interaction.customId);
    if (!viewToggle && !viewSelect && !parsed) return false;

    pruneComponentStates();

    const ownerId = viewToggle?.ownerId ?? viewSelect?.ownerId ?? parsed?.ownerId;
    if (ownerId !== interaction.user.id) {
      await interaction.reply({
        embeds: [embeds.error('These AI controls belong to someone else.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const token = viewToggle?.token ?? viewSelect?.token ?? parsed?.token;
    const state = aiComponentStates.get(token);
    if (!state || state.ownerId !== ownerId) {
      await interaction.reply({
        embeds: [embeds.warning('These AI controls have expired. Run `/ai` again.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (viewToggle || viewSelect) {
      const selectedView = viewToggle?.view
        ?? (Array.isArray(interaction.values) ? interaction.values[0] : '')
        ?? '';
      if (selectedView === 'tools') {
        await interaction.update(buildAiToolsPayload(state));
      } else {
        await interaction.update(buildAiOutputPayload(state));
      }
      return true;
    }

    let followupPrompt = '';

    if (parsed.kind === 'ai_btn') {
      const action = state.interactiveButtons[parsed.actionIndex];
      if (!action) {
        await interaction.reply({
          embeds: [embeds.warning('That AI button action is no longer available.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      followupPrompt = truncate(action.prompt, 1500);
    }

    if (parsed.kind === 'ai_sel') {
      const action = state.interactiveSelectMenus[parsed.actionIndex];
      const selectedValues = Array.isArray(interaction.values) ? interaction.values : [];
      followupPrompt = truncate(
        selectedValues
          .map((value) => action?.optionPrompts?.[value])
          .filter(Boolean)
          .join('\n'),
        1500,
      );
      if (!followupPrompt) {
        await interaction.reply({
          embeds: [embeds.warning('That AI menu option has no continuation prompt.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
    }

    const previous = getConversationState(interaction.message.id);
    const model = previous?.model ?? DEFAULT_MODEL;

    try {
      await interaction.deferReply();
    } catch (error) {
      if (isUnknownInteractionError(error)) return;
      throw error;
    }

    try {
      const response = await generateAiResponse({
        source: interaction,
        prompt: followupPrompt,
        model,
        priorMessages: previous?.messages ?? [],
      });

      const sentMessage = await interaction.editReply(response.outputPayload);

      storeConversationState(sentMessage.id, {
        userId: interaction.user.id,
        model: response.model,
        messages: response.completionMessages,
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [
          embeds.error(
            `AI request failed: ${truncate(error.message, 500)}`,
            interaction.guild ?? null,
          ),
        ],
        components: [],
      });
    }

    return true;
  } catch (error) {
    if (isUnknownInteractionError(error)) return true;
    throw error;
  }
}

async function handleAiReplyMessage(message) {
  if (message.author.bot || !message.guild || !message.reference?.messageId) return false;
  if (!isDevUser(message.author.id)) return false;

  const reference = await message.fetchReference().catch(() => null);
  if (!reference || reference.author.id !== message.client.user.id) return false;
  if (!hasConversationState(reference.id)) return false;

  const prompt = asString(message.content, '').trim();
  if (!prompt) {
    await message.reply({
      embeds: [embeds.warning('Reply with a prompt to continue the AI conversation.', message.guild)],
    }).catch(() => null);
    return true;
  }

  const previous = getConversationState(reference.id);
  const model = previous?.model ?? DEFAULT_MODEL;

  try {
    const response = await generateAiResponse({
      source: message,
      prompt,
      model,
      priorMessages: previous?.messages ?? [],
    });

    const sentMessage = await message.reply(response.outputPayload).catch(() => null);
    if (!sentMessage) return true;

    storeConversationState(sentMessage.id, {
      userId: message.author.id,
      model: response.model,
      messages: response.completionMessages,
    });
  } catch (error) {
    await message.reply({
      embeds: [
        embeds.error(
          `AI request failed: ${truncate(error.message, 500)}`,
          message.guild ?? null,
        ),
      ],
      components: [],
    }).catch(() => null);
  }

  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('[Dev] Ask AI and return a structured embedded answer.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('What you want the AI to do.')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('model')
        .setDescription('Which model to use.')
        .setRequired(false)
        .addChoices(
          ...AI_MODELS.map((entry) => ({ name: entry.displayName, value: entry.value })),
        ),
    ),

  isAiComponentCustomId,
  handleAiComponentInteraction,
  handleAiReplyMessage,

  async execute(interaction) {
    if (!isDevUser(interaction.user.id)) {
      await interaction.reply({
        embeds: [embeds.error('This command is restricted to the bot developer.', interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const apiKey = getNvidiaApiKey();
    if (!apiKey) {
      await interaction.reply({
        embeds: [
          embeds.error(
            'NVIDIA_API_KEY is not configured. Add it to your environment before using `/ai`.',
            interaction.guild ?? null,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userPrompt = interaction.options.getString('prompt', true).trim();
    const model = interaction.options.getString('model') ?? DEFAULT_MODEL;

    await interaction.deferReply();

    try {
      const response = await generateAiResponse({
        source: interaction,
        prompt: userPrompt,
        model,
        priorMessages: [],
      });

      let sentMessage = null;
      try {
        sentMessage = await interaction.editReply(response.outputPayload);
      } catch (error) {
        if (isUnknownInteractionError(error)) return;
        throw error;
      }

      storeConversationState(sentMessage.id, {
        userId: interaction.user.id,
        model: response.model,
        messages: response.completionMessages,
      });
    } catch (error) {
      try {
        await interaction.editReply({
          embeds: [
            embeds.error(
              `AI request failed: ${truncate(error.message, 500)}`,
              interaction.guild ?? null,
            ),
          ],
          components: [],
        });
      } catch (replyError) {
        if (!isUnknownInteractionError(replyError)) throw replyError;
      }
      return null;
    }

  },
};
