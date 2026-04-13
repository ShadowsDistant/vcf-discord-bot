'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

// ── Constants ───────────────────────────────────────────────────────────────────
const ALLOWED_USER_ID = '757698506411475005';
const NVIDIA_API_KEY = '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';
const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'google/gemma-4-31b-it';
const MAX_TOKENS = 16384;
const TEMPERATURE = 1.0;
const TOP_P = 0.95;
const MAX_ITERATIONS = 10;
const DEFAULT_COLOR = 0x76b900; // NVIDIA green
const CONFIRMATION_TIMEOUT_MS = 30_000;
const DESC_MAX = 4096;
const FIELD_VALUE_MAX = 1024;
const FIELDS_MAX = 25;

// ── System prompt ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an AI assistant inside a Discord server. You have access to Discord management tools and a web search tool.

Guidelines:
- Use Discord tools only when the request explicitly requires Discord interaction (reading/modifying the server).
- Use the web search tool only when the request needs up-to-date information or web lookup.
- For dangerous actions (kick/ban/timeout members, delete channels or messages, create roles), clearly state what you intend to do — the system will ask the user to confirm before executing.
- ALWAYS respond with a valid JSON object matching this exact embed schema (no markdown fences, just raw JSON):

{
  "title": "Optional title string or null",
  "description": "Main response text (required)",
  "color": "#rrggbb or null",
  "fields": [{ "name": "Field Title", "value": "Content", "inline": true }],
  "footer": "Optional footer string or null",
  "thumbnail_url": "Optional thumbnail URL or null",
  "image_url": "Optional image URL or null",
  "author_name": "Optional author name override or null",
  "author_icon_url": "Optional author icon URL or null"
}

- Use fields for structured/tabular data.
- Use color for thematic tone: red (#ed4245) = error/danger, green (#57f287) = success, blue (#5865f2) = info, yellow (#fee75c) = warning, null = default NVIDIA green.
- Markdown works in description and field values.
- description max 4096 chars, field values max 1024 chars, max 25 fields.
- Keep responses concise and useful.`;

// ── Dangerous tools ──────────────────────────────────────────────────────────────
const DANGEROUS_TOOLS = new Set([
  'ban_member',
  'kick_member',
  'timeout_member',
  'delete_message',
  'create_role',
  'delete_channel',
]);

// ── Tool schemas (OpenAI function calling format) ────────────────────────────────
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a Discord channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the target channel.' },
          content: { type: 'string', description: 'The message text to send.' },
        },
        required: ['channel_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_message',
      description: 'Edit an existing message in a Discord channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The channel containing the message.' },
          message_id: { type: 'string', description: 'The ID of the message to edit.' },
          content: { type: 'string', description: 'The new message content.' },
        },
        required: ['channel_id', 'message_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Delete a message from a Discord channel. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The channel containing the message.' },
          message_id: { type: 'string', description: 'The ID of the message to delete.' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_info',
      description: 'Get information about a specific Discord channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_channels',
      description: 'List all channels in the current guild.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_channel_topic',
      description: 'Set the topic of a text channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          topic: { type: 'string', description: 'The new topic text (empty string to clear).' },
        },
        required: ['channel_id', 'topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_info',
      description: 'Get information about a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_members',
      description: 'List members in the guild (up to 100).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of members to return (1–100). Defaults to 50.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_guild_info',
      description: 'Get information about the current Discord guild/server.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_roles',
      description: 'List all roles in the guild.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_role',
      description: 'Create a new role in the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new role.' },
          color: { type: 'string', description: 'The hex color for the role (e.g. "#ff0000"). Optional.' },
          hoist: { type: 'boolean', description: 'Whether to display the role separately in the member list. Optional.' },
          mentionable: { type: 'boolean', description: 'Whether the role can be mentioned. Optional.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_role',
      description: 'Add a role to a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          role_id: { type: 'string', description: 'The ID of the role to add.' },
        },
        required: ['user_id', 'role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_role',
      description: 'Remove a role from a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          role_id: { type: 'string', description: 'The ID of the role to remove.' },
        },
        required: ['user_id', 'role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Ban a member from the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to ban.' },
          reason: { type: 'string', description: 'The reason for the ban. Optional.' },
          delete_message_days: { type: 'number', description: 'Number of days of messages to delete (0–7). Optional, defaults to 0.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kick_member',
      description: 'Kick a member from the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to kick.' },
          reason: { type: 'string', description: 'The reason for the kick. Optional.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'timeout_member',
      description: 'Apply a timeout (communication disable) to a guild member. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to time out.' },
          duration_seconds: { type: 'number', description: 'The timeout duration in seconds (max 2419200 = 28 days).' },
          reason: { type: 'string', description: 'The reason for the timeout. Optional.' },
        },
        required: ['user_id', 'duration_seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_channel',
      description: 'Create a new channel in the guild.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new channel.' },
          type: {
            type: 'string',
            enum: ['text', 'voice', 'category', 'announcement', 'forum', 'stage'],
            description: 'The channel type. Defaults to "text".',
          },
          topic: { type: 'string', description: 'The channel topic (text channels only). Optional.' },
          parent_id: { type: 'string', description: 'The category channel ID to place this channel under. Optional.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_channel',
      description: 'Delete a channel from the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel to delete.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pin_message',
      description: 'Pin a message in a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          message_id: { type: 'string', description: 'The ID of the message to pin.' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unpin_message',
      description: 'Unpin a message in a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          message_id: { type: 'string', description: 'The ID of the message to unpin.' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_message_history',
      description: 'Fetch recent message history from a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          limit: { type: 'number', description: 'Number of messages to retrieve (1–100). Defaults to 25.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_reaction',
      description: 'Add a reaction emoji to a message.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          message_id: { type: 'string', description: 'The ID of the message.' },
          emoji: { type: 'string', description: 'The emoji to react with (e.g. "👍" or a custom emoji ID).' },
        },
        required: ['channel_id', 'message_id', 'emoji'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web using DuckDuckGo and return the top 5 results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
        },
        required: ['query'],
      },
    },
  },
];

// ── Channel type mapping ─────────────────────────────────────────────────────────
const CHANNEL_TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};

// ── Helpers ──────────────────────────────────────────────────────────────────────

/**
 * Strip <think>...</think> blocks (and leading/trailing whitespace) from a string.
 * @param {string} text
 * @returns {string}
 */
function stripThinkBlocks(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Convert a CSS hex color string to an integer.
 * @param {string|null|undefined} hex
 * @returns {number}
 */
function hexToInt(hex) {
  if (!hex || typeof hex !== 'string') return DEFAULT_COLOR;
  const clean = hex.replace(/^#/, '').trim();
  const parsed = parseInt(clean, 16);
  return Number.isNaN(parsed) ? DEFAULT_COLOR : parsed;
}

/**
 * Truncate a string to maxLen, appending a suffix if truncated.
 * @param {string} str
 * @param {number} maxLen
 * @param {string} [suffix]
 * @returns {string}
 */
function truncate(str, maxLen, suffix = '…') {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - suffix.length) + suffix;
}

/**
 * Build a compact human-readable string of tool arguments for display.
 * @param {object} args
 * @returns {string}
 */
function formatToolArgs(args) {
  if (!args || typeof args !== 'object') return '';
  const parts = Object.entries(args).map(([k, v]) => {
    const val = typeof v === 'string' ? truncate(v, 40) : String(v);
    return `${k}: ${val}`;
  });
  return parts.join(', ');
}

/**
 * Strip all HTML tags from a string, iterating until no tags remain so that
 * nested/malformed tags such as "<scr<script>ipt>" cannot survive.
 * @param {string} str
 * @returns {string}
 */
function stripHtmlTags(str) {
  let result = str;
  let prev;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== prev);
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Fetch the top 5 web search results from DuckDuckGo's HTML endpoint.
 * @param {string} query
 * @returns {Promise<Array<{title:string, url:string, snippet:string}>>}
 */
async function duckDuckGoSearch(query) {
  const url = 'https://html.duckduckgo.com/html/';
  const body = `q=${encodeURIComponent(query)}&b=&kl=`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body,
  });
  const html = await res.text();

  const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippetMatches = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const results = [];
  const count = Math.min(5, titleMatches.length);
  for (let i = 0; i < count; i++) {
    const rawHref = titleMatches[i][1];
    let resolvedUrl = rawHref;
    try {
      const parsed = new URL(rawHref, 'https://html.duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) resolvedUrl = decodeURIComponent(uddg);
    } catch {
      // keep raw href
    }
    const title = stripHtmlTags(titleMatches[i][2]);
    const snippet = snippetMatches[i]
      ? stripHtmlTags(snippetMatches[i][1])
      : '';
    results.push({ title, url: resolvedUrl, snippet });
  }
  return results;
}

/**
 * Execute a named tool with the given parsed arguments.
 * Returns a JSON-serialisable value or throws on failure.
 * @param {string} toolName
 * @param {object} args
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<unknown>}
 */
async function executeTool(toolName, args, interaction) {
  const guild = interaction.guild;

  switch (toolName) {
    case 'send_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.send({ content: args.content });
      return { success: true, message_id: msg.id, channel_id: ch.id };
    }

    case 'edit_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.edit({ content: args.content });
      return { success: true, message_id: msg.id };
    }

    case 'delete_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.delete();
      return { success: true };
    }

    case 'get_channel_info': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch) throw new Error('Channel not found.');
      return {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        topic: ch.topic ?? null,
        position: ch.position ?? null,
        parent_id: ch.parentId ?? null,
        nsfw: ch.nsfw ?? false,
        created_at: ch.createdAt?.toISOString() ?? null,
      };
    }

    case 'list_channels': {
      const channels = await guild.channels.fetch();
      return channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        parent_id: ch.parentId ?? null,
        position: ch.rawPosition ?? null,
      }));
    }

    case 'set_channel_topic': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      await ch.setTopic(args.topic);
      return { success: true, topic: args.topic };
    }

    case 'get_member_info': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      return {
        id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        bot: member.user.bot,
        roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
        joined_at: member.joinedAt?.toISOString() ?? null,
        created_at: member.user.createdAt?.toISOString() ?? null,
        timed_out_until: member.communicationDisabledUntil?.toISOString() ?? null,
      };
    }

    case 'list_members': {
      const limit = Math.min(100, Math.max(1, args.limit ?? 50));
      const members = await guild.members.fetch({ limit });
      return [...members.values()].map((m) => ({
        id: m.id,
        username: m.user.username,
        display_name: m.displayName,
        bot: m.user.bot,
      }));
    }

    case 'get_guild_info': {
      const g = guild;
      return {
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        member_count: g.memberCount,
        owner_id: g.ownerId,
        created_at: g.createdAt?.toISOString() ?? null,
        icon_url: g.iconURL({ dynamic: true }) ?? null,
        premium_tier: g.premiumTier,
        boost_count: g.premiumSubscriptionCount ?? 0,
      };
    }

    case 'list_roles': {
      const roles = await guild.roles.fetch();
      return [...roles.values()]
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          hoist: r.hoist,
          mentionable: r.mentionable,
          managed: r.managed,
          member_count: r.members.size,
        }));
    }

    case 'create_role': {
      const options = { name: args.name };
      if (args.color) options.color = hexToInt(args.color);
      if (typeof args.hoist === 'boolean') options.hoist = args.hoist;
      if (typeof args.mentionable === 'boolean') options.mentionable = args.mentionable;
      const role = await guild.roles.create(options);
      return { success: true, role_id: role.id, name: role.name };
    }

    case 'add_role': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      await member.roles.add(args.role_id);
      return { success: true };
    }

    case 'remove_role': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      await member.roles.remove(args.role_id);
      return { success: true };
    }

    case 'ban_member': {
      const deleteMessageSeconds = Math.min(7, Math.max(0, args.delete_message_days ?? 0)) * 86400;
      await guild.members.ban(args.user_id, {
        reason: args.reason ?? undefined,
        deleteMessageSeconds,
      });
      return { success: true };
    }

    case 'kick_member': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      await member.kick(args.reason ?? undefined);
      return { success: true };
    }

    case 'timeout_member': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      const ms = Math.min(args.duration_seconds * 1000, 28 * 24 * 60 * 60 * 1000);
      await member.timeout(ms, args.reason ?? undefined);
      return { success: true };
    }

    case 'create_channel': {
      const type = CHANNEL_TYPE_MAP[args.type ?? 'text'] ?? ChannelType.GuildText;
      const options = { name: args.name, type };
      if (args.topic) options.topic = args.topic;
      if (args.parent_id) options.parent = args.parent_id;
      const ch = await guild.channels.create(options);
      return { success: true, channel_id: ch.id, name: ch.name };
    }

    case 'delete_channel': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch) throw new Error('Channel not found.');
      await ch.delete();
      return { success: true };
    }

    case 'pin_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.pin();
      return { success: true };
    }

    case 'unpin_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.unpin();
      return { success: true };
    }

    case 'get_message_history': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const limit = Math.min(100, Math.max(1, args.limit ?? 25));
      const messages = await ch.messages.fetch({ limit });
      return [...messages.values()].map((m) => ({
        id: m.id,
        author_id: m.author.id,
        author_username: m.author.username,
        content: m.content,
        created_at: m.createdAt.toISOString(),
        edited_at: m.editedAt?.toISOString() ?? null,
        attachments: m.attachments.size,
        embeds: m.embeds.length,
      }));
    }

    case 'add_reaction': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.react(args.emoji);
      return { success: true };
    }

    case 'search_web': {
      const results = await duckDuckGoSearch(args.query);
      return results;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Call the NVIDIA Build API with the current message history.
 * @param {object[]} messages
 * @returns {Promise<object>}
 */
async function callNvidiaApi(messages) {
  const res = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto',
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      top_p: TOP_P,
      stream: false,
      enable_thinking: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`NVIDIA API error ${res.status}`), { status: res.status, body: text });
  }

  return res.json();
}

/**
 * Build a "dangerous action confirmation" embed with confirm/cancel buttons.
 * @param {string} toolName
 * @param {object} args
 * @returns {{ embed: EmbedBuilder, row: ActionRowBuilder }}
 */
function buildDangerousActionUI(toolName, args) {
  const descriptions = {
    ban_member: `**Ban member** \`${args.user_id}\`${args.reason ? `\nReason: ${args.reason}` : ''}`,
    kick_member: `**Kick member** \`${args.user_id}\`${args.reason ? `\nReason: ${args.reason}` : ''}`,
    timeout_member: `**Timeout member** \`${args.user_id}\` for **${args.duration_seconds}s**${args.reason ? `\nReason: ${args.reason}` : ''}`,
    delete_message: `**Delete message** \`${args.message_id}\` in channel \`${args.channel_id}\``,
    create_role: `**Create role** named \`${args.name}\`${args.color ? ` (color: ${args.color})` : ''}`,
    delete_channel: `**Delete channel** \`${args.channel_id}\``,
  };

  const description = descriptions[toolName] ?? `**${toolName}** with args: \`${JSON.stringify(args)}\``;

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('⚠️ Dangerous Action — Confirm?')
    .setDescription(`The AI wants to perform the following action:\n\n${description}\n\nRespond within 30 seconds.`)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ai_dangerous_confirm')
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ai_dangerous_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

/**
 * Show a confirmation prompt and wait for the allowed user to respond.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Message} replyMsg
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<boolean>} true = confirmed, false = denied/timeout
 */
async function awaitConfirmation(interaction, replyMsg, toolName, args) {
  const { embed, row } = buildDangerousActionUI(toolName, args);
  await interaction.editReply({ embeds: [embed], components: [row] });

  try {
    const btn = await replyMsg.awaitMessageComponent({
      filter: (i) =>
        (i.customId === 'ai_dangerous_confirm' || i.customId === 'ai_dangerous_cancel') &&
        i.user.id === ALLOWED_USER_ID,
      time: CONFIRMATION_TIMEOUT_MS,
    });
    await btn.deferUpdate();
    return btn.customId === 'ai_dangerous_confirm';
  } catch {
    // Timeout — remove buttons
    await interaction.editReply({ components: [] }).catch(() => null);
    return false;
  }
}

/**
 * Build the final response embed from the AI's JSON output.
 * @param {string} rawContent      AI final message content
 * @param {Array}  toolsUsed       accumulated tool call records
 * @returns {EmbedBuilder}
 */
function buildFinalEmbed(rawContent, toolsUsed) {
  const cleaned = stripThinkBlocks(rawContent);

  // Attempt JSON parse — strip markdown code fences if present
  let data = null;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : cleaned.trim();
  try {
    data = JSON.parse(jsonStr);
  } catch {
    data = null;
  }

  // Apply defaults
  if (!data || typeof data !== 'object') {
    data = { description: truncate(cleaned || '*(No response)*', DESC_MAX, '\n\n*[Response truncated]*') };
  }

  const color = hexToInt(data.color);
  const authorName = stripThinkBlocks(String(data.author_name ?? 'Gemma 4 31B'));
  const footerText = stripThinkBlocks(String(data.footer ?? 'Powered by Nvidia Build API'));
  const title = data.title ? truncate(stripThinkBlocks(String(data.title)), 256) : null;
  const description = truncate(
    stripThinkBlocks(String(data.description ?? '*(No response)*')),
    DESC_MAX,
    '\n\n*[Response truncated]*',
  );

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setTimestamp();

  if (title) embed.setTitle(title);

  const authorIconUrl = data.author_icon_url ? String(data.author_icon_url) : undefined;
  embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
  embed.setFooter({ text: footerText });

  if (data.thumbnail_url) {
    try { embed.setThumbnail(String(data.thumbnail_url)); } catch { /* invalid url */ }
  }
  if (data.image_url) {
    try { embed.setImage(String(data.image_url)); } catch { /* invalid url */ }
  }

  // Fields from AI
  const fields = [];
  if (Array.isArray(data.fields)) {
    for (const f of data.fields) {
      if (!f?.name || !f?.value) continue;
      fields.push({
        name: truncate(stripThinkBlocks(String(f.name)), 256),
        value: truncate(stripThinkBlocks(String(f.value)), FIELD_VALUE_MAX),
        inline: Boolean(f.inline),
      });
      if (fields.length >= FIELDS_MAX - 1) break; // leave room for tools field
    }
  }

  // Append "Tools Used" field if any tools were called
  if (toolsUsed.length > 0) {
    const lines = toolsUsed.map((t) => {
      const argStr = formatToolArgs(t.args);
      const label = argStr ? `${t.name}(${argStr})` : t.name;
      if (t.denied) return `🚫 ${label} — denied`;
      if (t.error) return `❌ ${label} — ${truncate(t.error, 80)}`;
      return `✅ ${label}`;
    });
    fields.push({
      name: '🔧 Tools Used',
      value: truncate(lines.join('\n'), FIELD_VALUE_MAX),
      inline: false,
    });
  }

  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Build a simple "processing" embed shown while the AI is working.
 * @param {string} [status]
 * @returns {EmbedBuilder}
 */
function buildProcessingEmbed(status = 'Thinking…') {
  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle('⏳ Processing')
    .setDescription(status)
    .setTimestamp();
}

/**
 * Build an error embed for API/unexpected failures.
 * @param {string} message
 * @param {number} [statusCode]
 * @returns {EmbedBuilder}
 */
function buildErrorEmbed(message, statusCode) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('❌ Error')
    .setDescription(message)
    .setTimestamp();
  if (statusCode) {
    embed.addFields({ name: 'Status Code', value: String(statusCode), inline: true });
  }
  return embed;
}

// ── Command definition ──────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('[Dev] Send a prompt to the Gemma 4 AI with Discord tools and web search.')
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('Your prompt for the AI.')
        .setRequired(true),
    ),

  async execute(interaction) {
    // ── Auth check ────────────────────────────────────────────────────────────
    if (interaction.user.id !== ALLOWED_USER_ID) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('Access Denied')
            .setDescription('This command is restricted to the bot developer.')
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const prompt = interaction.options.getString('prompt', true);

    // ── Defer reply immediately ───────────────────────────────────────────────
    await interaction.deferReply();
    const replyMsg = await interaction.fetchReply();

    await interaction.editReply({
      embeds: [buildProcessingEmbed('Sending prompt to AI…')],
      components: [],
    });

    // ── Message history ───────────────────────────────────────────────────────
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const toolsUsed = [];

    // ── Tool execution loop ───────────────────────────────────────────────────
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Update processing status on subsequent iterations
      if (iteration > 0) {
        await interaction.editReply({
          embeds: [buildProcessingEmbed(`Processing results… (iteration ${iteration + 1}/${MAX_ITERATIONS})`)],
          components: [],
        });
      }

      // Call NVIDIA API
      let apiData;
      try {
        apiData = await callNvidiaApi(messages);
      } catch (err) {
        return interaction.editReply({
          embeds: [buildErrorEmbed(err.message, err.status)],
          components: [],
        });
      }

      const choice = apiData?.choices?.[0];
      if (!choice) {
        return interaction.editReply({
          embeds: [buildErrorEmbed('Received an empty response from the AI API.')],
          components: [],
        });
      }

      const assistantMessage = choice.message;

      // Add assistant turn to history
      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls;

      // No tool calls → final response
      if (!toolCalls || toolCalls.length === 0) {
        const content = assistantMessage.content ?? '';
        return interaction.editReply({
          embeds: [buildFinalEmbed(content, toolsUsed)],
          components: [],
        });
      }

      // ── Process tool calls ──────────────────────────────────────────────────
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments ?? '{}');
        } catch {
          toolArgs = {};
        }

        let toolResult;

        if (DANGEROUS_TOOLS.has(toolName)) {
          // Show confirmation UI and wait for user response
          await interaction.editReply({
            embeds: [buildProcessingEmbed(`Waiting for confirmation of \`${toolName}\`…`)],
            components: [],
          });
          const confirmed = await awaitConfirmation(interaction, replyMsg, toolName, toolArgs);

          if (!confirmed) {
            toolResult = 'Action was denied by the user (or timed out). Do not attempt this action again without asking the user.';
            toolsUsed.push({ name: toolName, args: toolArgs, denied: true });
            // Restore processing embed
            await interaction.editReply({
              embeds: [buildProcessingEmbed('Action denied. Continuing…')],
              components: [],
            });
          } else {
            try {
              toolResult = await executeTool(toolName, toolArgs, interaction);
              toolsUsed.push({ name: toolName, args: toolArgs, success: true });
            } catch (err) {
              toolResult = `Error executing ${toolName}: ${err.message}`;
              toolsUsed.push({ name: toolName, args: toolArgs, error: err.message });
            }
            // Restore processing embed
            await interaction.editReply({
              embeds: [buildProcessingEmbed('Action executed. Continuing…')],
              components: [],
            });
          }
        } else {
          // Non-dangerous tool — execute immediately
          try {
            toolResult = await executeTool(toolName, toolArgs, interaction);
            toolsUsed.push({ name: toolName, args: toolArgs, success: true });
          } catch (err) {
            toolResult = `Error executing ${toolName}: ${err.message}`;
            toolsUsed.push({ name: toolName, args: toolArgs, error: err.message });
          }
        }

        // Add tool result to message history
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        });
      }
    }

    // Max iterations reached — use whatever we have
    return interaction.editReply({
      embeds: [
        buildFinalEmbed(
          JSON.stringify({ description: 'Maximum tool-call iterations reached. The AI could not produce a final response.' }),
          toolsUsed,
        ),
      ],
      components: [],
    });
  },
};
