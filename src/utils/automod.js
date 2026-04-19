'use strict';

// ─── Word / Pattern Lists ─────────────────────────────────────────────────────

/**
 * Each category has an id, a human-readable label, and a list of patterns.
 * Patterns can be strings (exact word-boundary match) or RegExp objects.
 *
 * Categories:
 *   slurs         – racial, ethnic, homophobic, and other identity slurs
 *   hate          – hate speech and extremist phrases
 *   sexual        – explicit sexual content / NSFW language
 *   threats       – direct threats of violence
 *   drugs         – drug references
 *   spam          – spam-type content (excessive caps, repeated chars)
 *   selfharm      – self-harm and suicide-related language
 *   doxxing       – attempts to share personal information
 *   advertising   – unauthorized advertisement and invite links
 *   slursBypass   – common l33tspeak / spacing bypass variations (auto-generated)
 */
const CATEGORIES = {
  profanity: {
    label: 'Targeted Profanity & Abuse',
    patterns: [
      'fuck you', 'go fuck yourself', 'fuck off',
      'stfu', 'gtfo',
      'eat shit', 'piece of shit',
      'you are a bitch', 'youre a bitch', "you're a bitch",
      'you are an asshole', 'youre an asshole', "you're an asshole",
      'you are dumbass', 'youre dumbass', "you're dumbass",
      'you are jackass', 'youre jackass', "you're jackass",
      'you are dickhead', 'youre dickhead', "you're dickhead",
      /\bf[\W_]*u[\W_]*c[\W_]*k[\W_]*(y[\W_]*o[\W_]*u)?\b/i,
      /\bs[\W_]*t[\W_]*f[\W_]*u\b/i,
      /\bg[\W_]*t[\W_]*f[\W_]*o\b/i,
    ],
  },

  slurs: {
    label: 'Slurs & Identity-Based Hate',
    patterns: [
      // Racial / ethnic slurs
      'nigger', 'nigga', 'n1gger', 'n1gga', 'nigg3r', 'nigg@',
      'kike', 'k1ke', 'spic', 'sp1c', 'wetback', 'beaner',
      'chink', 'ch1nk', 'gook', 'g00k', 'jap', 'zipperhead',
      'towelhead', 'raghead', 'camel jockey', 'sand nigger',
      'coon', 'c00n', 'jungle bunny', 'porch monkey',
      'cracker', 'honky', 'whitey',
      'tranny', 'tr@nny', 'tr4nny', 'shemale',
      'faggot', 'f4ggot', 'f@ggot', 'fag', 'f@g',
      'dyke', 'd1ke', 'd@ke',
      'retard', 'r3tard', 'ret@rd',
      'spastic', 'sp4stic',
      'mongoloid',
    ],
  },

  hate: {
    label: 'Hate Speech & Extremism',
    patterns: [
      'white power', 'white supremacy', 'white nationalist',
      '14 words', '1488', 'heil hitler', 'sieg heil',
      'gas the jews', 'kill all jews', 'kill all blacks',
      'black lives dont matter', 'all lives matter more',
      'ethnic cleansing', 'master race', 'pure race',
      'death to arabs', 'death to muslims',
      'kkk', 'ku klux klan',
      /\bnazi(s)?\b/i,
      /\bfuhrer\b/i,
      'burn the jews', 'jews will not replace',
      'great replacement',
    ],
  },

  sexual: {
    label: 'Explicit Sexual Content',
    patterns: [
      'cock', 'c0ck', 'c@ck',
      'pussy', 'puss1', 'p@ssy',
      'cunt', 'c@nt', 'c0nt',
      'whore', 'wh0re', 'w@ore',
      'slut', 'sl0t', 'sl@t',
      'blowjob', 'blow job', 'bl0wjob',
      'handjob', 'hand job',
      'anal sex', '@nal sex',
      'dildo', 'd1ldo',
      'masturbate', 'masturbating', 'masturbation',
      'pornhub', 'xvideos', 'xhamster', 'pornography',
      'onlyfans', 'hentai',
      'nude', 'nudes', 'naked pics', 'naked pictures',
      'child porn', 'child pornography', 'loli', 'shota',
      'sex tape', 'leaked nudes',
      /\bsex(ual|ting)?\b/i,
      /\bnsfwb/i,
    ],
  },

  threats: {
    label: 'Threats & Violence',
    patterns: [
      'i will kill you', 'ill kill you', "i'll kill you",
      'i will hurt you', 'ill hurt you',
      'i will find you', 'ill find you',
      'watch your back', 'you are dead', "you're dead",
      'ur dead', 'dead meat',
      'kys', 'kill yourself',
      'shoot you', 'shoot up',
      'bomb threat', 'going to bomb',
      'im going to murder', "i'm going to murder",
      'gonna stab', 'going to stab',
      'slit your throat',
      'im going to leak your address',
      'i know where your family lives',
      'im going to dox you',
      /\b(d[o0]x|d[o0]xx)\b/i,
      /\b(swat(ting)?)\b/i,
      'mass shooting', 'school shooting',
    ],
  },

  drugs: {
    label: 'Drug References',
    patterns: [
      'cocaine', 'c0caine',
      'crack cocaine', 'crack rock',
      'methamphetamine', 'meth', 'm3th',
      'heroin', 'h3roin',
      'fentanyl', 'fent',
      'ketamine', 'special k',
      'lsd', 'acid trip',
      'mdma', 'molly', 'm0lly',
      'ecstasy', 'xanax', 'percocet',
      'weed dealer', 'selling weed', 'buy weed',
      'buy drugs', 'sell drugs', 'drug dealer',
      'plug for drugs', 'dmt', 'shrooms', 'magic mushrooms',
      /\b(420|blaze(d|r)?|marijuana dealer)\b/i,
    ],
  },

  spam: {
    label: 'Spam & Disruptive Content',
    patterns: [
      // These are checked via special logic in scanMessage, not string match
      // Placeholder entries make the category visible
      /(.)\1{13,}/,            // 14+ repeated characters
      /[A-Z]{25,}/,            // 25+ consecutive caps
    ],
  },

  selfharm: {
    label: 'Self-Harm & Suicide',
    patterns: [
      'kill myself', 'killing myself',
      'want to die', 'wanna die',
      'end my life', 'ending my life',
      'commit suicide', 'committing suicide',
      'suicidal', 'suicide methods', 'how to kill myself',
      'cut myself', 'cutting myself', 'self harm', 'self-harm',
      'im going to kill myself', "i'm going to kill myself",
      'rope and ceiling', 'hang myself',
    ],
  },

  doxxing: {
    label: 'Doxxing & Personal Information',
    patterns: [
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,   // IPv4
      /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i,             // Email address
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,           // US phone number
      /\b\d{3}-\d{2}-\d{4}\b/,                        // SSN pattern
      'your address is', 'i know where you live',
      'i know your address', 'your ip is',
      'i found your dox', 'dox file',
      /\b\d{1,5}\s+[a-z0-9.\-'\s]+\s(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive)\b/i,
    ],
  },

  advertising: {
    label: 'Unauthorized Advertising & Invites',
    patterns: [
      /discord\.gg\/[a-z0-9]+/i,
      /discord\.com\/invite\/[a-z0-9]+/i,
      /bit\.ly\/[a-z0-9]+/i,
      /tinyurl\.com\/[a-z0-9]+/i,
      /\bdm\s+me\s+for\s+(details|info|more)\b/i,
      /\bcheck\s+my\s+(server|discord)\b/i,
      /\bjoin\s+my\s+(server|discord)\b/i,
      /\bjoin\s+our\s+server\b/i,
      /\bfree\s+nitro\b/i,
      /\bgiveaway\b.{0,30}\bclick\b/i,
      'promotional code',
      /hxxps?:\/\/\S+/i,
      /\bdiscord[\W_]*gg[\W_]*\/[\W_]*[a-z0-9]+\b/i,
      /\bdiscord[\W_]*com[\W_]*\/[\W_]*invite[\W_]*\/[\W_]*[a-z0-9]+\b/i,
    ],
  },

  classified: {
    label: 'Classified Information Disclosure',
    patterns: [
      'classified information',
      'confidential staff chat',
      'internal staff channel screenshot',
      'leaked staff logs',
      'internal investigation details',
      'private management discussion',
      'oversight hearing notes leak',
      'sid case file',
      'disciplinary record leak',
    ],
  },

  politics: {
    label: 'Political Discussion & Agitation',
    patterns: [
      'vote for', 'vote against',
      'left wing', 'right wing',
      'democrat', 'republican',
      'liberal', 'conservative',
      'prime minister', 'presidential election',
      'political party',
      /\btrump\b/i,
      /\bbiden\b/i,
      /\belection fraud\b/i,
    ],
  },
};

const DEFAULT_CATEGORY_STATES = {
  profanity: false,
  slurs: true,
  hate: true,
  sexual: true,
  threats: true,
  drugs: true,
  spam: true,
  selfharm: true,
  doxxing: true,
  advertising: true,
  classified: true,
  politics: true,
};

// ─── Normalisation Helpers ────────────────────────────────────────────────────

/**
 * Map of l33tspeak / common substitute characters back to their plain equivalents.
 */
const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '(': 'c',
};

/**
 * Normalise a string to defeat common filter-bypass techniques:
 *  - Strip zero-width / invisible characters
 *  - Replace l33tspeak substitutions
 *  - Collapse character repetition (e.g. "fuuuuck" → "fuck")
 *  - Remove non-alphanumeric separators between letters (e.g. "f.u.c.k")
 *  - Lowercase
 */
function normalise(text) {
  // Compatibility-normalize and strip combining marks
  let s = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Remove zero-width and other invisible Unicode characters
  s = s.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '');

  // Replace lookalike Unicode letters with ASCII equivalents
  s = s
    .replace(/[àáâãäå]/gi, 'a')
    .replace(/[èéêë]/gi, 'e')
    .replace(/[ìíîï]/gi, 'i')
    .replace(/[òóôõö]/gi, 'o')
    .replace(/[ùúûü]/gi, 'u')
    .replace(/[ýÿ]/gi, 'y')
    .replace(/[ñ]/gi, 'n')
    .replace(/[ç]/gi, 'c')
    .replace(/[ß]/gi, 'ss')
    .replace(/[æ]/gi, 'ae')
    .replace(/[œ]/gi, 'oe')
    // Cyrillic lookalikes
     .replace(/а/g, 'a').replace(/е/g, 'e').replace(/о/g, 'o')
     .replace(/р/g, 'p').replace(/с/g, 'c').replace(/у/g, 'y')
     .replace(/х/g, 'x').replace(/В/g, 'b').replace(/н/g, 'h')
     // Greek lookalikes
     .replace(/Α|α/g, 'a').replace(/Β|β/g, 'b').replace(/Ε|ε/g, 'e')
     .replace(/Ζ|ζ/g, 'z').replace(/Η|η/g, 'h').replace(/Ι|ι/g, 'i')
     .replace(/Κ|κ/g, 'k').replace(/Μ|μ/g, 'm').replace(/Ν|ν/g, 'n')
     .replace(/Ο|ο/g, 'o').replace(/Ρ|ρ/g, 'p').replace(/Τ|τ/g, 't')
     .replace(/Υ|υ/g, 'y').replace(/Χ|χ/g, 'x');

  // Convert to lowercase
  s = s.toLowerCase();

  // Replace leet characters
  s = s.replace(/[013456789@$!|+(]/g, (c) => LEET_MAP[c] ?? c);

  // Remove separators between individual letters (e.g. n-i-g-g-e-r, n.i.g.g.e.r)
  // Match single chars separated by punctuation/space
  s = s.replace(/([a-z])([\s.\-_*\\/#|,;:]{1,3}(?=[a-z]))/g, '$1');

  // Collapse consecutive duplicate characters (>2) to 2 (handles "fuuuuck" → "fuuck")
  s = s.replace(/(.)\1{2,}/g, '$1$1');

  return s;
}

/**
 * Strip all non-letter, non-digit chars for a more aggressive match pass.
 */
function strip(text) {
  return text.replace(/[^a-z0-9]/g, '');
}

function squeezeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// ─── Core Scanner ─────────────────────────────────────────────────────────────

/**
 * Scan a message string against the enabled categories.
 *
 * @param {string} content        Raw message content
 * @param {string[]} enabledCats  Array of category ids that are toggled on
 * @returns {{ triggered: boolean, category: string|null, matchedTerm: string|null }}
 */
function scanMessage(content, enabledCats) {
  if (!content || !enabledCats.length) return { triggered: false, category: null, matchedTerm: null };

  const norm = normalise(content);
  const stripped = strip(norm);
  const squeezed = squeezeWhitespace(norm);
  const compact = squeezeWhitespace(content.toLowerCase());

  for (const catId of enabledCats) {
    const cat = CATEGORIES[catId];
    if (!cat) continue;

    for (const pattern of cat.patterns) {
      if (pattern instanceof RegExp) {
        // Test against normalised content and also original (lower) for URL patterns
        if (pattern.test(norm) || pattern.test(compact) || pattern.test(content.toLowerCase())) {
          return { triggered: true, category: catId, matchedTerm: pattern.toString() };
        }
      } else {
        const normPattern = normalise(pattern);
        const strippedPattern = strip(normalise(pattern));

        // 1. Word-boundary test on normalised content
        const wbRegex = new RegExp(`(?<![a-z])${escapeRegex(normPattern)}(?![a-z])`, 'i');
        if (wbRegex.test(norm)) {
          return { triggered: true, category: catId, matchedTerm: pattern };
        }

        // 2. Stripped (no separators) test for separator-based bypasses only
        const usesSeparators = /[\s._-]/.test(pattern);
        if (usesSeparators && strippedPattern.length >= 6 && stripped.includes(strippedPattern)) {
          return { triggered: true, category: catId, matchedTerm: pattern };
        }

        if (normPattern.length >= 6 && squeezed.includes(normPattern)) {
          return { triggered: true, category: catId, matchedTerm: pattern };
        }
      }
    }
  }

  return { triggered: false, category: null, matchedTerm: null };
}

/** Escape a string for use in a RegExp. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return the list of all category ids.
 * @returns {string[]}
 */
function getCategoryIds() {
  return Object.keys(CATEGORIES);
}

/**
 * Return a human-readable label for a category.
 * @param {string} catId
 * @returns {string}
 */
function getCategoryLabel(catId) {
  return CATEGORIES[catId]?.label ?? catId;
}

/**
 * Default-enabled policy for a category.
 * @param {string} catId
 * @returns {boolean}
 */
function isCategoryEnabledByDefault(catId) {
  return DEFAULT_CATEGORY_STATES[catId] ?? true;
}

module.exports = {
  CATEGORIES,
  scanMessage,
  normalise,
  getCategoryIds,
  getCategoryLabel,
  isCategoryEnabledByDefault,
};
