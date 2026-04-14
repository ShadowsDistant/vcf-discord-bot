'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  userMention,
} = require('discord.js');
const db = require('./database');

const ECONOMY_FILE = 'bake_economy.json';
const PASSIVE_CAP_MS = 24 * 60 * 60 * 1000;
const MESSAGES_PER_PAGE = 8;
const MAX_PENDING_MESSAGES = 50;
const PENDING_MESSAGE_ID_MOD = 100_000;
let pendingMessageSequence = 0;
const MARKET_LISTING_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MARKET_FEE_RATE = 0.05;
const BASE_GOLDEN_CHANCE = 0.02;
const BURNT_BAKE_CHANCE = 0.08;
const BUILDING_SELL_REFUND_RATE = 0.5;
const BUILDING_COST_GROWTH = 1.18;
const VCF_PROFILE_TAG_CPS_BOOST = 0.05;
const VCF_PROFILE_TAG_MANUAL_CLICK_BONUS = 5;
const VCF_PROFILE_TAG_REGEX = /(^|[^a-z0-9])vcf([^a-z0-9]|$)/i;
const VCF_PROFILE_IDENTITY_GUILD_ID = '1345804368263385170';
const MAX_DISPLAYED_GIFT_BOXES = 6;
const GIFT_BOX_OPTION_PREFIX = 'gift:';
const BAKE_ADMIN_ROLE_ID = '1492510387579654205';
const DEFAULT_COOKIE_IMAGE = null;
const DEFAULT_COOKIE_EMOJI_STRING = '<:Plain_cookies:1492472701909205063>';
const SPECIAL_COOKIE_IDS = ['perfectcookie', 'goldcookie', 'spoopiercookie'];
const BAKE_EVENT_SPECIAL_COOKIE_HUNT = 'special_cookie_hunt';
const BAKE_EVENT_GOLDEN_FEVER = 'golden_fever';
const BAKE_EVENT_SUGAR_RUSH = 'sugar_rush';
const BAKE_EVENT_STEADY_HEAT = 'steady_heat';
const SPECIAL_COOKIE_EVENT_BOOST_CHANCE = 0.12;
const COOKIE_EVENT_DEFINITIONS = [
  {
    id: BAKE_EVENT_SPECIAL_COOKIE_HUNT,
    name: 'Special Cookie Hunt',
    description: 'Special cookie drops are boosted.',
    weight: 5,
  },
  {
    id: BAKE_EVENT_GOLDEN_FEVER,
    name: 'Golden Fever',
    description: 'Golden Cookie appearance chance is increased.',
    weight: 4,
  },
  {
    id: BAKE_EVENT_SUGAR_RUSH,
    name: 'Sugar Rush',
    description: 'Manual bake cookie gains are boosted.',
    weight: 4,
  },
  {
    id: BAKE_EVENT_STEADY_HEAT,
    name: 'Steady Heat',
    description: 'Burnt cookie chance is reduced.',
    weight: 3,
  },
];

const RARITY = {
  common: { id: 'common', name: 'Common', weight: 50, valueMultiplier: 1, color: 0xa3a3a3, emoji: DEFAULT_COOKIE_EMOJI_STRING },
  uncommon: { id: 'uncommon', name: 'Uncommon', weight: 25, valueMultiplier: 3, color: 0x57f287, emoji: '🟩' },
  rare: { id: 'rare', name: 'Rare', weight: 13, valueMultiplier: 10, color: 0x5865f2, emoji: '🟦' },
  epic: { id: 'epic', name: 'Epic', weight: 7, valueMultiplier: 30, color: 0x9b59b6, emoji: '🟪' },
  legendary: { id: 'legendary', name: 'Legendary', weight: 3.5, valueMultiplier: 100, color: 0xfee75c, emoji: '🟨' },
  mythic: { id: 'mythic', name: 'Mythic', weight: 1, valueMultiplier: 500, color: 0xed4245, emoji: '🟥' },
  celestial: { id: 'celestial', name: 'Celestial', weight: 0.4, valueMultiplier: 2500, color: 0x111111, emoji: '⬛' },
  secret: { id: 'secret', name: '???', weight: 0.1, valueMultiplier: 10000, color: 0x2b2d31, emoji: '❓' },
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'secret'];
const DEFAULT_UNLOCKED_RARITY_LABEL = ['common', 'uncommon'].map((rarityId) => RARITY[rarityId].name).join(' • ');
const RARITY_EMOJI_CANDIDATES = {
  common: ['common', 'cookie_common', 'bake_common', 'cc_common'],
  uncommon: ['uncommon', 'cookie_uncommon', 'bake_uncommon', 'cc_uncommon'],
  rare: ['rare', 'cookie_rare', 'bake_rare', 'cc_rare'],
  epic: ['epic', 'cookie_epic', 'bake_epic', 'cc_epic'],
  legendary: ['legendary', 'cookie_legendary', 'bake_legendary', 'cc_legendary'],
  mythic: ['mythic', 'cookie_mythic', 'bake_mythic', 'cc_mythic'],
  celestial: ['celestial', 'cookie_celestial', 'bake_celestial', 'cc_celestial'],
  secret: ['secret', 'cookie_secret', 'bake_secret', 'cc_secret'],
};

function normalizeEmojiName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

const STATIC_CUSTOM_EMOJIS_BY_CATEGORY = {
  upgrades: new Map([
    ['Fingers_crossed', '1492474335896666122'],
    ['Ladyfingers', '1492472620417941714'],
    ['Ritual_rolling_pins', '1492472343749071008'],
    ['Underworld_ovens', '1492472400657387630'],
    ['Gingerbread_trees', '1492472589698994276'],
    ['Ive_got_the_Midas_touch', '1492474459460993075'],
    ['Fortune_cookie', '1492472027695808572'],
    ['Golden_switch_off', '1492472122705055765'],
    ['Lucky_golden_clover', '1492472263583469628'],
    ['Golden_switch', '1492472120846848021'],
    ['Golden_cookie_sound', '1492472117873348648'],
    ['Kitten_helpers', '1492472253097578596'],
    ['Kitten_workers', '1492472260521492670'],
    ['Kitten_engineers', '1492472248140038166'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  cookies: new Map([
    ['Plain_cookies', '1492472701909205063'],
    ['Chocolate_chip_cookie', '1492471981273124915'],
    ['Oatmeal_raisin_cookies', '1492472677468737636'],
    ['Sugar_cookies', '1492472768304906291'],
    ['Butter_cookies', '1492472856389484636'],
    ['Shortbread_biscuits', '1492472742740623540'],
    ['Peanut_butter_cookies', '1492472690412490773'],
    ['Macadamia_nut_cookies', '1492472631952408618'],
    ['Maple_cookies', '1492472636066758766'],
    ['Cinnamon_cookies', '1492472535605055518'],
    ['Chocolate_oatmeal_cookies', '1492472529493950474'],
    ['Doublechip_cookies', '1492472560724738122'],
    ['Earl_Grey_cookies', '1492472564981829633'],
    ['French_pure_butter_cookies', '1492472582048448653'],
    ['Granola_cookies', '1492472599408676944'],
    ['Hazelnut_cookies', '1492472606245257297'],
    ['Icebox_cookies', '1492472613576900698'],
    ['Kolachy_cookies', '1492472618417258637'],
    ['Norwegian_cookies', '1492472675044556862'],
    ['Spritz_cookies', '1492472763040927795'],
    ['Caramel_cookies', '1492472510921310208'],
    ['Chocolate_macarons', '1492472528319418408'],
    ['Dalgona_cookies', '1492472552042532945'],
    ['Dragon_cookie', '1492472562314379484'],
    ['Eclipse_cookies', '1492472568437932132'],
    ['Frosted_sugar_cookies', '1492472583361400933'],
    ['Marshmallow_sandwich_cookies', '1492472639141187635'],
    ['Matcha_cookies', '1492472640718504026'],
    ['Ricotta_cookies', '1492472718166065153'],
    ['Ube_cookies', '1492472779952623696'],
    ['Ardent_heart_biscuits', '1492471802558152764'],
    ['Cosmic_chocolate_butter_biscuit', '1492472544446513172'],
    ['Dark_chocolate_butter_biscuit', '1492472553934032906'],
    ['Golden_heart_biscuits', '1492472595516358726'],
    ['Prism_heart_biscuits', '1492472704740364430'],
    ['Pure_heart_biscuits', '1492472709966332034'],
    ['Ruby_chocolate_butter_biscuit', '1492472733072756808'],
    ['White_chocolate_butter_biscuit', '1492472797119647805'],
    ['Raspberry_cheesecake_cookies', '1492472716102598756'],
    ['Zilla_wafers', '1492472811430744285'],
    ['Everybutter_biscuit', '1492472572451885116'],
    ['Eternal_heart_biscuits', '1492472571374076014'],
    ['Perforated_millefeuille_cosmos', '1492472303269970041'],
    ['Highdefinition_cookie', '1492472609990774884'],
    ['Flavor_text_cookie', '1492472578592477304'],
    ['Burnt_cookie', '1492472853168259173'],
    ['Birthday_cookie', '1492472832557322281'],
    ['PerfectCookie', '1492473120877973554'],
    ['GoldCookie', '1492473111914873014'],
    ['SpoopierCookie', '1492473129191342111'],
    ['Cookie_dough', '1492472541602775040'],
    ['Cookie_bars', '1492472539950088262'],
    ['Cookie_crumbs', '1492472540348809388'],
    ['Deepfried_cookie_dough', '1492472557587398847'],
    ['Cookie_egg', '1492471987799326861'],
    ['Faberge_egg', '1492472022188560525'],
    ['Century_egg', '1492471926138863807'],
    ['Golden_goose_egg', '1492472118451900477'],
    ['Dragon_egg', '1492471993281282091'],
    ['Cheated_cookies', '1492474178094370986'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  goldenCookies: new Map(),
  milk: new Map([
    ['Plain_milk', '1492472318126067722'],
    ['Banana_milk', '1492473599095865374'],
    ['Blueberry_milk', '1492473601427902557'],
    ['Caramel_milk', '1492473602669281381'],
    ['Chocolate_milk', '1492473605882122411'],
    ['Honey_milk', '1492473628690874408'],
    ['Lime_milk', '1492473652610859140'],
    ['Strawberry_milk', '1492473728066650272'],
    ['Vanilla_milk', '1492473730373517484'],
    ['Zebra_milk', '1492473732114026607'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  achievements: new Map([
    ['Plain_cookies', '1492472701909205063'],
    ['Chocolate_chip_cookie', '1492471981273124915'],
    ['Oatmeal_raisin_cookies', '1492472677468737636'],
    ['Sugar_cookies', '1492472768304906291'],
    ['Butter_cookies', '1492472856389484636'],
    ['Cookie_bars', '1492472539950088262'],
    ['Cookie_crumbs', '1492472540348809388'],
    ['Cookie_dough', '1492472541602775040'],
    ['Matcha_cookies', '1492472640718504026'],
    ['Golden_heart_biscuits', '1492472595516358726'],
    ['GoldCookie', '1492473111914873014'],
    ['Dragon_cookie', '1492472562314379484'],
    ['Golden_goose_egg', '1492472118451900477'],
    ['Spritz_cookies', '1492472763040927795'],
    ['Hazelnut_cookies', '1492472606245257297'],
    ['Kolachy_cookies', '1492472618417258637'],
    ['PerfectCookie', '1492473120877973554'],
    ['Cursor_64px', '1492475174136840223'],
    ['Factory_new', '1492475175906840757'],
    ['Fractal_engine', '1492475181128487035'],
    ['Idleverse', '1492475186610438176'],
    ['Fortune_cookie', '1492472027695808572'],
    ['Lucky_golden_clover', '1492472263583469628'],
    ['Golden_cookie_sound', '1492472117873348648'],
    ['Golden_switch', '1492472120846848021'],
    ['Fortune_you', '1492472057341149275'],
    ['Zebra_milk', '1492473732114026607'],
    ['You', '1492475208261439549'],
    ['Grandmas', '1492475182613528606'],
    ['Chancemaker', '1492475170336805016'],
    ['Cortex_Baker', '1492475171720790096'],
    ['CookieProduction2', '1492474231311695962'],
    ['CookieProduction5', '1492474234922864820'],
    ['CookieProduction6', '1492474236395327580'],
    ['CookieProduction10', '1492474243458269404'],
    ['CookieProduction16', '1492474261221146755'],
    ['CookieProduction20', '1492474267881705594'],
    ['CookieProduction30', '1492474280162627664'],
    ['CookieProduction40', '1492474298240077835'],
    ['CookieProduction48', '1492474309674008707'],
    ['Finance_headquarters', '1492474332356804779'],
    ['International_exchange', '1492474432763985940'],
    ['Palace_of_Greed', '1492474539102306324'],
    ['Botany_enthusiast', '1492474117868224612'],
    ['Keeper_of_the_conservatory', '1492474488489513000'],
    ['Polymath', '1492474575043170426'],
    ['Magnum_Opus', '1492474505312997418'],
    ['Paid_in_full', '1492474537739030659'],
    ['New_world_order', '1492474528209571990'],
    ['Praise_the_sun', '1492474578461659226'],
    ['All_the_stars_in_heaven', '1492474028026368123'],
    ['Labor_of_love', '1492474492952510604'],
    ['hammer_wrench', '1493251186462167090'],
    ['trophy', '1493252053303038092'],
    ['And_beyond', '1492474029246779554'],
    ['Ecumenopolis', '1492474325217972287'],
    ['Builder', '1492474119080378448'],
    ['Engineer', '1492474328204185762'],
    ['Architect', '1492474032048701600'],
    ['Augmenter', '1492474059496230923'],
    ['Enhancer', '1492474329429053470'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  buildings: new Map([
    ['Alchemylab', '1492475165076881539'],
    ['Antim', '1492475165941039155'],
    ['Bank', '1492475168793038999'],
    ['Chancemaker', '1492475170336805016'],
    ['Cortex_Baker', '1492475171720790096'],
    ['Cursor_64px', '1492475174136840223'],
    ['Factory_new', '1492475175906840757'],
    ['Farm', '1492475177215201320'],
    ['Fractal_engine', '1492475181128487035'],
    ['Grandmas', '1492475182613528606'],
    ['Idleverse', '1492475186610438176'],
    ['Javascript_console', '1492475187894161449'],
    ['Mine_new', '1492475192365289513'],
    ['Portal_new', '1492475193619386400'],
    ['Prism', '1492475194718159000'],
    ['Shipment_new', '1492475197544988722'],
    ['Temple', '1492475198430253146'],
    ['Timemachine_new', '1492475203987574965'],
    ['Wizardtower', '1492475206785044480'],
    ['You', '1492475208261439549'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
};

STATIC_CUSTOM_EMOJIS_BY_CATEGORY.ranks = new Map([
  ['cookie_novice', '1492474231311695962'],
  ['dough_scout', '1492474234922864820'],
  ['oven_knight', '1492474243458269404'],
  ['crumb_commander', '1492474261221146755'],
  ['sugar_overlord', '1492474267881705594'],
  ['cosmic_baker', '1492474280162627664'],
  ['stellar_confectioner', '1492474298240077835'],
  ['galactic_patissier', '1492474309674008707'],
  ['void_oven_archon', '1492474505312997418'],
].map(([name, id]) => [normalizeEmojiName(name), { name, id }]));

STATIC_CUSTOM_EMOJIS_BY_CATEGORY.rewardBoxes = new Map([
  ['starter_crate', '1492472832557322281'],
  ['crumb_bundle', '1492472540348809388'],
  ['bakery_supply_box', '1492472541602775040'],
  ['artisan_cache', '1492472716102598756'],
  ['golden_hamper', '1492472595516358726'],
  ['mythic_parcel', '1492472539950088262'],
  ['celestial_stash', '1492472118451900477'],
  ['grand_vault', '1492473120877973554'],
  ['lucky_crate', '1492473111914873014'],
  ['royal_hoard', '1492473129191342111'],
].map(([name, id]) => [normalizeEmojiName(name), { name, id }]));

const STATIC_EMOJI_CATEGORY_PRIORITY = ['ranks', 'rewardBoxes', 'upgrades', 'cookies', 'goldenCookies', 'milk', 'achievements', 'buildings'];

const BUILDING_EMOJI_ALIASES = {
  cursor: ['Cursor_64px'],
  grandma: ['Grandmas'],
  farm: ['Farm'],
  mine: ['Mine_new'],
  factory: ['Factory_new'],
  bank: ['Bank'],
  temple: ['Temple'],
  wizardTower: ['Wizardtower'],
  shipment: ['Shipment_new'],
  alchemyLab: ['Alchemylab'],
  portal: ['Portal_new'],
  timeMachine: ['Timemachine_new'],
  antimatterCondenser: ['Antim'],
  prism: ['Prism'],
  chancemaker: ['Chancemaker'],
  fractalEngine: ['Fractal_engine'],
  javascriptConsole: ['Javascript_console'],
  idleverse: ['Idleverse'],
  cortexBaker: ['Cortex_Baker'],
};

const ITEM_EMOJI_ALIASES = {};

const MILK_EMOJI_ALIASES = {
  plain: ['Plain_milk'],
  chocolate: ['Chocolate_milk'],
  strawberry: ['Strawberry_milk'],
  vanilla: ['Vanilla_milk'],
  honey: ['Honey_milk'],
  caramel: ['Caramel_milk'],
  banana: ['Banana_milk'],
  lime: ['Lime_milk'],
  blueberry: ['Blueberry_milk'],
  zebra: ['Zebra_milk'],
};

const ACHIEVEMENT_EMOJI_ALIASES = {
  baked_100: ['CookieProduction2'],
  baked_1k: ['CookieProduction5'],
  baked_10k: ['CookieProduction10'],
  baked_100k: ['CookieProduction20'],
  baked_1m: ['CookieProduction40'],
  spend_10k: ['Finance_headquarters'],
  spend_100k: ['International_exchange'],
  spend_1m: ['Palace_of_Greed'],
  discover_10: ['Botany_enthusiast'],
  discover_25: ['Keeper_of_the_conservatory'],
  discover_50: ['Polymath'],
  discover_all: ['Magnum_Opus'],
  cps_100: ['CookieProduction6'],
  cps_10k: ['CookieProduction16'],
  cps_1m: ['CookieProduction30'],
  cps_1b: ['CookieProduction48'],
  cps_1t: ['CookieProduction20'],
  market_10: ['Paid_in_full'],
  market_50: ['New_world_order'],
  market_200: ['Palace_of_Greed'],
  golden_10: ['Praise_the_sun'],
  golden_50: ['All_the_stars_in_heaven'],
  golden_100: ['Fortune_you'],
  bakery_named: ['Labor_of_love'],
  milk_1000: ['And_beyond'],
  one_of_each: ['Ecumenopolis'],
  single_50: ['Grandmas'],
  single_100: ['Chancemaker'],
  single_200: ['Cortex_Baker'],
  augmenter: ['Augmenter'],
  enhancer: ['Enhancer'],
  baked_10m: ['CookieProduction48'],
  spend_10m: ['New_world_order'],
  builder: ['Builder'],
  architect: ['Architect'],
  engineer: ['Engineer'],
};

const RANKS = [
  {
    id: 'cookie_novice',
    name: 'Cookie Novice',
    fallbackEmoji: '🥉',
    emojiAliases: ['cookie_novice', 'rank_cookie_novice', 'cc_rank_cookie_novice', 'CookieProduction2'],
    requirements: {},
    rewards: {},
  },
  {
    id: 'dough_scout',
    name: 'Dough Scout',
    fallbackEmoji: '🥈',
    emojiAliases: ['dough_scout', 'rank_dough_scout', 'cc_rank_dough_scout', 'CookieProduction5'],
    requirements: { totalBakes: 100, achievements: 1 },
    rewards: { cookies: 5000 },
  },
  {
    id: 'oven_knight',
    name: 'Oven Knight',
    fallbackEmoji: '🥇',
    emojiAliases: ['oven_knight', 'rank_oven_knight', 'cc_rank_oven_knight', 'CookieProduction10'],
    requirements: { totalBakes: 500, achievements: 5, totalBuildings: 10 },
    rewards: { cookies: 50000, forceGoldenCookie: true },
  },
  {
    id: 'crumb_commander',
    name: 'Crumb Commander',
    fallbackEmoji: '🏅',
    emojiAliases: ['crumb_commander', 'rank_crumb_commander', 'cc_rank_crumb_commander', 'CookieProduction16'],
    requirements: { totalBakes: 2500, achievements: 10, totalBuildings: 30 },
    rewards: { cookies: 250000, clickFrenzyCharges: 3 },
  },
  {
    id: 'sugar_overlord',
    name: 'Sugar Overlord',
    fallbackEmoji: '👑',
    emojiAliases: ['sugar_overlord', 'rank_sugar_overlord', 'cc_rank_sugar_overlord', 'CookieProduction20'],
    requirements: { totalBakes: 10000, achievements: 18, totalBuildings: 100 },
    rewards: { cookies: 1500000, forceGoldenCookie: true },
  },
  {
    id: 'cosmic_baker',
    name: 'Cosmic Baker',
    fallbackEmoji: '🌌',
    emojiAliases: ['cosmic_baker', 'rank_cosmic_baker', 'cc_rank_cosmic_baker', 'CookieProduction30'],
    requirements: { totalBakes: 50000, achievements: 28, totalBuildings: 250 },
    rewards: { cookies: 10000000, unlockTier: 'mythic' },
  },
  {
    id: 'stellar_confectioner',
    name: 'Stellar Confectioner',
    fallbackEmoji: '🌠',
    emojiAliases: ['stellar_confectioner', 'rank_stellar_confectioner', 'cc_rank_stellar_confectioner', 'CookieProduction40'],
    requirements: { totalBakes: 125000, achievements: 34, totalBuildings: 400, cookiesBakedAllTime: 100000000 },
    rewards: { cookies: 50000000, forceGoldenCookie: true },
  },
  {
    id: 'galactic_patissier',
    name: 'Galactic Patissier',
    fallbackEmoji: '🪐',
    emojiAliases: ['galactic_patissier', 'rank_galactic_patissier', 'cc_rank_galactic_patissier', 'CookieProduction48'],
    requirements: { totalBakes: 300000, achievements: 40, totalBuildings: 700, cookiesBakedAllTime: 1000000000 },
    rewards: { cookies: 250000000, clickFrenzyCharges: 6, unlockTier: 'celestial' },
  },
  {
    id: 'void_oven_archon',
    name: 'Void Oven Archon',
    fallbackEmoji: '🕳️',
    emojiAliases: ['void_oven_archon', 'rank_void_oven_archon', 'cc_rank_void_oven_archon', 'Magnum_Opus'],
    requirements: { totalBakes: 750000, achievements: 45, totalBuildings: 1200, cookiesBakedAllTime: 10000000000 },
    rewards: { cookies: 1000000000, forceGoldenCookie: true, clickFrenzyCharges: 10 },
  },
];

const RANK_INDEX = new Map(RANKS.map((rank, index) => [rank.id, index]));
const GUIDE_SECTIONS = [
  { id: 'info', label: 'Game Info', description: 'Core gameplay loops, systems, and progression overview.' },
  { id: 'gifts', label: 'Gift Codex', description: 'Reward gift box types and potential drops.' },
  { id: 'cookies', label: 'Cookie Codex', description: 'Cookie item rarities, values, and drop rates.' },
  { id: 'achievements', label: 'Achievements Codex', description: 'Achievement unlocks and milestone goals.' },
  { id: 'buildings', label: 'Building Codex', description: 'Building stats, costs, and CPS baselines.' },
  { id: 'milk', label: 'Milk Codex', description: 'Milk tiers and their scaling bonuses.' },
  { id: 'upgrades', label: 'Upgrade Codex', description: 'Upgrade catalog with effects and categories.' },
  { id: 'ranks', label: 'Rank Codex', description: 'Rank requirements and reward tracks.' },
];

const TIER_UNLOCKS = {
  rare: (u) => u.totalBakes >= 500 || u.unlockedTiers.includes('rare'),
  epic: (u) => (u.totalBakes >= 2500 && getTotalBuildingsOwned(u) >= 10) || u.unlockedTiers.includes('epic'),
  legendary: (u) => (u.totalBakes >= 10000 && getTotalBuildingsOwned(u) >= 50) || u.unlockedTiers.includes('legendary'),
  mythic: (u) => (u.totalBakes >= 50000 && getTotalBuildingsOwned(u) >= 200 && u.milestones.length >= 5) || u.unlockedTiers.includes('mythic'),
  celestial: (u) => (u.totalBakes >= 250000 && getTotalBuildingsOwned(u) >= 500 && u.milestones.length >= 20) || u.unlockedTiers.includes('celestial'),
};

const BAKERY_LEADERBOARD_METRICS = [
  { id: 'cookies', label: 'Most Cookies', description: 'Current cookie balance' },
  { id: 'cps', label: 'Most CPS', description: 'Current cookies per second' },
  { id: 'lifetime', label: 'Most Lifetime Cookies', description: 'Total cookies baked all-time' },
  { id: 'special', label: 'Most Special Cookies', description: 'Perfect/Gold/Spoopier cookie total' },
];

const BUILDINGS = [
  { id: 'cursor', name: 'Cursor', baseCost: 15, baseCps: 0.1, description: 'Autoclicks once every 10 seconds.' },
  { id: 'grandma', name: 'Grandma', baseCost: 100, baseCps: 1, description: 'A nice grandma to bake more cookies.' },
  { id: 'farm', name: 'Farm', baseCost: 1100, baseCps: 8, description: 'Grows cookie plants from cookie seeds.' },
  { id: 'mine', name: 'Mine', baseCost: 12000, baseCps: 47, description: 'Mines out cookie dough and chocolate chips.' },
  { id: 'factory', name: 'Factory', baseCost: 130000, baseCps: 260, description: 'Produces large quantities of cookies.' },
  { id: 'bank', name: 'Bank', baseCost: 1400000, baseCps: 1400, description: 'Generates cookies from interest.' },
  { id: 'temple', name: 'Temple', baseCost: 20000000, baseCps: 7800, description: 'Full of praying grandmas.' },
  { id: 'wizardTower', name: 'Wizard Tower', baseCost: 330000000, baseCps: 44000, description: 'Conjures cookies with magic spells.' },
  { id: 'shipment', name: 'Shipment', baseCost: 5100000000, baseCps: 260000, description: 'Brings in fresh cookies from the cookie planet.' },
  { id: 'alchemyLab', name: 'Alchemy Lab', baseCost: 75000000000, baseCps: 1600000, description: 'Turns gold into cookies.' },
  { id: 'portal', name: 'Portal', baseCost: 1000000000000, baseCps: 10000000, description: 'Opens a door to the Cookieverse.' },
  { id: 'timeMachine', name: 'Time Machine', baseCost: 14000000000000, baseCps: 65000000, description: 'Brings cookies from the past.' },
  { id: 'antimatterCondenser', name: 'Antimatter Condenser', baseCost: 170000000000000, baseCps: 430000000, description: 'Condenses antimatter into cookies.' },
  { id: 'prism', name: 'Prism', baseCost: 2100000000000000, baseCps: 2900000000, description: 'Converts light into cookies.' },
  { id: 'chancemaker', name: 'Chancemaker', baseCost: 26000000000000000, baseCps: 21000000000, description: 'Generates cookies from pure luck.' },
  { id: 'fractalEngine', name: 'Fractal Engine', baseCost: 310000000000000000, baseCps: 150000000000, description: 'Builds cookies from nested cookie dimensions.' },
  { id: 'javascriptConsole', name: 'Javascript Console', baseCost: 71000000000000000000, baseCps: 1100000000000, description: 'Creates cookies from the source code of the universe.' },
  { id: 'idleverse', name: 'Idleverse', baseCost: 12000000000000000000000, baseCps: 8300000000000, description: 'Hijacks idle universes for cookie production.' },
  { id: 'cortexBaker', name: 'Cortex Baker', baseCost: 1900000000000000000000000, baseCps: 64000000000000, description: 'A giant brain that thinks cookies into existence.' },
];

const BUILDING_MAP = new Map(BUILDINGS.map((b) => [b.id, b]));

const UPGRADES = [
  { id: 'fingers_crossed', name: 'Fingers Crossed', category: 'baking', cost: 100, effect: '+1 manual bake', unlockedWhen: (u) => u.totalBakes >= 25 },
  { id: 'ladyfingers', name: 'Ladyfingers', category: 'baking', cost: 500, effect: '+3 manual bake', unlockedWhen: (u) => u.totalBakes >= 250 },
  { id: 'ritual_rolling_pins', name: 'Ritual Rolling Pins', category: 'baking', cost: 5000, effect: '+0.5% of CPS to manual bake', unlockedWhen: (u) => getTotalBuildingsOwned(u) >= 10 },
  { id: 'underworld_ovens', name: 'Underworld Ovens', category: 'building', cost: 1000, effect: '2x Grandma CPS', buildingId: 'grandma', multiplier: 2, unlockedWhen: (u) => (u.buildings.grandma ?? 0) >= 1 },
  { id: 'gingerbread_trees', name: 'Gingerbread Trees', category: 'building', cost: 11000, effect: '2x Farm CPS', buildingId: 'farm', multiplier: 2, unlockedWhen: (u) => (u.buildings.farm ?? 0) >= 1 },
  { id: 'ive_got_the_midas_touch', name: "I've got the Midas touch", category: 'building', cost: 55000, effect: '2x Farm CPS', buildingId: 'farm', multiplier: 2, unlockedWhen: (u) => (u.buildings.farm ?? 0) >= 10 },
  { id: 'fortune_cookie', name: 'Fortune Cookie', category: 'global', cost: 125000, effect: '+10% CPS', globalMultiplier: 1.1, unlockedWhen: (u) => u.cookiesBakedAllTime >= 10000 },
  { id: 'golden_switch_off', name: 'Golden Switch Off', category: 'tier', cost: 45000, effect: 'Unlock Rare tier early', unlockTier: 'rare', unlockedWhen: (u) => u.totalBakes >= 100 },
  { id: 'lucky_golden_clover', name: 'Lucky Golden Clover', category: 'tier', cost: 500000, effect: 'Unlock Epic tier early', unlockTier: 'epic', unlockedWhen: (u) => u.totalBakes >= 1000 },
  { id: 'golden_switch', name: 'Golden Switch', category: 'golden', cost: 20000, effect: '+1% Golden Cookie chance', goldenChanceBonus: 0.01, unlockedWhen: (u) => u.goldenCookiesTriggered >= 3 },
  { id: 'golden_cookie_sound', name: 'Golden Cookie Sound', category: 'golden', cost: 250000, effect: '+5s Golden Cookie timer', goldenDurationBonusMs: 5000, unlockedWhen: (u) => u.goldenCookiesClaimed >= 10 },
  { id: 'kitten_helpers', name: 'Kitten Helpers', category: 'kitten', cost: 9000, effect: 'Milk gives +10% more CPS scaling', kittenScale: 0.1, unlockedWhen: (u) => u.milkLevel >= 100 },
  { id: 'kitten_workers', name: 'Kitten Workers', category: 'kitten', cost: 90000, effect: 'Milk gives +12% more CPS scaling', kittenScale: 0.12, unlockedWhen: (u) => u.milkLevel >= 200 },
  { id: 'kitten_engineers', name: 'Kitten Engineers', category: 'kitten', cost: 900000, effect: 'Milk gives +15% more CPS scaling', kittenScale: 0.15, unlockedWhen: (u) => u.milkLevel >= 300 },
  { id: 'kitten_supervisors', name: 'Kitten Supervisors', category: 'kitten', cost: 6500000, effect: 'Milk gives +18% more CPS scaling', kittenScale: 0.18, unlockedWhen: (u) => u.milkLevel >= 500 },
  { id: 'sugar_flux_capacitor', name: 'Sugar Flux Capacitor', category: 'global', cost: 1500000, effect: '+15% CPS', globalMultiplier: 1.15, unlockedWhen: (u) => u.totalBakes >= 5000 },
  { id: 'oven_overclock', name: 'Oven Overclock', category: 'global', cost: 25000000, effect: '+25% CPS', globalMultiplier: 1.25, unlockedWhen: (u) => getTotalBuildingsOwned(u) >= 150 },
  { id: 'quantum_farms', name: 'Quantum Farms', category: 'building', cost: 1750000, effect: '2x Farm CPS', buildingId: 'farm', multiplier: 2, unlockedWhen: (u) => (u.buildings.farm ?? 0) >= 25 },
  { id: 'prismatic_glazing', name: 'Prismatic Glazing', category: 'building', cost: 1750000000000000, effect: '2x Prism CPS', buildingId: 'prism', multiplier: 2, unlockedWhen: (u) => (u.buildings.prism ?? 0) >= 1 },
  { id: 'starforged_wrappers', name: 'Starforged Wrappers', category: 'golden', cost: 3500000, effect: '+2% Golden Cookie chance', goldenChanceBonus: 0.02, unlockedWhen: (u) => u.goldenCookiesClaimed >= 25 },
];

const UPGRADE_MAP = new Map(UPGRADES.map((u) => [u.id, u]));

const MILK_TYPES = [
  { pct: 0, type: 'Plain Milk' },
  { pct: 100, type: 'Chocolate Milk' },
  { pct: 200, type: 'Strawberry Milk' },
  { pct: 300, type: 'Vanilla Milk' },
  { pct: 400, type: 'Honey Milk' },
  { pct: 500, type: 'Caramel Milk' },
  { pct: 600, type: 'Banana Milk' },
  { pct: 700, type: 'Lime Milk' },
  { pct: 800, type: 'Blueberry Milk' },
  { pct: 900, type: 'Zebra Milk' },
];

const REWARD_BOXES = [
  {
    id: 'starter_crate',
    name: 'Starter Crate',
    emojiAliases: ['starter_crate'],
    rewards: [{ itemId: 'plain_cookies', min: 8, max: 16 }, { itemId: 'chocolate_chip_cookie', min: 4, max: 8 }, { itemId: 'sugar_cookies', min: 2, max: 6 }],
  },
  {
    id: 'crumb_bundle',
    name: 'Crumb Bundle',
    emojiAliases: ['crumb_bundle'],
    rewards: [{ itemId: 'cookie_crumbs', min: 2, max: 5 }, { itemId: 'cookie_bars', min: 1, max: 3 }, { itemId: 'butter_cookies', min: 4, max: 7 }],
  },
  {
    id: 'bakery_supply_box',
    name: 'Bakery Supply Box',
    emojiAliases: ['bakery_supply_box'],
    rewards: [{ itemId: 'cookie_dough', min: 1, max: 2 }, { itemId: 'doublechip_cookies', min: 3, max: 6 }, { itemId: 'earl_grey_cookies', min: 2, max: 5 }],
  },
  {
    id: 'artisan_cache',
    name: 'Artisan Cache',
    emojiAliases: ['artisan_cache'],
    rewards: [{ itemId: 'hazelnut_cookies', min: 3, max: 6 }, { itemId: 'spritz_cookies', min: 3, max: 6 }, { itemId: 'caramel_cookies', min: 2, max: 4 }],
  },
  {
    id: 'golden_hamper',
    name: 'Golden Hamper',
    emojiAliases: ['golden_hamper'],
    rewards: [{ itemId: 'golden_heart_biscuits', min: 1, max: 3 }, { itemId: 'birthday_cookie', min: 1, max: 2 }, { itemId: 'goldcookie', min: 1, max: 2 }],
  },
  {
    id: 'mythic_parcel',
    name: 'Mythic Parcel',
    emojiAliases: ['mythic_parcel'],
    rewards: [{ itemId: 'cookie_bars', min: 2, max: 5 }, { itemId: 'cookie_dough', min: 2, max: 4 }, { itemId: 'deepfried_cookie_dough', min: 1, max: 3 }],
  },
  {
    id: 'celestial_stash',
    name: 'Celestial Stash',
    emojiAliases: ['celestial_stash'],
    rewards: [{ itemId: 'century_egg', min: 1, max: 2 }, { itemId: 'golden_goose_egg', min: 1, max: 2 }, { itemId: 'dragon_egg', min: 1, max: 1 }],
  },
  {
    id: 'grand_vault',
    name: 'Grand Vault',
    emojiAliases: ['grand_vault'],
    rewards: [{ itemId: 'perfectcookie', min: 1, max: 2 }, { itemId: 'spoopiercookie', min: 1, max: 2 }, { itemId: 'highdefinition_cookie', min: 1, max: 2 }],
  },
  {
    id: 'lucky_crate',
    name: 'Lucky Crate',
    emojiAliases: ['lucky_crate'],
    rewards: [{ itemId: 'goldcookie', min: 1, max: 2 }, { itemId: 'golden_heart_biscuits', min: 1, max: 3 }, { itemId: 'cookie_egg', min: 1, max: 2 }],
  },
  {
    id: 'royal_hoard',
    name: 'Royal Hoard',
    emojiAliases: ['royal_hoard'],
    rewards: [{ itemId: 'perfectcookie', min: 1, max: 3 }, { itemId: 'goldcookie', min: 1, max: 3 }, { itemId: 'dragon_egg', min: 1, max: 2 }],
  },
];
const REWARD_BOX_MAP = new Map(REWARD_BOXES.map((box) => [box.id, box]));

const ACHIEVEMENTS = [
  { id: 'baked_100', name: 'Warm-up Batch', desc: 'Bake 100 cookies.', check: (u) => u.cookiesBakedAllTime >= 100 },
  { id: 'baked_1k', name: 'Cookie Cadet', desc: 'Bake 1,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 1000 },
  { id: 'baked_10k', name: 'Dough Enthusiast', desc: 'Bake 10,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 10000 },
  { id: 'baked_100k', name: 'Factory Fresh', desc: 'Bake 100,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 100000 },
  { id: 'baked_1m', name: 'Crumbocalypse', desc: 'Bake 1,000,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 1000000 },
  { id: 'baked_10m', name: 'Cookie Cataclysm', desc: 'Bake 10,000,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 10000000 },
  { id: 'spend_10k', name: 'Retail Therapy', desc: 'Spend 10,000 cookies.', check: (u) => u.cookiesSpent >= 10000 },
  { id: 'spend_100k', name: 'Cookie Investor', desc: 'Spend 100,000 cookies.', check: (u) => u.cookiesSpent >= 100000 },
  { id: 'spend_1m', name: 'Big Dough Energy', desc: 'Spend 1,000,000 cookies.', check: (u) => u.cookiesSpent >= 1000000 },
  { id: 'spend_10m', name: 'Capital Crumbs', desc: 'Spend 10,000,000 cookies.', check: (u) => u.cookiesSpent >= 10000000 },
  { id: 'builder', name: 'Builder', desc: 'Own at least 20 total buildings.', check: (u) => getTotalBuildingsOwned(u) >= 20 },
  { id: 'architect', name: 'Architect', desc: 'Own at least 50 total buildings.', check: (u) => getTotalBuildingsOwned(u) >= 50 },
  { id: 'engineer', name: 'Engineer', desc: 'Own at least 100 total buildings.', check: (u) => getTotalBuildingsOwned(u) >= 100 },
  { id: 'augmenter', name: 'Augmenter', desc: 'Purchase 5 upgrades.', check: (u) => (u.upgrades ?? []).length >= 5 },
  { id: 'enhancer', name: 'Enhancer', desc: 'Purchase 10 upgrades.', check: (u) => (u.upgrades ?? []).length >= 10 },
  { id: 'discover_10', name: 'Sampler Plate', desc: 'Discover 10 unique items.', check: (u) => u.uniqueItemsDiscovered.length >= 10 },
  { id: 'discover_25', name: 'Collector-ish', desc: 'Discover 25 unique items.', check: (u) => u.uniqueItemsDiscovered.length >= 25 },
  { id: 'discover_50', name: 'Museum Curator', desc: 'Discover 50 unique items.', check: (u) => u.uniqueItemsDiscovered.length >= 50 },
  { id: 'discover_all', name: 'Completionist Crumbs', desc: 'Discover all public items.', check: (u) => u.uniqueItemsDiscovered.length >= ITEMS.filter((i) => i.rarity !== 'secret').length },
  { id: 'cps_100', name: 'Steam Oven', desc: 'Reach 100 CPS.', check: (u) => u.highestCps >= 100 },
  { id: 'cps_10k', name: 'Planetary Oven', desc: 'Reach 10,000 CPS.', check: (u) => u.highestCps >= 10000 },
  { id: 'cps_1m', name: 'Quantum Oven', desc: 'Reach 1,000,000 CPS.', check: (u) => u.highestCps >= 1000000 },
  { id: 'cps_1b', name: 'Reality Oven', desc: 'Reach 1,000,000,000 CPS.', check: (u) => u.highestCps >= 1000000000 },
  { id: 'cps_1t', name: 'Singularity Oven', desc: 'Reach 1,000,000,000,000 CPS.', check: (u) => u.highestCps >= 1000000000000 },
  { id: 'market_10', name: 'Bazaar Rookie', desc: 'Complete 10 marketplace transactions.', check: (u) => (u.marketplaceBuys + u.marketplaceSells) >= 10 },
  { id: 'market_50', name: 'Market Mogul', desc: 'Complete 50 marketplace transactions.', check: (u) => (u.marketplaceBuys + u.marketplaceSells) >= 50 },
  { id: 'market_200', name: 'Bazaar Baron', desc: 'Complete 200 marketplace transactions.', check: (u) => (u.marketplaceBuys + u.marketplaceSells) >= 200 },
  { id: 'golden_10', name: 'Sun Chaser', desc: 'Trigger 10 Golden Cookies.', check: (u) => u.goldenCookiesTriggered >= 10 },
  { id: 'golden_50', name: 'Solar Addict', desc: 'Trigger 50 Golden Cookies.', check: (u) => u.goldenCookiesTriggered >= 50 },
  { id: 'golden_100', name: 'Stellar Magnet', desc: 'Trigger 100 Golden Cookies.', check: (u) => u.goldenCookiesTriggered >= 100 },
  { id: 'bakery_named', name: 'Brand Identity', desc: 'Name your bakery.', check: (u) => u.bakeryName !== 'Unnamed Bakery' },
  { id: 'milk_1000', name: 'Dairy Singularity', desc: 'Reach 1,000% milk.', check: (u) => u.milkLevel >= 1000 },
  { id: 'one_of_each', name: 'Shopping Spree', desc: 'Own at least 1 of every building.', check: (u) => BUILDINGS.every((b) => (u.buildings[b.id] ?? 0) >= 1) },
  { id: 'single_50', name: 'Monobuild', desc: 'Own 50 of one building type.', check: (u) => BUILDINGS.some((b) => (u.buildings[b.id] ?? 0) >= 50) },
  { id: 'single_100', name: 'Monolith Bakery', desc: 'Own 100 of one building type.', check: (u) => BUILDINGS.some((b) => (u.buildings[b.id] ?? 0) >= 100) },
  { id: 'single_200', name: 'One Trick Tyrant', desc: 'Own 200 of one building type.', check: (u) => BUILDINGS.some((b) => (u.buildings[b.id] ?? 0) >= 200) },
];

const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

function buildItem(name, rarity, baseValue, flavorText, image = null, idOverride = null) {
  const id = idOverride ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return {
    id,
    name,
    rarity,
    baseValue,
    flavorText,
    image: image ?? DEFAULT_COOKIE_IMAGE,
  };
}

const ITEMS = [
  buildItem('Plain Cookies', 'common', 1, 'The classic baseline of every bakery.'),
  buildItem('Chocolate Chip Cookie', 'common', 2, 'A timeless cookie with reliable charm.'),
  buildItem('Oatmeal Raisin Cookies', 'common', 2, 'Surprisingly dependable and chewy.'),
  buildItem('Sugar Cookies', 'common', 2, 'Sweet geometry with sharp edges.'),
  buildItem('Butter Cookies', 'common', 2, 'Tiny buttery confidence boosters.'),
  buildItem('Shortbread Biscuits', 'common', 3, 'Crisp, rich, and snack-approved.'),
  buildItem('Peanut Butter Cookies', 'common', 3, 'Nutty comfort in circular form.'),
  buildItem('Macadamia Nut Cookies', 'common', 3, 'Crunchy status symbols.'),
  buildItem('Maple Cookies', 'common', 3, 'Syrupy warmth in cookie form.'),
  buildItem('Cinnamon Cookies', 'common', 3, 'Spiced and cozy.'),
  buildItem('Chocolate Oatmeal Cookies', 'uncommon', 4, 'A bolder oat-powered combo.'),
  buildItem('Doublechip Cookies', 'uncommon', 5, 'Double chips, double confidence.'),
  buildItem('Earl Grey Cookies', 'uncommon', 6, 'Tea-time elegance in crumbs.'),
  buildItem('French Pure Butter Cookies', 'uncommon', 6, 'Silky butter and crisp bite.'),
  buildItem('Granola Cookies', 'uncommon', 6, 'Crunch engineered for momentum.'),
  buildItem('Hazelnut Cookies', 'uncommon', 6, 'Nutty and refined.'),
  buildItem('Icebox Cookies', 'uncommon', 6, 'Cool-headed and consistent.'),
  buildItem('Kolachy Cookies', 'uncommon', 7, 'Jam-ready pastry precision.'),
  buildItem('Norwegian Cookies', 'uncommon', 7, 'Nordic snack excellence.'),
  buildItem('Spritz Cookies', 'uncommon', 8, 'Delicate loops with bite.'),
  buildItem('Caramel Cookies', 'rare', 10, 'Buttery caramel wrapped in crunch.'),
  buildItem('Chocolate Macarons', 'rare', 11, 'Elegant sugar architecture.'),
  buildItem('Dalgona Cookies', 'rare', 12, 'Sweet and sharply brittle.'),
  buildItem('Dragon Cookie', 'rare', 12, 'A legendary cookie with flair.'),
  buildItem('Eclipse Cookies', 'rare', 13, 'Dark and radiant at once.'),
  buildItem('Frosted Sugar Cookies', 'rare', 13, 'Colorful frosting perfection.'),
  buildItem('Marshmallow Sandwich Cookies', 'rare', 13, 'Soft center, serious crunch.'),
  buildItem('Matcha Cookies', 'rare', 13, 'Earthy and clean.'),
  buildItem('Ricotta Cookies', 'rare', 13, 'Rich, airy, and indulgent.'),
  buildItem('Ube Cookies', 'rare', 12, 'Vivid and sweetly unique.'),
  buildItem('Ardent Heart Biscuits', 'epic', 50, 'A blazing symbol of sugary devotion.'),
  buildItem('Cosmic Chocolate Butter Biscuit', 'epic', 40, 'Butter and cocoa from the stars.'),
  buildItem('Dark Chocolate Butter Biscuit', 'epic', 45, 'Smooth intensity in biscuit form.'),
  buildItem('Golden Heart Biscuits', 'epic', 60, 'Shiny, rich, and lucky.'),
  buildItem('Prism Heart Biscuits', 'epic', 55, 'Refracts flavor into color.'),
  buildItem('Pure Heart Biscuits', 'epic', 42, 'Clean sweetness, no compromise.'),
  buildItem('Ruby Chocolate Butter Biscuit', 'epic', 47, 'Gem-toned cocoa luxury.'),
  buildItem('White Chocolate Butter Biscuit', 'epic', 54, 'Sweet cream with buttery depth.'),
  buildItem('Raspberry Cheesecake Cookies', 'epic', 56, 'Dessert layered into one bite.'),
  buildItem('Zilla Wafers', 'epic', 50, 'Huge crunch energy.'),
  buildItem('Everybutter Biscuit', 'legendary', 100, 'Contains all known butter states.'),
  buildItem('Eternal Heart Biscuits', 'legendary', 120, 'A forever-snack from beyond time.'),
  buildItem('Perforated Millefeuille Cosmos', 'legendary', 130, 'Layered pastry at cosmic scale.'),
  buildItem('Highdefinition Cookie', 'legendary', 140, 'Rendered in impossible detail.'),
  buildItem('Flavor Text Cookie', 'legendary', 145, 'Self-aware and very descriptive.'),
  buildItem('Burnt Cookie', 'common', 0, 'A charred reminder to watch the oven timer.'),
  buildItem('Birthday Cookie', 'legendary', 155, 'Confetti-grade sugar celebration.'),
  buildItem('Perfect Cookie', 'legendary', 160, 'Mathematically flawless.', null, 'perfectcookie'),
  buildItem('Gold Cookie', 'legendary', 170, 'Pure gilded snack economics.', null, 'goldcookie'),
  buildItem('Spoopier Cookie', 'legendary', 200, 'Unsettlingly delicious.', null, 'spoopiercookie'),
  buildItem('Cookie Dough', 'mythic', 450, 'Unbaked potential with immense value.'),
  buildItem('Cookie Bars', 'mythic', 500, 'Dense, rich, and highly tradable.'),
  buildItem('Cookie Crumbs', 'mythic', 550, 'Tiny fragments of big power.'),
  buildItem('Deepfried Cookie Dough', 'mythic', 600, 'Dangerously tasty and volatile.'),
  buildItem('Cookie Egg', 'mythic', 650, 'An impossible confection relic.'),
  buildItem('Faberge Egg', 'mythic', 700, 'Ornate, rare, and absurdly valuable.'),
  buildItem('Century Egg', 'celestial', 2500, 'A relic from an older bake cycle.'),
  buildItem('Golden Goose Egg', 'celestial', 3000, 'A luck-charged economy catalyst.'),
  buildItem('Dragon Egg', 'celestial', 3500, 'Holds ancient oven heat.'),
  buildItem('Cheated Cookies', 'secret', 10000, 'The ledger says this should not exist.'),
];

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]));

const THEMES = {
  classic: { label: 'Classic', color: 0x5865f2 },
  dark_chocolate: { label: 'Dark Chocolate', color: 0x3d2a1f },
  mint: { label: 'Mint', color: 0x2ecc71 },
  strawberry: { label: 'Strawberry', color: 0xff6fa8 },
  golden: { label: 'Golden', color: 0xffd166 },
  void: { label: 'Void', color: 0x2b2d31 },
};

const TITLES = [
  { id: 'cookie_novice', name: 'Cookie Novice', cost: 5000 },
  { id: 'dough_magnate', name: 'Dough Magnate', cost: 500000 },
  { id: 'the_one_who_bakes', name: 'The One Who Bakes', cost: 50000000 },
];

function getDefaultGuildState() {
  return {
    users: {},
    itemStats: {},
    marketplace: { listings: [], nextListingId: 1 },
    settings: {
      adminLogChannelId: null,
      adminModRoleId: BAKE_ADMIN_ROLE_ID,
      goldenCookieDurationMs: 15000,
      bakeEvent: null,
    },
  };
}

function getDefaultUserState(userId) {
  const buildings = {};
  for (const building of BUILDINGS) buildings[building.id] = 0;
  return {
    userId,
    bakeryName: 'Unnamed Bakery',
    bakeryTheme: 'classic',
    bakeryEmoji: DEFAULT_COOKIE_EMOJI_STRING,
    title: RANKS[0].name,
    cookies: 0,
    cookiesBakedAllTime: 0,
    cookiesSpent: 0,
    totalBakes: 0,
    lastInteraction: Date.now(),
    lastPassiveElapsedMs: 0,
    lastPassiveGain: 0,
    buildings,
    upgrades: [],
    inventory: {},
    milestones: [],
    milkLevel: 0,
    uniqueItemsDiscovered: [],
    goldenCookiesTriggered: 0,
    goldenCookiesClaimed: 0,
    highestCps: 0,
    rarestItemId: null,
    unlockedTiers: [],
    activeBuffs: [],
    pendingGoldenCookie: null,
    firstTierBakes: {},
    marketplaceBuys: 0,
    marketplaceSells: 0,
    transactionHistory: [],
    consumedBoosts: [],
    rewardGifts: {},
    clickFrenzyCharges: 0,
    clickFrenzyExpiresAt: 0,
    forceGoldenCookieOnNextBake: false,
    isServerBooster: false,
    boosterCpsBoost: 0,
    hasVcfProfileTag: false,
    allianceBoostDetails: {
      rankBoost: 0,
      upgradeBoost: 0,
      allianceBoosterCount: 0,
      allianceBoosterBoost: 0,
      personalBoosterBoost: 0,
      totalAllianceBoost: 0,
    },
    bakeBanned: false,
    rankId: RANKS[0].id,
    rankRewardsClaimed: [RANKS[0].id],
  };
}

function readState() {
  return db.read(ECONOMY_FILE, {});
}

function writeState(data) {
  db.write(ECONOMY_FILE, data);
}

function getGuildState(data, guildId) {
  if (!data[guildId]) data[guildId] = getDefaultGuildState();
  return data[guildId];
}

function getUserState(guildState, userId) {
  if (!guildState.users[userId]) guildState.users[userId] = getDefaultUserState(userId);
  const user = guildState.users[userId];
  if (!Array.isArray(user.rankRewardsClaimed)) user.rankRewardsClaimed = [];
  if (typeof user.bakeBanned !== 'boolean') user.bakeBanned = false;
  if (!user.rewardGifts || typeof user.rewardGifts !== 'object') user.rewardGifts = {};
  if (!Array.isArray(user.pendingMessages)) user.pendingMessages = [];
  if (typeof user.isServerBooster !== 'boolean') user.isServerBooster = false;
  user.boosterCpsBoost = user.isServerBooster ? 0.1 : 0;
  if (typeof user.hasVcfProfileTag !== 'boolean') user.hasVcfProfileTag = false;
  if (!user.allianceBoostDetails || typeof user.allianceBoostDetails !== 'object') {
    user.allianceBoostDetails = {
      rankBoost: 0,
      upgradeBoost: 0,
      allianceBoosterCount: 0,
      allianceBoosterBoost: 0,
      personalBoosterBoost: user.boosterCpsBoost,
      totalAllianceBoost: Math.max(0, Number(user.allianceCpsBoost ?? 0)),
    };
  }
  if (!RANK_INDEX.has(user.rankId)) {
    const inferredIndex = getHighestUnlockedRankIndex(user);
    user.rankId = RANKS[inferredIndex].id;
    user.rankRewardsClaimed = RANKS.slice(0, inferredIndex + 1).map((rank) => rank.id);
  }
  if (!user.rankRewardsClaimed.includes(user.rankId)) {
    const rankIdx = RANK_INDEX.get(user.rankId) ?? 0;
    user.rankRewardsClaimed.push(...RANKS.slice(0, rankIdx + 1).map((rank) => rank.id));
    user.rankRewardsClaimed = [...new Set(user.rankRewardsClaimed)];
  }
  user.title = RANKS[RANK_INDEX.get(user.rankId) ?? 0].name;
  return user;
}

function nextPendingMessageId() {
  pendingMessageSequence = (pendingMessageSequence + 1) % PENDING_MESSAGE_ID_MOD;
  return (Date.now() * PENDING_MESSAGE_ID_MOD) + pendingMessageSequence;
}

function appendPendingMessage(user, messageData, idOverride) {
  if (!Array.isArray(user.pendingMessages)) user.pendingMessages = [];
  user.pendingMessages.push({
    id: Number.isInteger(idOverride) ? idOverride : nextPendingMessageId(),
    createdAt: new Date().toISOString(),
    claimed: false,
    ...messageData,
  });
  if (user.pendingMessages.length > MAX_PENDING_MESSAGES) {
    const firstClaimedIdx = user.pendingMessages.findIndex((m) => m.claimed);
    if (firstClaimedIdx >= 0) user.pendingMessages.splice(firstClaimedIdx, 1);
    else user.pendingMessages.shift();
  }
}

function buildRankRewardPendingMessage(rank) {
  return {
    type: 'rank_reward',
    from: 'Bakery System',
    title: `Rank unlocked: ${rank.name}`,
    message: 'Use /messages to claim your rank reward.',
    rankId: rank.id,
    rewards: { ...(rank.rewards ?? {}) },
  };
}

function cleanMarketplace(guildState, now = Date.now()) {
  guildState.marketplace.listings = (guildState.marketplace.listings ?? []).filter((listing) =>
    (now - listing.listedAt) < MARKET_LISTING_LIFETIME_MS);
}

function getTotalBuildingsOwned(user) {
  return Object.values(user.buildings).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

function getUnlockedRarities(user, now = new Date()) {
  const unlocked = new Set(['common', 'uncommon']);
  for (const tier of ['rare', 'epic', 'legendary', 'mythic', 'celestial']) {
    if (TIER_UNLOCKS[tier](user)) unlocked.add(tier);
  }
  const isMidnightMinute = now.getUTCHours() === 0 && now.getUTCMinutes() === 0;
  if ((isMidnightMinute && user.totalBakes >= 7777) || user.uniqueItemsDiscovered.length >= 60) {
    unlocked.add('secret');
  }
  return unlocked;
}

function getRarityForItem(itemId) {
  return ITEM_MAP.get(itemId)?.rarity ?? 'common';
}

function compareRarity(itemA, itemB) {
  const a = RARITY_ORDER.indexOf(getRarityForItem(itemA));
  const b = RARITY_ORDER.indexOf(getRarityForItem(itemB));
  return a - b;
}

function getBuildingPrice(buildingId, owned, quantity = 1) {
  const building = BUILDING_MAP.get(buildingId);
  if (!building) return null;
  let total = 0;
  for (let i = 0; i < quantity; i += 1) {
    total += building.baseCost * (BUILDING_COST_GROWTH ** (owned + i));
  }
  return Math.ceil(total);
}

function getBuildingSellValue(buildingId, owned, quantity = 1) {
  const building = BUILDING_MAP.get(buildingId);
  if (!building) return null;
  const safeOwned = Math.max(0, Math.floor(owned));
  const safeQuantity = Math.max(1, Math.min(Math.floor(quantity), safeOwned));
  if (safeOwned <= 0) return 0;
  let total = 0;
  for (let i = 0; i < safeQuantity; i += 1) {
    total += building.baseCost * (BUILDING_COST_GROWTH ** (safeOwned - 1 - i));
  }
  return Math.floor(total * BUILDING_SELL_REFUND_RATE);
}

function getUpgradeCategoryLabel(upgrade) {
  const category = String(upgrade?.category ?? '').trim().toLowerCase();
  if (!category) return 'General';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function getUpgradeEffectSummary(upgrade) {
  if (!upgrade) return 'No effect details available.';
  if (Number.isFinite(upgrade.multiplier) && upgrade.buildingId) {
    const building = BUILDING_MAP.get(upgrade.buildingId);
    return `Boosts **${building?.name ?? upgrade.buildingId}** production by **x${upgrade.multiplier}**.`;
  }
  if (Number.isFinite(upgrade.globalMultiplier)) {
    return `Boosts all building production by **+${Math.round((upgrade.globalMultiplier - 1) * 100)}%**.`;
  }
  if (Number.isFinite(upgrade.goldenChanceBonus)) {
    return `Increases Golden Cookie spawn chance by **+${(upgrade.goldenChanceBonus * 100).toFixed(1)}%**.`;
  }
  if (Number.isFinite(upgrade.goldenDurationBonusMs)) {
    return `Extends Golden Cookie claim window by **+${Math.round(upgrade.goldenDurationBonusMs / 1000)}s**.`;
  }
  if (Number.isFinite(upgrade.kittenScale)) {
    return `Adds **+${Math.round(upgrade.kittenScale * 100)}%** extra milk scaling to CPS bonuses.`;
  }
  if (upgrade.unlockTier && RARITY[upgrade.unlockTier]) {
    return `Unlocks **${RARITY[upgrade.unlockTier].name}** rarity earlier than normal progression.`;
  }
  return String(upgrade.effect ?? 'No effect details available.');
}

function hasUpgrade(user, upgradeId) {
  return user.upgrades.includes(upgradeId);
}

function getMilkType(milkPct) {
  let current = MILK_TYPES[0].type;
  for (const type of MILK_TYPES) {
    if (milkPct >= type.pct) current = type.type;
  }
  return current;
}

function getStaticCustomEmoji(candidates = []) {
  const normalizedCandidates = candidates.map(normalizeEmojiName).filter(Boolean);
  if (normalizedCandidates.length === 0) return null;
  for (const category of STATIC_EMOJI_CATEGORY_PRIORITY) {
    const categoryMap = STATIC_CUSTOM_EMOJIS_BY_CATEGORY[category];
    if (!categoryMap) continue;
    for (const candidate of normalizedCandidates) {
      const match = categoryMap.get(candidate);
      if (match) return match;
    }
  }
  return null;
}

function getCustomGuildEmoji(guild, candidates = []) {
  const cache = guild?.emojis?.cache;
  const normalizedCandidates = candidates.map(normalizeEmojiName).filter(Boolean);
  if (normalizedCandidates.length === 0) return null;
  if (cache && cache.size > 0) {
    const normalizedByName = new Map(cache.map((emoji) => [normalizeEmojiName(emoji.name), emoji]));
    const matched = normalizedCandidates.map((name) => normalizedByName.get(name)).find(Boolean);
    if (matched) return `<${matched.animated ? 'a' : ''}:${matched.name}:${matched.id}>`;
  }
  const staticMatch = getStaticCustomEmoji(normalizedCandidates);
  if (!staticMatch) return null;
  return `<:${staticMatch.name}:${staticMatch.id}>`;
}

function getCookieFallbackEmoji(guild) {
  return getCustomGuildEmoji(guild, ['plain_cookie', 'plain_cookies', 'cookie', 'cookies', 'cc_cookie']) ?? DEFAULT_COOKIE_EMOJI_STRING;
}

function getCookieEmoji(guild) {
  return getCookieFallbackEmoji(guild);
}

function getRarityEmoji(rarityId, guild) {
  const rarity = RARITY[rarityId];
  if (!rarity) return getCookieFallbackEmoji(guild);
  const customEmoji = getCustomGuildEmoji(guild, RARITY_EMOJI_CANDIDATES[rarityId] ?? [rarityId]);
  return customEmoji ?? rarity.emoji;
}

function getItemEmoji(itemOrId, guild) {
  const item = typeof itemOrId === 'string' ? ITEM_MAP.get(itemOrId) : itemOrId;
  if (!item) return getCookieFallbackEmoji(guild);
  const customEmoji = getCustomGuildEmoji(guild, [
    item.id,
    item.name,
    `cookie_${item.id}`,
    `${item.id}_cookie`,
    `cc_${item.id}`,
    ...(ITEM_EMOJI_ALIASES[item.id] ?? []),
  ]);
  return customEmoji ?? getRarityEmoji(item.rarity, guild);
}

function getAchievementEmoji(achievementOrId, guild) {
  const achievement = typeof achievementOrId === 'string'
    ? ACHIEVEMENTS.find((entry) => entry.id === achievementOrId)
    : achievementOrId;
  if (!achievement) return getCookieFallbackEmoji(guild);
  const customEmoji = getCustomGuildEmoji(guild, [
    achievement.id,
    achievement.name,
    `achievement_${achievement.id}`,
    `cc_${achievement.id}`,
    ...(ACHIEVEMENT_EMOJI_ALIASES[achievement.id] ?? []),
  ]);
  return customEmoji ?? getCookieFallbackEmoji(guild);
}

function getEarnedAchievementIds(user) {
  // Milestones may contain legacy IDs from previous achievement sets; keep only currently defined achievements.
  return (user.milestones ?? []).filter((id) => ACHIEVEMENT_IDS.has(id));
}

function getEarnedAchievementCount(user) {
  return getEarnedAchievementIds(user).length;
}

function getMetricValue(user, metric) {
  if (metric === 'totalBakes') return user.totalBakes ?? 0;
  if (metric === 'achievements') return getEarnedAchievementCount(user);
  if (metric === 'totalBuildings') return getTotalBuildingsOwned(user);
  if (metric === 'cookiesBakedAllTime') return user.cookiesBakedAllTime ?? 0;
  return 0;
}

function getMetricLabel(metric) {
  if (metric === 'totalBakes') return 'Total bakes';
  if (metric === 'achievements') return 'Achievements';
  if (metric === 'totalBuildings') return 'Buildings owned';
  if (metric === 'cookiesBakedAllTime') return 'Lifetime cookies baked';
  return metric;
}

function rankRequirementsMet(user, rank) {
  return Object.entries(rank.requirements ?? {}).every(([metric, target]) => getMetricValue(user, metric) >= target);
}

function getHighestUnlockedRankIndex(user) {
  let highest = 0;
  for (let index = 0; index < RANKS.length; index += 1) {
    if (!rankRequirementsMet(user, RANKS[index])) break;
    highest = index;
  }
  return highest;
}

function formatRankRequirements(rank) {
  const entries = Object.entries(rank?.requirements ?? {});
  if (!entries.length) return 'No requirements.';
  return entries
    .map(([metric, target]) => `${getMetricLabel(metric)}: ${toCookieNumber(target)}`)
    .join('\n');
}

function formatRankReward(rank) {
  const rewards = rank?.rewards ?? {};
  const lines = [];
  if (rewards.cookies) lines.push(`+${toCookieNumber(rewards.cookies)} cookies`);
  if (rewards.forceGoldenCookie) lines.push('Guaranteed Golden Cookie on next bake');
  if (rewards.clickFrenzyCharges) lines.push(`+${rewards.clickFrenzyCharges} Click Frenzy charge(s)`);
  if (rewards.unlockTier && RARITY[rewards.unlockTier]) {
    lines.push(`Unlocks ${RARITY[rewards.unlockTier].name} tier drops (you can now roll ${RARITY[rewards.unlockTier].name} items while baking)`);
  }
  return lines.length ? lines.join('\n') : 'No one-time reward.';
}

function getActiveBakeEvent(guildState, nowTs = Date.now()) {
  const event = guildState.settings?.bakeEvent ?? null;
  if (!event) return null;
  if (typeof event.endsAt !== 'number' || event.endsAt <= nowTs) {
    guildState.settings.bakeEvent = null;
    return null;
  }
  return event;
}

function getRankProgressToNext(user) {
  const currentIndex = RANK_INDEX.get(user.rankId) ?? 0;
  const nextRank = RANKS[currentIndex + 1] ?? null;
  if (!nextRank) return { currentRank: RANKS[currentIndex], nextRank: null, current: 1, total: 1 };
  const requirementEntries = Object.entries(nextRank.requirements ?? {});
  if (!requirementEntries.length) return { currentRank: RANKS[currentIndex], nextRank, current: 1, total: 1 };
  const ratios = requirementEntries.map(([metric, target]) => {
    if (target <= 0) return 1;
    return Math.max(0, Math.min(1, getMetricValue(user, metric) / target));
  });
  const ratio = ratios.reduce((sum, value) => sum + value, 0) / requirementEntries.length;
  return { currentRank: RANKS[currentIndex], nextRank, current: Math.round(ratio * 100), total: 100 };
}

function applyRankRewards(user, rank) {
  const rewards = rank.rewards ?? {};
  if (rewards.cookies) {
    user.cookies += rewards.cookies;
  }
  if (rewards.forceGoldenCookie) user.forceGoldenCookieOnNextBake = true;
  if (rewards.clickFrenzyCharges) {
    user.clickFrenzyCharges = (user.clickFrenzyCharges ?? 0) + rewards.clickFrenzyCharges;
    user.clickFrenzyExpiresAt = Math.max(user.clickFrenzyExpiresAt ?? 0, Date.now() + 5 * 60 * 1000);
  }
  if (rewards.unlockTier && !user.unlockedTiers.includes(rewards.unlockTier)) user.unlockedTiers.push(rewards.unlockTier);
}

function syncUserRank(user, onRankUnlocked) {
  if (!RANK_INDEX.has(user.rankId)) user.rankId = RANKS[0].id;
  if (!Array.isArray(user.rankRewardsClaimed)) user.rankRewardsClaimed = [];
  const previousIndex = RANK_INDEX.get(user.rankId) ?? 0;
  const naturalIndex = getHighestUnlockedRankIndex(user);

  // If admin has forced a rank higher than what the user naturally earned,
  // respect the forced rank but still apply rewards for any newly unlocked
  // natural ranks below it.
  const adminForcedIndex = Number.isInteger(user.adminForcedRankIndex) ? user.adminForcedRankIndex : -1;
  const targetIndex = Math.max(naturalIndex, adminForcedIndex);

  // Clear the admin force flag once the user naturally reaches or exceeds it.
  if (adminForcedIndex >= 0 && naturalIndex >= adminForcedIndex) {
    delete user.adminForcedRankIndex;
  }

  const unlockedRanks = [];
  if (targetIndex > previousIndex) {
    for (let index = previousIndex + 1; index <= targetIndex; index += 1) {
      const rank = RANKS[index];
      if (!user.rankRewardsClaimed.includes(rank.id)) {
        user.rankRewardsClaimed.push(rank.id);
        if (typeof onRankUnlocked === 'function') onRankUnlocked(rank);
        unlockedRanks.push(rank);
      }
    }
  }
  user.rankId = RANKS[targetIndex].id;
  user.title = RANKS[targetIndex].name;
  return {
    currentRank: RANKS[targetIndex],
    unlockedRanks,
    nextRank: RANKS[targetIndex + 1] ?? null,
  };
}

function getRankEmoji(rankOrId, guild) {
  const rank = typeof rankOrId === 'string'
    ? RANKS.find((entry) => entry.id === rankOrId)
    : rankOrId;
  if (!rank) return '🏅';
  const custom = getCustomGuildEmoji(guild, [rank.id, rank.name, ...(rank.emojiAliases ?? [])]);
  return custom ?? rank.fallbackEmoji;
}

function getRewardBoxEmoji(rewardBoxOrId, guild) {
  const rewardBox = typeof rewardBoxOrId === 'string'
    ? REWARD_BOX_MAP.get(rewardBoxOrId)
    : rewardBoxOrId;
  if (!rewardBox) return '🎁';
  return getCustomGuildEmoji(guild, [rewardBox.id, rewardBox.name, ...(rewardBox.emojiAliases ?? [])]) ?? '🎁';
}

function getButtonEmoji(guild, candidates = [], fallback = DEFAULT_COOKIE_EMOJI_STRING) {
  const resolved = getCustomGuildEmoji(guild, candidates);
  const toButtonEmoji = (value) => {
    const match = /^<(a?):([^:>]+):(\d+)>$/.exec(value);
    if (match) return { animated: Boolean(match[1]), name: match[2], id: match[3] };
    return { name: value };
  };
  if (resolved) return toButtonEmoji(resolved);
  const cookieFallback = getCookieFallbackEmoji(guild);
  if (fallback === DEFAULT_COOKIE_EMOJI_STRING) return toButtonEmoji(cookieFallback);
  return { name: fallback };
}

function getGuidePageCount(sectionId) {
  const pageSize = 4;
  if (sectionId === 'info') return 1;
  if (sectionId === 'gifts') return Math.max(1, Math.ceil(REWARD_BOXES.length / pageSize));
  if (sectionId === 'cookies') return Math.max(1, Math.ceil(ITEMS.length / pageSize));
  if (sectionId === 'achievements') return Math.max(1, Math.ceil(ACHIEVEMENTS.length / pageSize));
  if (sectionId === 'buildings') return Math.max(1, Math.ceil(BUILDINGS.length / pageSize));
  if (sectionId === 'milk') return Math.max(1, Math.ceil(MILK_TYPES.length / pageSize));
  if (sectionId === 'upgrades') return Math.max(1, Math.ceil(UPGRADES.length / pageSize));
  if (sectionId === 'ranks') return Math.max(1, Math.ceil(RANKS.length / pageSize));
  return 1;
}

function formatMilkCodexBonus(milkPct) {
  return UPGRADES
    .filter((upgrade) => upgrade.category === 'kitten' && typeof upgrade.kittenScale === 'number')
    .map((upgrade) => `${upgrade.name}: +${(milkPct * upgrade.kittenScale).toFixed(1)}% CPS`)
    .join('\n');
}

function computeCps(user, nowTs = Date.now()) {
  let buildingCps = 0;
  for (const building of BUILDINGS) {
    const owned = user.buildings[building.id] ?? 0;
    let multiplier = 1;
    for (const upgradeId of user.upgrades) {
      const upgrade = UPGRADE_MAP.get(upgradeId);
      if (upgrade?.buildingId === building.id && typeof upgrade.multiplier === 'number') {
        multiplier *= upgrade.multiplier;
      }
    }
    for (const buff of user.activeBuffs) {
      if (buff.type === 'buildingSpecial' && buff.buildingId === building.id && buff.expiresAt > nowTs) {
        multiplier *= 2;
      }
    }
    buildingCps += owned * building.baseCps * multiplier;
  }

  let globalMultiplier = 1;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.globalMultiplier) globalMultiplier *= upgrade.globalMultiplier;
  }

  const milkLevel = getEarnedAchievementCount(user) * 4;
  user.milkLevel = milkLevel;
  let kittenBonus = 0;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.kittenScale) kittenBonus += (milkLevel / 100) * upgrade.kittenScale;
  }

  const consumedBonus = (user.consumedBoosts ?? [])
    .filter((boost) => boost.expiresAt > nowTs)
    .reduce((sum, boost) => sum + boost.cpsBonus, 0);
  user.consumedBoosts = (user.consumedBoosts ?? []).filter((boost) => boost.expiresAt > nowTs);

  const frenzy = (user.activeBuffs ?? []).find((buff) => buff.type === 'frenzy' && buff.expiresAt > nowTs);
  const frenzyMultiplier = frenzy ? 7 : 1;

  const allianceBoost = Math.max(0, Number(user.allianceCpsBoost ?? 0));
  const boosterBoost = Math.max(0, Number(user.boosterCpsBoost ?? 0));
  const vcfTagBoost = user.hasVcfProfileTag ? VCF_PROFILE_TAG_CPS_BOOST : 0;
  const total = (buildingCps + consumedBonus) * globalMultiplier * (1 + kittenBonus) * frenzyMultiplier * (1 + allianceBoost + boosterBoost + vcfTagBoost);
  user.highestCps = Math.max(user.highestCps ?? 0, total);
  return total;
}

function setAllianceCpsBoostBatch(guildId, boosts = []) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  for (const entry of boosts) {
    const userId = String(entry?.userId ?? '');
    if (!userId) continue;
    const user = getUserState(guildState, userId);
    user.allianceCpsBoost = Math.max(0, Number(entry?.boost) || 0);
    const details = entry?.details ?? {};
    user.allianceBoostDetails = {
      rankBoost: Math.max(0, Number(details.rankBoost) || 0),
      upgradeBoost: Math.max(0, Number(details.upgradeBoost) || 0),
      allianceBoosterCount: Math.max(0, Number(details.allianceBoosterCount) || 0),
      allianceBoosterBoost: Math.max(0, Number(details.allianceBoosterBoost) || 0),
      personalBoosterBoost: Math.max(0, Number(details.personalBoosterBoost ?? user.boosterCpsBoost) || 0),
      totalAllianceBoost: Math.max(0, Number(details.totalAllianceBoost ?? entry?.boost) || 0),
    };
  }
  writeState(data);
}

function setUserAllianceCpsBoost(guildId, userId, boost, details = null) {
  setAllianceCpsBoostBatch(guildId, [{
    userId,
    boost,
    details: details ?? {},
  }]);
}

function setUserBoosterStatus(guildId, userId, isBooster) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  user.isServerBooster = Boolean(isBooster);
  user.boosterCpsBoost = user.isServerBooster ? 0.1 : 0;
  if (!user.allianceBoostDetails || typeof user.allianceBoostDetails !== 'object') {
    user.allianceBoostDetails = {};
  }
  user.allianceBoostDetails.personalBoosterBoost = user.boosterCpsBoost;
  writeState(data);
}

function hasVcfProfileTag(...values) {
  return values.some((value) => typeof value === 'string' && VCF_PROFILE_TAG_REGEX.test(value));
}

function inferVcfProfileTagStatus(memberLike, userLike = null) {
  const identityGuildId = String(
    memberLike?.user?.primaryGuild?.identityGuildId
    ?? memberLike?.primaryGuild?.identityGuildId
    ?? userLike?.primaryGuild?.identityGuildId
    ?? memberLike?.user?.primary_guild?.identity_guild_id
    ?? memberLike?.primary_guild?.identity_guild_id
    ?? userLike?.primary_guild?.identity_guild_id
    ?? memberLike?.user?._data?.primaryGuild?.identityGuildId
    ?? memberLike?._data?.primaryGuild?.identityGuildId
    ?? userLike?._data?.primaryGuild?.identityGuildId
    ?? memberLike?.user?._data?.primary_guild?.identity_guild_id
    ?? memberLike?._data?.primary_guild?.identity_guild_id
    ?? userLike?._data?.primary_guild?.identity_guild_id
    ?? '',
  ).trim();
  if (identityGuildId === VCF_PROFILE_IDENTITY_GUILD_ID) return true;

  return hasVcfProfileTag(
    memberLike?.displayName,
    memberLike?.nickname,
    memberLike?.nick,
    memberLike?.user?.username,
    memberLike?.user?.globalName,
    userLike?.username,
    userLike?.globalName,
    userLike?.tag,
  );
}

function setUserVcfTagStatus(guildId, userId, hasVcfTag) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  user.hasVcfProfileTag = Boolean(hasVcfTag);
  writeState(data);
}

function applyPassiveIncome(user, nowTs = Date.now()) {
  const elapsed = Math.min(Math.max(0, nowTs - (user.lastInteraction ?? nowTs)), PASSIVE_CAP_MS);
  const cps = computeCps(user, nowTs);
  const gained = Math.floor((elapsed / 1000) * cps);
  if (gained > 0) {
    user.cookies += gained;
    user.cookiesBakedAllTime += gained;
  }
  user.lastInteraction = nowTs;
  user.lastPassiveElapsedMs = elapsed;
  user.lastPassiveGain = gained;
  user.activeBuffs = (user.activeBuffs ?? []).filter((buff) => buff.expiresAt > nowTs);
  return { elapsedMs: elapsed, gained, cps };
}

function weightedPickItem(user, nowDate = new Date()) {
  const unlocked = getUnlockedRarities(user, nowDate);
  const availableItems = ITEMS.filter((item) => unlocked.has(item.rarity));
  const rarityWeights = RARITY_ORDER
    .filter((rarity) => unlocked.has(rarity))
    .map((rarity) => ({ rarity, weight: RARITY[rarity].weight }));
  const totalWeight = rarityWeights.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedRarity = 'common';
  for (const entry of rarityWeights) {
    roll -= entry.weight;
    if (roll <= 0) {
      selectedRarity = entry.rarity;
      break;
    }
  }
  const pool = availableItems.filter((item) => item.rarity === selectedRarity);
  return pool[Math.floor(Math.random() * pool.length)] ?? availableItems[0];
}

function getRarityDropChance(user, rarityId, nowDate = new Date()) {
  if (!RARITY[rarityId]) return 0;
  const unlocked = getUnlockedRarities(user, nowDate);
  if (!unlocked.has(rarityId)) return 0;
  const rarityWeights = RARITY_ORDER
    .filter((rarity) => unlocked.has(rarity))
    .map((rarity) => RARITY[rarity].weight);
  const totalWeight = rarityWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return 0;
  return RARITY[rarityId].weight / totalWeight;
}

function getItemDropChance(user, itemOrId, nowDate = new Date()) {
  const item = typeof itemOrId === 'string' ? ITEM_MAP.get(itemOrId) : itemOrId;
  if (!item) return 0;
  if (item.id === 'burnt_cookie') return BURNT_BAKE_CHANCE;
  const unlocked = getUnlockedRarities(user, nowDate);
  if (!unlocked.has(item.rarity)) return 0;
  const rarityChance = getRarityDropChance(user, item.rarity, nowDate);
  const rarityPoolSize = ITEMS.filter((entry) => unlocked.has(entry.rarity) && entry.rarity === item.rarity).length;
  if (rarityPoolSize <= 0) return 0;
  return (1 - BURNT_BAKE_CHANCE) * (rarityChance / rarityPoolSize);
}

function getManualBakeYield(user, nowTs = Date.now()) {
  let base = 1;
  if (hasUpgrade(user, 'fingers_crossed')) base += 1;
  if (hasUpgrade(user, 'ladyfingers')) base += 3;
  if (user.hasVcfProfileTag) base += VCF_PROFILE_TAG_MANUAL_CLICK_BONUS;
  if (hasUpgrade(user, 'ritual_rolling_pins')) base += Math.floor(computeCps(user, nowTs) * 0.005);
  if (user.clickFrenzyCharges > 0 && user.clickFrenzyExpiresAt > nowTs) {
    user.clickFrenzyCharges -= 1;
    base *= 777;
    if (user.clickFrenzyCharges <= 0) user.clickFrenzyExpiresAt = 0;
  }
  return Math.max(1, Math.floor(base));
}

function registerItemBake(guildState, user, item, userId) {
  if (!guildState.itemStats[item.id]) {
    guildState.itemStats[item.id] = {
      itemId: item.id,
      rarity: item.rarity,
      baseValue: item.baseValue,
      totalInCirculation: 0,
      firstBakedBy: userId,
    };
  }
  guildState.itemStats[item.id].totalInCirculation += 1;
  if (!user.uniqueItemsDiscovered.includes(item.id)) user.uniqueItemsDiscovered.push(item.id);
  user.inventory[item.id] = (user.inventory[item.id] ?? 0) + 1;
  user.firstTierBakes[item.rarity] = true;
  if (!user.rarestItemId || compareRarity(user.rarestItemId, item.id) < 0) user.rarestItemId = item.id;
}

function evaluateAchievements(user) {
  const newlyEarned = [];
  const earned = new Set(user.milestones);
  for (const achievement of ACHIEVEMENTS) {
    if (!earned.has(achievement.id) && achievement.check(user)) {
      user.milestones.push(achievement.id);
      newlyEarned.push(achievement);
    }
  }
  user.milkLevel = user.milestones.length * 4;
  return newlyEarned;
}

function getGoldenChance(user) {
  let chance = BASE_GOLDEN_CHANCE;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.goldenChanceBonus) chance += upgrade.goldenChanceBonus;
  }
  return chance;
}

function createGoldenCookieState(user, settings, nowTs = Date.now()) {
  let durationMs = settings.goldenCookieDurationMs ?? 15000;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.goldenDurationBonusMs) durationMs += upgrade.goldenDurationBonusMs;
  }
  const token = `${nowTs}_${Math.floor(Math.random() * 1e7)}`;
  user.pendingGoldenCookie = { token, expiresAt: nowTs + durationMs, triggeredAt: nowTs };
  user.goldenCookiesTriggered += 1;
  return user.pendingGoldenCookie;
}

function bake(guildId, userId) {
  return db.update(ECONOMY_FILE, {}, (data) => {
    const guildState = getGuildState(data, guildId);
    cleanMarketplace(guildState);
    const user = getUserState(guildState, userId);
    const nowTs = Date.now();
    const previousEvent = guildState.settings?.bakeEvent ?? null;
    const activeEvent = getActiveBakeEvent(guildState, nowTs);
    const endedEvent = (!activeEvent && previousEvent && Number.isFinite(previousEvent.endsAt) && previousEvent.endsAt <= nowTs)
      ? { id: previousEvent.id, endsAt: previousEvent.endsAt }
      : null;
    const passive = applyPassiveIncome(user, nowTs);

    if (user.pendingGoldenCookie?.expiresAt <= nowTs) user.pendingGoldenCookie = null;

    const burntChance = activeEvent?.id === BAKE_EVENT_STEADY_HEAT ? BURNT_BAKE_CHANCE * 0.4 : BURNT_BAKE_CHANCE;
    const burnt = Math.random() < burntChance;
    const boostedYield = activeEvent?.id === BAKE_EVENT_SUGAR_RUSH
      ? Math.floor(getManualBakeYield(user, nowTs) * 1.2)
      : getManualBakeYield(user, nowTs);
    const yieldAmount = burnt ? 0 : boostedYield;
    user.cookies += yieldAmount;
    user.cookiesBakedAllTime += yieldAmount;
    user.totalBakes += 1;

    const burntItem = ITEM_MAP.get('burnt_cookie') ?? ITEMS[0];
    const unlockedRarities = getUnlockedRarities(user, new Date(nowTs));
    const boostedSpecialItemIds = SPECIAL_COOKIE_IDS
      .filter((itemId) => ITEM_MAP.has(itemId))
      .filter((itemId) => unlockedRarities.has(ITEM_MAP.get(itemId)?.rarity));
    const boostedEventRoll = activeEvent?.id === BAKE_EVENT_SPECIAL_COOKIE_HUNT
      && boostedSpecialItemIds.length > 0
      && Math.random() < SPECIAL_COOKIE_EVENT_BOOST_CHANCE;
    const boostedItemId = boostedEventRoll
      ? boostedSpecialItemIds[Math.floor(Math.random() * boostedSpecialItemIds.length)]
      : null;
    const item = burnt
      ? burntItem
      : (boostedItemId ? ITEM_MAP.get(boostedItemId) : weightedPickItem(user, new Date(nowTs)));
    // Burnt bakes keep a display item for UX feedback, but intentionally grant no inventory or item-stat progression as the penalty.
    if (!burnt) registerItemBake(guildState, user, item, userId);

    let golden = null;
    const forceGolden = user.forceGoldenCookieOnNextBake;
    user.forceGoldenCookieOnNextBake = false;
    const goldenChanceMultiplier = activeEvent?.id === BAKE_EVENT_GOLDEN_FEVER ? 1.8 : 1;
    if (forceGolden || Math.random() < Math.min(1, getGoldenChance(user) * goldenChanceMultiplier)) {
      golden = createGoldenCookieState(user, guildState.settings, nowTs);
    }

    const newlyEarned = evaluateAchievements(user);
    const rankUpdate = syncUserRank(user, (rank) => {
      appendPendingMessage(user, buildRankRewardPendingMessage(rank));
    });
    return {
      user,
      item,
      passive,
      manualYield: yieldAmount,
      golden,
      newlyEarned,
      burnt,
      rankUpdate,
      activeEvent: activeEvent ? { id: activeEvent.id, endsAt: activeEvent.endsAt } : null,
      endedEvent,
    };
  });
}

function getUserSnapshot(guildId, userId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const user = getUserState(guildState, userId);
  const passive = applyPassiveIncome(user, Date.now());
  evaluateAchievements(user);
  syncUserRank(user, (rank) => {
    appendPendingMessage(user, buildRankRewardPendingMessage(rank));
  });
  writeState(data);
  return { data, guildState, user, passive };
}

function saveUserSnapshot(data) {
  writeState(data);
}

function toCookieNumber(num) {
  if (!Number.isFinite(num)) return '0';
  return Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

function getItemSellValue(itemOrId) {
  const item = typeof itemOrId === 'string' ? ITEM_MAP.get(itemOrId) : itemOrId;
  if (!item) return 0;
  return item.baseValue * RARITY[item.rarity].valueMultiplier;
}

function progressBar(current, total, size = 12) {
  const ratio = total <= 0 ? 1 : Math.max(0, Math.min(1, current / total));
  const filled = Math.round(size * ratio);
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)} ${Math.round(ratio * 100)}%`;
}

function getThemeColor(theme) {
  return THEMES[theme]?.color ?? THEMES.classic.color;
}

/**
 * Builds an embed showing a breakdown of the user's current CPS
 * (buildings, upgrade multipliers, consumed boosts, active buffs, etc.)
 */
function buildCpsBreakdownEmbed(guild, user) {
  const nowTs = Date.now();
  const cookieEmoji = getCookieFallbackEmoji(guild);

  // ── Building contributions ────────────────────────────────────────────────
  let buildingTotal = 0;
  const buildingLines = [];
  for (const building of BUILDINGS) {
    const owned = user.buildings[building.id] ?? 0;
    if (!owned) continue;
    let multiplier = 1;
    for (const upgradeId of user.upgrades) {
      const upgrade = UPGRADE_MAP.get(upgradeId);
      if (upgrade?.buildingId === building.id && typeof upgrade.multiplier === 'number') {
        multiplier *= upgrade.multiplier;
      }
    }
    for (const buff of (user.activeBuffs ?? [])) {
      if (buff.type === 'buildingSpecial' && buff.buildingId === building.id && buff.expiresAt > nowTs) {
        multiplier *= 2;
      }
    }
    const contribution = owned * building.baseCps * multiplier;
    buildingTotal += contribution;
    const buildingEmoji = getCustomGuildEmoji(guild, [building.id, ...(BUILDING_EMOJI_ALIASES[building.id] ?? [])]) ?? '🏗️';
    buildingLines.push(`${buildingEmoji} **${building.name}** ×${owned} → ${toCookieNumber(contribution)} CPS`);
  }

  // ── Global upgrade multiplier ─────────────────────────────────────────────
  let globalMultiplier = 1;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.globalMultiplier) globalMultiplier *= upgrade.globalMultiplier;
  }

  // ── Kitten bonus ──────────────────────────────────────────────────────────
  const milkLevel = getEarnedAchievementCount(user) * 4;
  let kittenBonus = 0;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.kittenScale) kittenBonus += (milkLevel / 100) * upgrade.kittenScale;
  }

  // ── Consumed boosts ───────────────────────────────────────────────────────
  const activeBoosts = (user.consumedBoosts ?? []).filter((boost) => boost.expiresAt > nowTs);
  const consumedBonus = activeBoosts.reduce((sum, boost) => sum + boost.cpsBonus, 0);

  // ── Active buffs (frenzy) ─────────────────────────────────────────────────
  const frenzy = (user.activeBuffs ?? []).find((buff) => buff.type === 'frenzy' && buff.expiresAt > nowTs);
  const frenzyMultiplier = frenzy ? 7 : 1;
  const allianceBoost = Math.max(0, Number(user.allianceCpsBoost ?? 0));
  const boosterBoost = Math.max(0, Number(user.boosterCpsBoost ?? 0));
  const vcfTagBoost = user.hasVcfProfileTag ? VCF_PROFILE_TAG_CPS_BOOST : 0;
  const boostDetails = user.allianceBoostDetails ?? {};
  const boosterCount = Math.max(0, Number(boostDetails.allianceBoosterCount ?? 0));
  const boosterAllianceBoost = Math.max(0, Number(boostDetails.allianceBoosterBoost ?? 0));
  const rankBoost = Math.max(0, Number(boostDetails.rankBoost ?? 0));
  const upgradeBoost = Math.max(0, Number(boostDetails.upgradeBoost ?? 0));

  // ── Totals ────────────────────────────────────────────────────────────────
  const basePlusBoosted = buildingTotal + consumedBonus;
  const afterGlobal = basePlusBoosted * globalMultiplier;
  const afterKitten = afterGlobal * (1 + kittenBonus);
  const totalBeforeAlliance = afterKitten * frenzyMultiplier;
  const finalLayerMultiplier = 1 + allianceBoost + boosterBoost + vcfTagBoost;
  const totalCps = totalBeforeAlliance * finalLayerMultiplier;
  const globalBonusCps = Math.max(0, afterGlobal - basePlusBoosted);
  const kittenBonusCps = Math.max(0, afterKitten - afterGlobal);
  const frenzyBonusCps = Math.max(0, totalBeforeAlliance - afterKitten);
  const allianceBonusCps = Math.max(0, totalBeforeAlliance * allianceBoost);
  const boosterBonusCps = Math.max(0, totalBeforeAlliance * boosterBoost);
  const vcfTagBonusCps = Math.max(0, totalBeforeAlliance * vcfTagBoost);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`${cookieEmoji} CPS Breakdown`)
    .setDescription([
      `Pre-alliance total: **${toCookieNumber(totalBeforeAlliance)}** CPS`,
      `**Final total (all boosters applied): ${toCookieNumber(totalCps)} CPS**`,
    ].join('\n'))
    .addFields(
      {
        name: `🏗️ Buildings (${toCookieNumber(buildingTotal)} CPS base)`,
        value: buildingLines.length ? buildingLines.slice(0, 10).join('\n').slice(0, 1024) : 'No buildings owned.',
      },
    );

  if (globalMultiplier !== 1) {
    embed.addFields({ name: '🧩 Upgrade Global Multiplier', value: `×${globalMultiplier.toFixed(2)}`, inline: true });
  }
  if (kittenBonus > 0) {
    embed.addFields({ name: '🐱 Kitten Bonus', value: `+${(kittenBonus * 100).toFixed(1)}%`, inline: true });
  }
  if (consumedBonus > 0) {
    const boostList = activeBoosts
      .map((b) => {
        const source = String(b.source ?? b.itemName ?? b.itemId ?? 'Consumed item').trim() || 'Consumed item';
        return `• ${source}: +${toCookieNumber(b.cpsBonus)} CPS (expires <t:${Math.floor(b.expiresAt / 1000)}:R>)`;
      })
      .join('\n');
    embed.addFields({ name: '⚡ Active Boosts', value: boostList.slice(0, 512) });
  }
  const activeMultiplierLines = [];
  if (frenzy) {
    activeMultiplierLines.push(`• Frenzy buff: ×${frenzyMultiplier} (expires <t:${Math.floor(frenzy.expiresAt / 1000)}:R>)`);
  }
  if (rankBoost > 0) {
    activeMultiplierLines.push(`• Alliance rank boost: +${(rankBoost * 100).toFixed(0)}%`);
  }
  if (upgradeBoost > 0) {
    activeMultiplierLines.push(`• Alliance upgrade boost: +${(upgradeBoost * 100).toFixed(0)}%`);
  }
  if (boosterAllianceBoost > 0) {
    activeMultiplierLines.push(`• Alliance booster members (${boosterCount}): +${(boosterAllianceBoost * 100).toFixed(0)}%`);
  }
  if (boosterBoost > 0) {
    activeMultiplierLines.push(`• Personal server booster role: +${(boosterBoost * 100).toFixed(0)}%`);
  }
  if (vcfTagBoost > 0) {
    activeMultiplierLines.push(`• VCF profile boost (identity guild/tag): +${(vcfTagBoost * 100).toFixed(0)}%`);
  }
  if (activeMultiplierLines.length) {
    embed.addFields({ name: '🧠 Active Multipliers & Sources', value: activeMultiplierLines.join('\n').slice(0, 1024), inline: false });
  }
  const bonusSourceLines = [];
  if (consumedBonus > 0) bonusSourceLines.push(`Flat boosts: +${toCookieNumber(consumedBonus)} CPS`);
  if (globalMultiplier !== 1) {
    bonusSourceLines.push(`Global upgrades: ×${globalMultiplier.toFixed(2)} → +${toCookieNumber(globalBonusCps)} CPS`);
  }
  if (kittenBonus > 0) {
    bonusSourceLines.push(`Kitten scaling: +${(kittenBonus * 100).toFixed(1)}% → +${toCookieNumber(kittenBonusCps)} CPS`);
  }
  if (frenzy) {
    bonusSourceLines.push(`Frenzy: ×${frenzyMultiplier} → +${toCookieNumber(frenzyBonusCps)} CPS (expires <t:${Math.floor(frenzy.expiresAt / 1000)}:R>)`);
  }
  if (allianceBoost > 0) {
    bonusSourceLines.push(`Alliance total: +${(allianceBoost * 100).toFixed(0)}% → +${toCookieNumber(allianceBonusCps)} CPS`);
    const allianceDetailLines = [];
    const allianceDetailGain = (boostPct) => toCookieNumber(totalBeforeAlliance * boostPct);
    if (rankBoost > 0) {
      allianceDetailLines.push(`• Rank: +${(rankBoost * 100).toFixed(0)}% → +${allianceDetailGain(rankBoost)} CPS`);
    }
    if (upgradeBoost > 0) {
      allianceDetailLines.push(`• Store: +${(upgradeBoost * 100).toFixed(0)}% → +${allianceDetailGain(upgradeBoost)} CPS`);
    }
    if (boosterAllianceBoost > 0) {
      allianceDetailLines.push(`• Alliance boosters (${boosterCount}): +${(boosterAllianceBoost * 100).toFixed(0)}% → +${allianceDetailGain(boosterAllianceBoost)} CPS`);
    }
    bonusSourceLines.push(...allianceDetailLines);
  }
  if (boosterBoost > 0) {
    bonusSourceLines.push(`Your booster role: +${(boosterBoost * 100).toFixed(0)}% → +${toCookieNumber(boosterBonusCps)} CPS`);
  }
  if (vcfTagBoost > 0) {
    bonusSourceLines.push(`VCF profile tag: +${(vcfTagBoost * 100).toFixed(0)}% → +${toCookieNumber(vcfTagBonusCps)} CPS`);
  }
  if (bonusSourceLines.length) {
    embed.addFields({ name: '🔎 Bonus Sources', value: bonusSourceLines.join('\n').slice(0, 1024), inline: false });
  }
  embed.addFields({ name: '✅ Final Total (All Boosters)', value: `${toCookieNumber(totalCps)} CPS`, inline: false });
  embed.addFields({ name: '📊 Formula', value: `(Buildings + Boosts) × Global Multiplier × (1 + Kitten%) × Frenzy × (1 + Alliance% + Booster% + VCF%)`, inline: false });

  embed.setTimestamp();
  if (guild) {
    embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
  }
  return embed;
}

function buildDashboardEmbed(guild, user, view = 'home', options = {}) {
  const nowTs = Date.now();
  const cps = computeCps(user, nowTs);
  const totalItems = ITEMS.length;
  const discovered = user.uniqueItemsDiscovered.length;
  const titlePrefix = `${user.bakeryEmoji ?? DEFAULT_COOKIE_EMOJI_STRING} ${user.bakeryName ?? 'Unnamed Bakery'}`;
  const cookieEmoji = getCookieFallbackEmoji(guild);
  const cpsEmoji = getCustomGuildEmoji(guild, ['CookieProduction10', 'CookieProduction5']) ?? '⚙️';
  const collectionEmoji = getCustomGuildEmoji(guild, ['Polymath', 'Cookie_Clicker']) ?? '📚';
  const buildingEmoji = getCustomGuildEmoji(guild, ['hammer_wrench', 'Builder', 'Factory_new']) ?? '🏗️';
  const achievementEmoji = getCustomGuildEmoji(guild, ['trophy', 'Cookie_Clicker', 'Builder']) ?? '🏆';
  const passiveEmoji = getCustomGuildEmoji(guild, ['CookieProduction6', 'CookieProduction10']) ?? '📈';
  const homeMilkType = getMilkType(user.milkLevel);
  const homeMilkKey = homeMilkType.toLowerCase().replace(/\s*milk$/, '');
  const homeMilkEmoji = getCustomGuildEmoji(guild, MILK_EMOJI_ALIASES[homeMilkKey] ?? []) ?? '🥛';
  const passiveElapsedMs = Math.max(0, Number(user.lastPassiveElapsedMs ?? 0));
  const passiveSinceLastCommand = Math.max(0, Number(user.lastPassiveGain ?? 0));

  const embed = new EmbedBuilder()
    .setColor(getThemeColor(user.bakeryTheme))
    .setTitle(`${titlePrefix} • ${view.charAt(0).toUpperCase() + view.slice(1)}`)
    .setTimestamp();

  if (guild) {
    embed.setFooter({
      text: `${guild.name} • ${user.title ?? 'Cookie Novice'}`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }

  if (view === 'home') {
    embed.setDescription('The ovens roar. The crumbs whisper. The economy expands.');
    embed.addFields(
      { name: `${cookieEmoji} Cookies`, value: `**${toCookieNumber(user.cookies)}**`, inline: true },
      { name: `${cpsEmoji} CPS`, value: `**${toCookieNumber(cps)}**`, inline: true },
      { name: `${homeMilkEmoji} Milk`, value: `**${toCookieNumber(user.milkLevel)}%** (${homeMilkType})`, inline: true },
      {
        name: `${passiveEmoji} Since last command`,
        value: `+${toCookieNumber(passiveSinceLastCommand)} (${Math.floor(passiveElapsedMs / 1000)}s)`,
        inline: true,
      },
      { name: `${collectionEmoji} Collection`, value: `Discovered: **${discovered}/${totalItems}**`, inline: true },
      { name: `${buildingEmoji} Buildings`, value: `Owned: **${toCookieNumber(getTotalBuildingsOwned(user))}**`, inline: true },
      { name: `${achievementEmoji} Achievements`, value: `**${getEarnedAchievementCount(user)}/${ACHIEVEMENTS.length}**`, inline: true },
    );
  }

  if (view === 'stats') {
    const rankProgress = getRankProgressToNext(user);
    const unlockedRarities = getUnlockedRarities(user, new Date(nowTs));
    const rarityLines = RARITY_ORDER
      .filter((rarityId) => unlockedRarities.has(rarityId))
      .map((rarityId) => RARITY[rarityId].name);
    embed.setDescription('Numbers. So many numbers. Delicious numbers.');
    embed.addFields(
      { name: 'Total bakes', value: toCookieNumber(user.totalBakes), inline: true },
      { name: 'Cookies baked (lifetime)', value: toCookieNumber(user.cookiesBakedAllTime), inline: true },
      { name: 'Cookies spent', value: toCookieNumber(user.cookiesSpent), inline: true },
      { name: 'Highest CPS', value: toCookieNumber(user.highestCps), inline: true },
      { name: 'Golden Cookies', value: `${toCookieNumber(user.goldenCookiesClaimed)}/${toCookieNumber(user.goldenCookiesTriggered)} claimed`, inline: true },
      { name: 'Marketplace tx', value: `${user.marketplaceBuys} buys • ${user.marketplaceSells} sells`, inline: true },
    );
    const rarest = user.rarestItemId ? ITEM_MAP.get(user.rarestItemId)?.name ?? 'Unknown' : 'None';
    embed.addFields({ name: 'Rarest baked item', value: rarest });
    embed.addFields({ name: 'Current rarity pool', value: rarityLines.join(' • ') || DEFAULT_UNLOCKED_RARITY_LABEL });
    if (rankProgress.nextRank) {
      const requirementLines = Object.entries(rankProgress.nextRank.requirements)
        .map(([metric, target]) => `• ${getMetricLabel(metric)}: ${toCookieNumber(getMetricValue(user, metric))}/${toCookieNumber(target)}`)
        .join('\n');
      embed.addFields(
        {
          name: `${getRankEmoji(user.rankId, guild)} Rank progress to ${getRankEmoji(rankProgress.nextRank, guild)} ${rankProgress.nextRank.name}`,
          value: progressBar(rankProgress.current, rankProgress.total),
        },
        { name: 'Next rank requirements', value: requirementLines || 'Already complete.' },
        { name: 'Next rank reward', value: formatRankReward(rankProgress.nextRank) },
      );
    } else {
      embed.addFields({ name: 'Rank progress', value: 'Max rank reached. 👑' });
    }
    if ((user.transactionHistory ?? []).length) {
      const history = user.transactionHistory.slice(-5).reverse().map((tx) =>
        `• ${tx.type.toUpperCase()} ${tx.quantity}x ${ITEM_MAP.get(tx.itemId)?.name ?? tx.itemId} for ${toCookieNumber(tx.price)} (${userMention(tx.counterparty)})`);
      embed.addFields({ name: 'Recent transactions', value: history.join('\n').slice(0, 1024) });
    }
  }

  if (view === 'inventory') {
    const rarityFilter = options.rarityFilter ?? 'all';
    const rewardGiftEntries = Object.entries(user.rewardGifts ?? {})
      .filter(([, qty]) => qty > 0)
      .map(([rewardBoxId, qty]) => ({ rewardBox: REWARD_BOX_MAP.get(rewardBoxId), qty }))
      .filter((entry) => entry.rewardBox);
    const entries = Object.entries(user.inventory)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ item: ITEM_MAP.get(itemId), qty }))
      .filter((entry) => entry.item)
      .filter((entry) => rarityFilter === 'all' || entry.item.rarity === rarityFilter)
      .sort((a, b) => compareRarity(b.item.id, a.item.id) || (b.qty - a.qty));

    if (entries.length === 0 && rewardGiftEntries.length === 0) {
      embed.setDescription('Inventory currently empty. Keep baking, crumb warrior.');
      const pendingGifts = (user.pendingMessages ?? []).filter((m) => !m.claimed && (m.type === 'gift_box' || m.type === 'gift_cookies' || m.type === 'rank_reward'));
      if (pendingGifts.length > 0) {
        embed.addFields({ name: '📬 Pending Gifts', value: `You have **${pendingGifts.length}** unclaimed gift(s)! Use \`/messages\` to claim them.` });
      }
    } else {
      const page = Math.max(0, Math.min(options.page ?? 0, Math.floor((entries.length - 1) / 8)));
      const pageEntries = entries.slice(page * 8, page * 8 + 8);
      const itemLines = pageEntries
        .map((entry) => `${getItemEmoji(entry.item, guild)} **${entry.item.name}** x${entry.qty} • value ${toCookieNumber(entry.item.baseValue * RARITY[entry.item.rarity].valueMultiplier)}`)
        .join('\n');
      const giftLines = rewardGiftEntries
        .slice(0, MAX_DISPLAYED_GIFT_BOXES)
        .map((entry) => `${getRewardBoxEmoji(entry.rewardBox, guild)} **${entry.rewardBox.name}** x${entry.qty}`)
        .join('\n');
      const extraGiftCount = Math.max(0, rewardGiftEntries.length - MAX_DISPLAYED_GIFT_BOXES);
      const giftOverflow = extraGiftCount > 0 ? `\n...and **${extraGiftCount}** more gift box type(s).` : '';
      embed.setDescription([itemLines || 'No regular inventory items.', giftLines ? `\n🎁 **Reward Gifts**\n${giftLines}${giftOverflow}` : ''].join('\n').trim());
      embed.addFields({
        name: 'Collection',
        value: `Discovered: **${user.uniqueItemsDiscovered.length}/${ITEMS.length}**`,
      });
      embed.setFooter({ text: `Page ${page + 1}/${Math.max(1, Math.ceil(entries.length / 8))}` });

      const pendingGifts = (user.pendingMessages ?? []).filter((m) => !m.claimed && (m.type === 'gift_box' || m.type === 'gift_cookies' || m.type === 'rank_reward'));
      if (pendingGifts.length > 0) {
        embed.addFields({ name: '📬 Pending Gifts', value: `You have **${pendingGifts.length}** unclaimed gift(s)! Use \`/messages\` to claim them.` });
      }
    }
  }

  if (view === 'milk') {
    const currentType = getMilkType(user.milkLevel);
    const nextType = MILK_TYPES.find((type) => type.pct > user.milkLevel);
    const start = [...MILK_TYPES].reverse().find((type) => type.pct <= user.milkLevel)?.pct ?? 0;
    const target = nextType?.pct ?? (user.milkLevel || 1);
    const milkKey = currentType.toLowerCase().replace(/\s*milk$/, '');
    const milkEmoji = getCustomGuildEmoji(guild, MILK_EMOJI_ALIASES[milkKey] ?? []) ?? '🥛';
    embed.setDescription(`Current milk: ${milkEmoji} **${currentType}**`);
    embed.addFields(
      { name: 'Milk level', value: `${toCookieNumber(user.milkLevel)}%`, inline: true },
      { name: 'Achievements', value: `${getEarnedAchievementCount(user)}/${ACHIEVEMENTS.length}`, inline: true },
      { name: 'Progress', value: progressBar(user.milkLevel - start, Math.max(1, target - start)) },
    );
    if (nextType) {
      const nextMilkKey = nextType.type.toLowerCase().replace(/\s*milk$/, '');
      const nextMilkEmoji = getCustomGuildEmoji(guild, MILK_EMOJI_ALIASES[nextMilkKey] ?? []) ?? '🥛';
      embed.addFields({ name: 'Next milk type', value: `${nextMilkEmoji} **${nextType.type}** at ${nextType.pct}%` });
    }
  }

  if (view === 'achievements') {
    const earnedIds = getEarnedAchievementIds(user);
    const earned = new Set(earnedIds);
    const pageSize = 8;
    const pageCount = Math.max(1, Math.ceil(ACHIEVEMENTS.length / pageSize));
    const page = Math.max(0, Math.min(Number.isFinite(options.page) ? options.page : 0, pageCount - 1));
    const pageEntries = ACHIEVEMENTS.slice(page * pageSize, page * pageSize + pageSize);
    embed.setDescription('Milestones that feed your glorious milk pipeline.');
    const lines = pageEntries.map((a) => `${earned.has(a.id) ? '🔓' : '🔒'} ${getAchievementEmoji(a, guild)} **${a.name}** — ${a.desc}`);
    embed.addFields({ name: 'Achievement board', value: lines.join('\n').slice(0, 1024) });
    const progressPercent = Math.round((earned.size / Math.max(1, ACHIEVEMENTS.length)) * 100);
    embed.addFields(
      { name: 'Progress', value: `${earned.size}/${ACHIEVEMENTS.length} (${progressPercent}%)\n${progressBar(earned.size, ACHIEVEMENTS.length)}`, inline: true },
      { name: 'Page', value: `${page + 1}/${pageCount}`, inline: true },
    );
  }

  if (view === 'guide') {
    const section = GUIDE_SECTIONS.some((entry) => entry.id === options.section) ? options.section : 'info';
    const pageSize = 4;
    const pageCount = getGuidePageCount(section);
    const page = Math.max(0, Math.min(Number.isFinite(options.page) ? options.page : 0, pageCount - 1));
    if (section === 'info') {
      embed.setDescription([
        '# Bakery Systems Deep Guide',
        'A progression sandbox built around **active bakes**, **passive production**, and **long-term scaling decisions**.',
        '',
        '**1) Core Production Loop**',
        '• Active income: `/bake` grants manual yield and rolls an item drop each press.',
        '• Passive income: buildings generate CPS while offline/idle (capped at 24h per claim cycle).',
        '• Reinvestment: cookies go into buildings/upgrades to increase future output.',
        '',
        '**2) Bake Outcome Math (high-level)**',
        `• Burnt chance baseline: **${Math.round(BURNT_BAKE_CHANCE * 100)}%** (reduced during Steady Heat).`,
        '• Manual yield scales with upgrades and temporary buffs (including click-frenzy style effects).',
        '• Item drops are weighted by unlocked rarity tiers; higher tiers require progression unlocks.',
        '',
        '**3) Golden Cookie + Event Layer**',
        '• Golden cookies are burst moments: claim quickly for high-value rewards/effects.',
        '• Timed events alter probabilities and economy pacing (special drops, yield boosts, safer bakes).',
        '• Event strategy: accelerate active bake cadence when boosts align with your bottleneck.',
        '',
        '**4) Progression Tracks**',
        '• **Achievements → Milk %**: more achievements raise milk scaling and synergize with kitten upgrades.',
        '• **Ranks**: milestone gates tied to bakes, output, structures, and achievements.',
        '• **Rarity unlocks**: more progression = wider drop pool and higher-value outcomes.',
        '',
        '**5) Economy Surfaces**',
        `• Item liquidation: sell inventory for direct liquidity.`,
        '• Consumables: trade inventory value for temporary power spikes.',
        `• Marketplace: player-driven pricing with a **${Math.round(MARKET_FEE_RATE * 100)}% fee**.`,
        '',
        '**6) Alliance Layer**',
        '• Alliances add cooperative scaling: shared challenges, contribution races, and group upgrades.',
        '• Use alliances to smooth progression plateaus and unlock coordinated reward pacing.',
        '',
        '**7) Practical Optimization Pattern**',
        '• Stabilize base CPS first, then rotate spending into upgrades with immediate multipliers.',
        '• Use codex pages to plan target rarities, upgrade milestones, and rank breakpoints.',
        '• During strong events, prioritize active bakes to maximize temporary multipliers.',
      ].join('\n').slice(0, 4096));
      embed.addFields(
        { name: 'System Focus', value: 'Production • Progression • Economy • Alliances', inline: true },
        { name: 'Use This Section For', value: 'Understanding how systems connect before min-maxing.', inline: true },
      );
    } else if (section === 'gifts') {
      const pageEntries = REWARD_BOXES.slice(page * pageSize, page * pageSize + pageSize);
      embed.setDescription(pageEntries
        .map((rewardBox) => {
          const rewardLines = rewardBox.rewards
            .map((reward) => {
              const item = ITEM_MAP.get(reward.itemId);
              if (!item) return null;
              const quantityLabel = reward.min === reward.max ? `${reward.min}` : `${reward.min}-${reward.max}`;
              const rarity = RARITY[item.rarity]?.name ?? item.rarity;
              return `• ${getItemEmoji(item, guild)} ${item.name} x${quantityLabel} (**${rarity}**)`;
            })
            .filter(Boolean)
            .join('\n');
          return [
            `${getRewardBoxEmoji(rewardBox, guild)} **${rewardBox.name}**`,
            'Drop table:',
            rewardLines || '• No configured drops.',
            'Usage notes:',
            '• Good for injecting inventory depth and targeting specific rarity bands.',
            '• Best opened when you need liquid sell value or consume-buff setup items.',
          ].join('\n');
        })
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields({ name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, REWARD_BOXES.length)} of ${REWARD_BOXES.length}` });
    } else if (section === 'cookies') {
      const pageEntries = ITEMS.slice(page * pageSize, page * pageSize + pageSize);
      const chanceDate = new Date(nowTs);
      embed.setDescription(pageEntries
        .map((item) => {
          const rarity = RARITY[item.rarity];
          const price = getItemSellValue(item);
          const dropChancePct = getItemDropChance(user, item, chanceDate) * 100;
          const owned = Number(user.inventory?.[item.id] ?? 0);
          return [
            `${getItemEmoji(item, guild)} **${item.name}**`,
            `\`${item.id}\``,
            item.flavorText,
            `Rarity: **${rarity.name}**`,
            `Drop chance: **${dropChancePct.toFixed(3)}%**`,
            `Sell value: **${toCookieNumber(price)}**`,
            `Owned: **${toCookieNumber(owned)}**`,
          ].join('\n');
        })
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields({ name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, ITEMS.length)} of ${ITEMS.length}` });
    } else if (section === 'achievements') {
      const pageEntries = ACHIEVEMENTS.slice(page * pageSize, page * pageSize + pageSize);
      embed.setDescription(pageEntries
        .map((achievement) => `${(user.milestones ?? []).includes(achievement.id) ? '🔓' : '🔒'} ${getAchievementEmoji(achievement, guild)} **${achievement.name}**\n${achievement.desc}`)
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields(
        { name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, ACHIEVEMENTS.length)} of ${ACHIEVEMENTS.length}` },
        { name: 'System impact', value: 'Achievements increase milk %, unlock rank requirements, and improve scaling pathways.' },
      );
    } else if (section === 'buildings') {
      const pageEntries = BUILDINGS.slice(page * pageSize, page * pageSize + pageSize);
      embed.setDescription(pageEntries
        .map((building) => {
          const owned = Number(user.buildings?.[building.id] ?? 0);
          return `${getCustomGuildEmoji(guild, [building.id, building.name, `building_${building.id}`, `cc_${building.id}`, ...(BUILDING_EMOJI_ALIASES[building.id] ?? [])]) ?? getCookieFallbackEmoji(guild)} **${building.name}**\nBase cost: **${toCookieNumber(building.baseCost)}**\nBase CPS: **${toCookieNumber(building.baseCps)}**\nOwned: **${toCookieNumber(owned)}**\nNext cost: **${toCookieNumber(getBuildingPrice(building.id, owned, 1))}**\n${building.description}`;
        })
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields(
        { name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, BUILDINGS.length)} of ${BUILDINGS.length}` },
        { name: 'Cost scaling model', value: `Cost growth uses exponential scaling (~x${BUILDING_COST_GROWTH.toFixed(2)} per additional building).` },
      );
    } else if (section === 'milk') {
      const pageEntries = MILK_TYPES.slice(page * pageSize, page * pageSize + pageSize);
      embed.setDescription(pageEntries
        .map((milkType) => {
          const milkKey = milkType.type.toLowerCase().replace(/\s*milk$/, '');
          const milkEmoji = getCustomGuildEmoji(guild, MILK_EMOJI_ALIASES[milkKey] ?? []) ?? '🥛';
          return `${milkEmoji} **${milkType.type}**\nUnlock: **${milkType.pct}% milk**\nBonus at this milk level:\n${formatMilkCodexBonus(milkType.pct)}`;
        })
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields(
        { name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, MILK_TYPES.length)} of ${MILK_TYPES.length}` },
        { name: 'System impact', value: 'Milk amplifies kitten-style upgrade scaling; achievement pace directly controls this power curve.' },
      );
    } else if (section === 'upgrades') {
      const pageEntries = UPGRADES.slice(page * pageSize, page * pageSize + pageSize);
      embed.setDescription(pageEntries
        .map((upgrade) => `${getCustomGuildEmoji(guild, [upgrade.id, `upgrade_${upgrade.id}`, `cc_${upgrade.id}`]) ?? getCookieFallbackEmoji(guild)} **${upgrade.name}**\nCategory: **${getUpgradeCategoryLabel(upgrade)}**\nCost: **${toCookieNumber(upgrade.cost)}**\nStatus: **${user.upgrades.includes(upgrade.id) ? 'Purchased' : upgrade.unlockedWhen(user) ? 'Unlocked' : 'Locked'}**\nEffect summary: ${getUpgradeEffectSummary(upgrade)}\nFlavor: ${upgrade.effect}`)
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields(
        { name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, UPGRADES.length)} of ${UPGRADES.length}` },
        { name: 'Priority heuristic', value: 'Prefer upgrades with immediate CPS multiplier impact when they outpace next building ROI.' },
      );
    } else if (section === 'ranks') {
      const pageEntries = RANKS.slice(page * pageSize, page * pageSize + pageSize);
      embed.setDescription(pageEntries
        .map((rank) => `${getRankEmoji(rank, guild)} **${rank.name}** ${user.rankId === rank.id ? '(Current)' : ''}\nRequirements:\n${formatRankRequirements(rank)}\nReward:\n${formatRankReward(rank)}`)
        .join('\n\n')
        .slice(0, 4096));
      embed.addFields(
        { name: 'Catalog progress', value: `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, RANKS.length)} of ${RANKS.length}` },
        { name: 'Track purpose', value: 'Ranks provide macro milestones and one-time rewards that accelerate future production layers.' },
      );
    }
    embed.addFields({ name: 'Section', value: GUIDE_SECTIONS.find((entry) => entry.id === section)?.label ?? section, inline: true });
    embed.addFields({ name: 'Page', value: `${page + 1}/${pageCount}`, inline: true });
  }

  if (view === 'buildings') {
    const selected = BUILDING_MAP.get(options.buildingId ?? 'cursor') ?? BUILDINGS[0];
    const owned = user.buildings[selected.id] ?? 0;
    const buildingEmoji = getCustomGuildEmoji(guild, [
      selected.id,
      selected.name,
      `building_${selected.id}`,
      `cc_${selected.id}`,
      ...(BUILDING_EMOJI_ALIASES[selected.id] ?? []),
    ]) ?? getCookieFallbackEmoji(guild);
    embed.setDescription(`${buildingEmoji} ${selected.description}`);
    embed.addFields(
      { name: 'Balance', value: toCookieNumber(user.cookies), inline: true },
      { name: 'Owned', value: toCookieNumber(owned), inline: true },
      { name: 'Base CPS', value: toCookieNumber(selected.baseCps), inline: true },
      { name: 'Current CPS', value: toCookieNumber(selected.baseCps * owned), inline: true },
      { name: 'Buy x1', value: toCookieNumber(getBuildingPrice(selected.id, owned, 1)), inline: true },
      { name: 'Buy x10', value: toCookieNumber(getBuildingPrice(selected.id, owned, 10)), inline: true },
      { name: 'Buy x100', value: toCookieNumber(getBuildingPrice(selected.id, owned, 100)), inline: true },
      { name: 'Sell x1', value: toCookieNumber(getBuildingSellValue(selected.id, owned, 1)), inline: true },
      { name: 'Sell x10', value: toCookieNumber(getBuildingSellValue(selected.id, owned, 10)), inline: true },
      { name: 'Sell x100', value: toCookieNumber(getBuildingSellValue(selected.id, owned, 100)), inline: true },
    );
  }

  if (view === 'upgrades') {
    const selectedId = options.upgradeId ?? UPGRADES[0].id;
    const selected = UPGRADE_MAP.get(selectedId) ?? UPGRADES[0];
    const unlocked = selected.unlockedWhen(user);
    const purchased = user.upgrades.includes(selected.id);
    embed.setDescription(getUpgradeEffectSummary(selected));
    embed.addFields(
      { name: 'Balance', value: toCookieNumber(user.cookies), inline: true },
      { name: 'Category', value: getUpgradeCategoryLabel(selected), inline: true },
      { name: 'Cost', value: toCookieNumber(selected.cost), inline: true },
      { name: 'Status', value: purchased ? 'Purchased' : unlocked ? 'Unlocked' : 'Locked', inline: true },
      { name: 'Effect', value: selected.effect.slice(0, 1024) },
    );
  }

  if (view === 'leaderboard') {
    const metricId = BAKERY_LEADERBOARD_METRICS.some((metric) => metric.id === options.metric) ? options.metric : BAKERY_LEADERBOARD_METRICS[0].id;
    const leaderboard = guild?.id ? getBakeryLeaderboard(guild.id, metricId) : [];
    const metric = BAKERY_LEADERBOARD_METRICS.find((entry) => entry.id === metricId) ?? BAKERY_LEADERBOARD_METRICS[0];
    if (!leaderboard.length) {
      embed.setDescription('No bakery leaderboard data yet. Start baking to populate rankings.');
    } else {
      const top = leaderboard.slice(0, 10);
      const lines = top.map((entry, index) => {
        const rank = ['🥇', '🥈', '🥉'][index] ?? `**${index + 1}.**`;
        return `${rank} <@${entry.userId}> — **${toCookieNumber(entry.score)}**`;
      });
      embed.setDescription(lines.join('\n'));
      const myRank = leaderboard.findIndex((entry) => entry.userId === user.userId);
      if (myRank >= 10) {
        embed.addFields({
          name: 'Your Rank',
          value: `#${myRank + 1} — **${toCookieNumber(leaderboard[myRank].score)}**`,
        });
      }
    }
    embed.addFields({ name: 'Metric', value: metric.label, inline: true });
  }

  return embed;
}

function buildDashboardComponents(user, view = 'home', options = {}) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('bakery_nav_select')
        .setPlaceholder('Navigate bakery dashboard')
        .addOptions([
          { label: 'Home', value: 'home', description: 'Overview of your bakery economy.', default: view === 'home', emoji: getButtonEmoji(options.guild, ['cookie', 'plain_cookie', 'plain_cookies'], '🏠') },
          { label: 'Inventory', value: 'inventory', description: 'Manage cookie items and reward gifts.', default: view === 'inventory', emoji: getButtonEmoji(options.guild, ['Cookie_dough', 'cookie_dough', 'inventory'], '🎒') },
          { label: 'Buildings', value: 'buildings', description: 'Buy and sell production buildings.', default: view === 'buildings', emoji: getButtonEmoji(options.guild, ['hammer_wrench', 'Builder', 'Factory_new', 'building'], '🏗️') },
          { label: 'Upgrades', value: 'upgrades', description: 'Purchase permanent production boosts.', default: view === 'upgrades', emoji: getButtonEmoji(options.guild, ['Augmenter', 'Enhancer', 'upgrade'], '🧩') },
          { label: 'Stats', value: 'stats', description: 'Track progress and lifetime totals.', default: view === 'stats', emoji: getButtonEmoji(options.guild, ['CookieProduction10', 'stats'], '📊') },
          { label: 'Leaderboards', value: 'leaderboard', description: 'Compare your bakery against server bakers.', default: view === 'leaderboard', emoji: getButtonEmoji(options.guild, ['trophy', 'leaderboard'], '🏆') },
          { label: 'Milk', value: 'milk', description: 'View milk type progression bonuses.', default: view === 'milk', emoji: getButtonEmoji(options.guild, ['Plain_milk', 'milk'], '🥛') },
          { label: 'Achievements', value: 'achievements', description: 'See unlocked and pending achievements.', default: view === 'achievements', emoji: getButtonEmoji(options.guild, ['Cookie_Clicker', 'achievement'], '🏆') },
          { label: 'Guide', value: 'guide', description: 'Browse codex entries and game systems.', default: view === 'guide', emoji: getButtonEmoji(options.guild, ['Polymath', 'guide'], '📘') },
        ]),
    ),
  );
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bakery_open_marketplace').setLabel('Marketplace').setStyle(ButtonStyle.Success).setEmoji(getButtonEmoji(options.guild, ['International_exchange', 'marketplace'], '🛒')),
      new ButtonBuilder().setCustomId('bakery_set_name').setLabel('Set Bakery Name').setStyle(ButtonStyle.Secondary).setEmoji(getButtonEmoji(options.guild, ['Labor_of_love', 'bakery'], '✏️')),
      new ButtonBuilder().setCustomId('bakery_set_listing').setLabel('List Item').setStyle(ButtonStyle.Secondary).setEmoji(getButtonEmoji(options.guild, ['Paid_in_full', 'listing'], '📦')),
    ),
  );

  if (view === 'inventory') {
    const rarityFilter = options.rarityFilter ?? 'all';
    const raritySelect = new StringSelectMenuBuilder()
      .setCustomId(`bakery_inventory_filter:${options.page ?? 0}`)
      .setPlaceholder('Filter by rarity')
      .addOptions(
        { label: 'All rarities', value: 'all', description: 'Show every rarity tier.' },
        ...RARITY_ORDER.map((id) => ({ label: RARITY[id].name, value: id, description: `Only show ${RARITY[id].name} items.`.slice(0, 100) })),
      );
    rows.push(new ActionRowBuilder().addComponents(raritySelect));

    const filteredInventoryEntries = Object.entries(user.inventory)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ itemId, qty, item: ITEM_MAP.get(itemId) }))
      .filter((entry) => entry.item)
      .filter((entry) => rarityFilter === 'all' || entry.item.rarity === rarityFilter)
      .sort((a, b) => compareRarity(b.item.id, a.item.id) || (b.qty - a.qty) || a.item.name.localeCompare(b.item.name));
    const pageSize = 8;
    const pageCount = Math.max(1, Math.ceil(filteredInventoryEntries.length / pageSize));
    const page = Math.max(0, Math.min(Number.isFinite(options.page) ? options.page : 0, pageCount - 1));
    const pageEntries = filteredInventoryEntries.slice(page * pageSize, page * pageSize + pageSize);
    const itemOptions = pageEntries
      .map((entry) => ({
        label: entry.item.name.slice(0, 100),
        description: `${RARITY[entry.item.rarity].name} • Owned: ${toCookieNumber(entry.qty)}`.slice(0, 100),
        value: entry.itemId,
        emoji: getItemEmoji(entry.itemId, options.guild),
      }))
      .slice(0, 25);
    const rewardGiftOptions = Object.entries(user.rewardGifts ?? {})
      .filter(([, qty]) => qty > 0)
      .map(([rewardBoxId, qty]) => {
        const rewardBox = REWARD_BOX_MAP.get(rewardBoxId);
        if (!rewardBox) return null;
        return {
          label: rewardBox.name.slice(0, 100),
          description: `Gift Box • Owned: ${toCookieNumber(qty)}`.slice(0, 100),
          value: `${GIFT_BOX_OPTION_PREFIX}${rewardBox.id}`,
          emoji: getRewardBoxEmoji(rewardBox, options.guild),
        };
      })
      .filter(Boolean)
      .slice(0, 25);

    const giftSlots = Math.min(rewardGiftOptions.length, 5);
    const itemSlots = Math.max(0, 25 - giftSlots);
    const limitedItemOptions = itemOptions.slice(0, itemSlots);
    const remainingGiftSlots = Math.max(0, 25 - limitedItemOptions.length);
    const inventoryOptions = [...limitedItemOptions, ...rewardGiftOptions.slice(0, remainingGiftSlots)];
    if (inventoryOptions.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('bakery_inventory_item')
            .setPlaceholder('Pick an inventory item or gift box')
            .addOptions(inventoryOptions),
        ),
      );
    }
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bakery_inventory_prev:${page}:${rarityFilter}`)
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`bakery_inventory_page:${page}`)
          .setLabel(`Page ${page + 1}/${pageCount}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`bakery_inventory_next:${page}:${rarityFilter}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pageCount - 1),
      ),
    );
  }

  if (view === 'buildings') {
    const buildingMenu = new StringSelectMenuBuilder()
      .setCustomId('bakery_building_select')
      .setPlaceholder('Choose a building')
      .addOptions(BUILDINGS.slice(0, 25).map((b) => ({
        label: b.name,
        description: `Base CPS ${toCookieNumber(b.baseCps)} • Base cost ${toCookieNumber(b.baseCost)}`.slice(0, 100),
        value: b.id,
        emoji: getCustomGuildEmoji(options.guild, [b.id, b.name, `building_${b.id}`, `cc_${b.id}`, ...(BUILDING_EMOJI_ALIASES[b.id] ?? [])]) ?? getCookieFallbackEmoji(options.guild),
      })));
    rows.push(new ActionRowBuilder().addComponents(buildingMenu));
    const selectedBuilding = options.buildingId ?? 'cursor';
    const selectedOwned = user.buildings[selectedBuilding] ?? 0;
    const buyPrice1 = getBuildingPrice(selectedBuilding, selectedOwned, 1) ?? Number.POSITIVE_INFINITY;
    const buyPrice10 = getBuildingPrice(selectedBuilding, selectedOwned, 10) ?? Number.POSITIVE_INFINITY;
    const buyPrice100 = getBuildingPrice(selectedBuilding, selectedOwned, 100) ?? Number.POSITIVE_INFINITY;
    const canAfford1 = Number(user.cookies) >= buyPrice1;
    const canAfford10 = Number(user.cookies) >= buyPrice10;
    const canAfford100 = Number(user.cookies) >= buyPrice100;
    rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bakery_build_buy:${selectedBuilding}:1`).setLabel('Buy x1').setStyle(ButtonStyle.Success).setDisabled(!canAfford1).setEmoji(getButtonEmoji(options.guild, ['cookie', 'plain_cookie'], '🛍️')),
          new ButtonBuilder().setCustomId(`bakery_build_buy:${selectedBuilding}:10`).setLabel('Buy x10').setStyle(ButtonStyle.Success).setDisabled(!canAfford10).setEmoji(getButtonEmoji(options.guild, ['cookie', 'plain_cookie'], '🛍️')),
          new ButtonBuilder().setCustomId(`bakery_build_buy:${selectedBuilding}:100`).setLabel('Buy x100').setStyle(ButtonStyle.Success).setDisabled(!canAfford100).setEmoji(getButtonEmoji(options.guild, ['cookie', 'plain_cookie'], '🛍️')),
        ),
      );
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bakery_build_sell:${selectedBuilding}:1`).setLabel('Sell x1').setStyle(ButtonStyle.Danger).setDisabled(selectedOwned < 1).setEmoji(getButtonEmoji(options.guild, ['hammer_wrench', 'sell'], '💸')),
        new ButtonBuilder().setCustomId(`bakery_build_sell:${selectedBuilding}:10`).setLabel('Sell x10').setStyle(ButtonStyle.Danger).setDisabled(selectedOwned < 10).setEmoji(getButtonEmoji(options.guild, ['hammer_wrench', 'sell'], '💸')),
        new ButtonBuilder().setCustomId(`bakery_build_sell:${selectedBuilding}:100`).setLabel('Sell x100').setStyle(ButtonStyle.Danger).setDisabled(selectedOwned < 100).setEmoji(getButtonEmoji(options.guild, ['hammer_wrench', 'sell'], '💸')),
      ),
    );
  }

  if (view === 'upgrades') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('bakery_upgrade_select')
          .setPlaceholder('Choose an upgrade')
          .addOptions(UPGRADES.slice(0, 25).map((u) => {
            const purchased = user.upgrades.includes(u.id);
            const unlocked = !purchased && u.unlockedWhen(user);
            const statusTag = purchased ? ' [Bought]' : (!unlocked ? ' [Locked]' : '');
            return {
              label: `${u.name}${statusTag}`.slice(0, 100),
              description: `${getUpgradeCategoryLabel(u)} • ${toCookieNumber(u.cost)} cookies`.slice(0, 100),
              value: u.id,
              emoji: getCustomGuildEmoji(options.guild, [u.id, `upgrade_${u.id}`, `cc_${u.id}`, u.buildingId, ...(BUILDING_EMOJI_ALIASES[u.buildingId] ?? [])].filter(Boolean)) ?? getCookieFallbackEmoji(options.guild),
            };
          })),
      ),
    );
    const selectedUpgrade = options.upgradeId ?? UPGRADES[0].id;
    const isPurchased = user.upgrades.includes(selectedUpgrade);
    const upgradeRow = new ActionRowBuilder();
    if (!isPurchased) {
      upgradeRow.addComponents(
        new ButtonBuilder().setCustomId(`bakery_upgrade_buy:${selectedUpgrade}`).setLabel('Buy Upgrade').setStyle(ButtonStyle.Success).setEmoji(getButtonEmoji(options.guild, ['Augmenter', 'upgrade'], '🛍️')),
      );
    } else {
      upgradeRow.addComponents(
        new ButtonBuilder().setCustomId(`bakery_upgrade_sell:${selectedUpgrade}`).setLabel('Sell Upgrade (−30%)').setStyle(ButtonStyle.Danger).setEmoji(getButtonEmoji(options.guild, ['Paid_in_full', 'sell'], '💸')),
      );
    }
    rows.push(upgradeRow);
  }

  if (view === 'stats') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('bakery_cps_breakdown')
          .setLabel('CPS Breakdown')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(getButtonEmoji(options.guild, ['CookieProduction10', 'stats'], '📊')),
      ),
    );
  }

  if (view === 'leaderboard') {
    const selectedMetric = BAKERY_LEADERBOARD_METRICS.some((metric) => metric.id === options.metric)
      ? options.metric
      : BAKERY_LEADERBOARD_METRICS[0].id;
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('bakery_leaderboard_metric')
          .setPlaceholder('Choose leaderboard metric')
          .addOptions(BAKERY_LEADERBOARD_METRICS.map((metric) => ({
            label: metric.label,
            value: metric.id,
            description: metric.description.slice(0, 100),
            default: metric.id === selectedMetric,
          }))),
      ),
    );
  }

  if (view === 'guide') {
    const section = GUIDE_SECTIONS.some((entry) => entry.id === options.section) ? options.section : 'info';
    const pageCount = getGuidePageCount(section);
    const page = Math.max(0, Math.min(Number.isFinite(options.page) ? options.page : 0, pageCount - 1));
    rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`bakery_guide_section:${page}`)
            .setPlaceholder('Select a guide section')
            .addOptions(GUIDE_SECTIONS.map((entry) => ({
              label: entry.label,
              value: entry.id,
              description: entry.description.slice(0, 100),
              default: entry.id === section,
            }))),
        ),
      );
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bakery_guide_prev:${section}:${page}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(getButtonEmoji(options.guild, ['left_arrow', 'arrow_left'], '⬅️'))
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`bakery_guide_next:${section}:${page}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(getButtonEmoji(options.guild, ['right_arrow', 'arrow_right'], '➡️'))
          .setDisabled(page >= pageCount - 1),
      ),
    );
  }

  if (view === 'achievements') {
    const pageSize = 8;
    const pageCount = Math.max(1, Math.ceil(ACHIEVEMENTS.length / pageSize));
    const page = Math.max(0, Math.min(Number.isFinite(options.page) ? options.page : 0, pageCount - 1));
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bakery_achievements_prev:${page}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`bakery_achievements_next:${page}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pageCount - 1),
      ),
    );
  }
  return rows;
}

function pickGoldenReward(user) {
  const rewards = ['frenzy', 'lucky', 'clickFrenzy', 'cookieStorm', 'buildingSpecial', 'sweet'];
  return rewards[Math.floor(Math.random() * rewards.length)];
}

function claimGoldenCookie(guildId, userId, token) {
  return db.update(ECONOMY_FILE, {}, (data) => {
    const guildState = getGuildState(data, guildId);
    const user = getUserState(guildState, userId);
    const now = Date.now();
    const pending = user.pendingGoldenCookie;
    if (!pending || pending.token !== token) {
      return { ok: false, reason: 'This Golden Cookie fizzled out or was never yours.' };
    }
    if (pending.expiresAt < now) {
      user.pendingGoldenCookie = null;
      return { ok: false, reason: 'Too slow. The Golden Cookie evaporated while laughing at you.' };
    }

    const reward = pickGoldenReward(user);
    let description = '';

  if (reward === 'frenzy') {
    user.activeBuffs.push({ type: 'frenzy', multiplier: 7, expiresAt: now + 30000 });
    description = '⚡ **Frenzy!** Your CPS is x7 for 30 seconds.';
  } else if (reward === 'lucky') {
    const payout = Math.max(1000, Math.floor(user.cookies * 0.1));
    user.cookies += payout;
    user.cookiesBakedAllTime += payout;
    description = `💰 **Lucky!** You found **${toCookieNumber(payout)}** cookies in a suspicious couch cushion.`;
  } else if (reward === 'clickFrenzy') {
    user.clickFrenzyCharges = 3;
    user.clickFrenzyExpiresAt = now + 60000;
    description = '🖱️ **Click Frenzy!** Your next 3 `/bake` uses are x777 within 60 seconds.';
  } else if (reward === 'cookieStorm') {
    const drops = 3 + Math.floor(Math.random() * 3);
    const stormItems = [];
    for (let i = 0; i < drops; i += 1) {
      const item = weightedPickItem(user, new Date(now));
      registerItemBake(guildState, user, item, userId);
      stormItems.push(item.name);
    }
    description = `🌩️ **Cookie Storm!** Items rained down: ${stormItems.map((n) => `**${n}**`).join(', ')}.`;
  } else if (reward === 'buildingSpecial') {
    const owned = BUILDINGS.filter((building) => (user.buildings[building.id] ?? 0) > 0);
    if (owned.length) {
      const selected = owned[Math.floor(Math.random() * owned.length)];
      user.activeBuffs.push({ type: 'buildingSpecial', buildingId: selected.id, expiresAt: now + (10 * 60 * 1000) });
      description = `🏗️ **Building Special!** ${selected.name} CPS is doubled for 10 minutes.`;
    } else {
      description = '🏗️ The universe wanted a building special, but you own no buildings yet. It gave you existential dread instead.';
    }
  } else if (reward === 'sweet') {
    const candidates = ['rare', 'epic', 'legendary', 'mythic', 'celestial'].filter((tier) => !user.unlockedTiers.includes(tier));
    if (candidates.length) {
      const tier = candidates[Math.floor(Math.random() * candidates.length)];
      user.unlockedTiers.push(tier);
      description = `🍭 **Sweet!** You unlocked **${RARITY[tier].name}** tier early.`;
    } else {
      const fallback = 5000;
      user.cookies += fallback;
      user.cookiesBakedAllTime += fallback;
      description = `🍭 All tiers were already unlocked, so the cookie coughed up **${toCookieNumber(fallback)}** bonus cookies instead.`;
    }
  }

    user.pendingGoldenCookie = null;
    user.goldenCookiesClaimed += 1;
    evaluateAchievements(user);
    return { ok: true, reward, description, user };
  });
}

function getListingDisplay(listing, guild) {
  const item = ITEM_MAP.get(listing.itemId);
  return `${item ? getItemEmoji(item, guild) : DEFAULT_COOKIE_EMOJI_STRING} **${item?.name ?? listing.itemId}** x${listing.quantity} • ${toCookieNumber(listing.pricePerUnit)} each • Seller: <@${listing.sellerId}>`;
}

function getMarketplaceEmbed(guild, guildState, user, page = 0, rarityFilter = 'all') {
  cleanMarketplace(guildState);
  const listings = guildState.marketplace.listings
    .filter((listing) => listing.quantity > 0)
    .filter((listing) => rarityFilter === 'all' || ITEM_MAP.get(listing.itemId)?.rarity === rarityFilter);
  const pageCount = Math.max(1, Math.ceil(listings.length / 8));
  const pageIndex = Math.max(0, Math.min(page, pageCount - 1));
  const pageListings = listings.slice(pageIndex * 8, pageIndex * 8 + 8);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏪 Cookie Marketplace')
    .setDescription(pageListings.length
      ? pageListings.map((listing) => `\`${listing.id}\` • ${getListingDisplay(listing, guild)}`).join('\n')
      : 'No listings match that filter. The stalls are eerily quiet.')
    .setTimestamp();

  if (guild) {
    embed.setFooter({
      text: `${guild.name} • Page ${pageIndex + 1}/${pageCount} • Balance ${toCookieNumber(user.cookies)}`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }
  return { embed, pageIndex, pageCount, listingCount: listings.length };
}

function getMarketplaceComponents(guildState, page = 0, rarityFilter = 'all') {
  cleanMarketplace(guildState);
  const listings = guildState.marketplace.listings
    .filter((listing) => listing.quantity > 0)
    .filter((listing) => rarityFilter === 'all' || ITEM_MAP.get(listing.itemId)?.rarity === rarityFilter);
  const pageCount = Math.max(1, Math.ceil(listings.length / 8));
  const pageIndex = Math.max(0, Math.min(page, pageCount - 1));
  const pageListings = listings.slice(pageIndex * 8, pageIndex * 8 + 8);

  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`market_filter:${pageIndex}`)
        .setPlaceholder('Filter listings')
        .addOptions([{ label: 'All rarities', value: 'all' }, ...RARITY_ORDER.map((id) => ({ label: RARITY[id].name, value: id }))]),
    ),
  );

  if (pageListings.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('market_select_listing')
          .setPlaceholder('Choose a listing to buy')
          .addOptions(pageListings.map((listing) => ({
            label: `${ITEM_MAP.get(listing.itemId)?.name ?? listing.itemId} x${listing.quantity}`.slice(0, 100),
            description: `${toCookieNumber(listing.pricePerUnit)} each • by ${listing.sellerTag ?? listing.sellerId}`.slice(0, 100),
            value: String(listing.id),
          }))),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_prev:${pageIndex}:${rarityFilter}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex <= 0),
      new ButtonBuilder().setCustomId(`market_next:${pageIndex}:${rarityFilter}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex >= pageCount - 1),
      new ButtonBuilder().setCustomId('market_list_item').setLabel('List Item').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('market_my_listings').setLabel('My Listings').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('market_back_bakery').setLabel('Back to Bakery').setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buyBuilding(guildId, userId, buildingId, quantity) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  applyPassiveIncome(user, Date.now());
  const owned = user.buildings[buildingId] ?? 0;
  const cost = getBuildingPrice(buildingId, owned, quantity);
  if (!cost || user.cookies < cost) return { ok: false, reason: `You need ${toCookieNumber(cost ?? 0)} cookies.` };
  user.cookies -= cost;
  user.cookiesSpent += cost;
  user.buildings[buildingId] = owned + quantity;
  const newlyEarned = evaluateAchievements(user);
  writeState(data);
  return { ok: true, cost, newlyEarned, user };
}

function sellBuilding(guildId, userId, buildingId, quantity) {
  const building = BUILDING_MAP.get(buildingId);
  if (!building) return { ok: false, reason: 'Unknown building.' };
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: 'Invalid quantity.' };
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  applyPassiveIncome(user, Date.now());
  const owned = user.buildings[buildingId] ?? 0;
  if (owned < quantity) {
    return { ok: false, reason: `You only own ${toCookieNumber(owned)} ${building.name}${owned === 1 ? '' : 's'}.` };
  }
  const refund = getBuildingSellValue(buildingId, owned, quantity);
  if (!Number.isFinite(refund) || refund <= 0) return { ok: false, reason: 'Could not calculate sell value.' };
  user.buildings[buildingId] = Math.max(0, owned - quantity);
  user.cookies += refund;
  writeState(data);
  return { ok: true, refund, quantity, building };
}

function buyUpgrade(guildId, userId, upgradeId) {
  const upgrade = UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown upgrade.' };
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  applyPassiveIncome(user, Date.now());
  if (user.upgrades.includes(upgradeId)) return { ok: false, reason: 'Already purchased.' };
  if (!upgrade.unlockedWhen(user)) return { ok: false, reason: 'That upgrade is still locked.' };
  if (user.cookies < upgrade.cost) return { ok: false, reason: `Need ${toCookieNumber(upgrade.cost)} cookies.` };
  user.cookies -= upgrade.cost;
  user.cookiesSpent += upgrade.cost;
  user.upgrades.push(upgradeId);
  if (upgrade.unlockTier && !user.unlockedTiers.includes(upgrade.unlockTier)) user.unlockedTiers.push(upgrade.unlockTier);
  const newlyEarned = evaluateAchievements(user);
  writeState(data);
  return { ok: true, upgrade, newlyEarned };
}

const UPGRADE_SELL_LOSS_RATE = 0.30; // 30% loss

function sellUpgrade(guildId, userId, upgradeId) {
  const upgrade = UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown upgrade.' };
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  applyPassiveIncome(user, Date.now());
  if (!user.upgrades.includes(upgradeId)) return { ok: false, reason: 'You have not purchased that upgrade.' };
  const refund = Math.floor(upgrade.cost * (1 - UPGRADE_SELL_LOSS_RATE));
  user.upgrades = user.upgrades.filter((id) => id !== upgradeId);
  user.cookies += refund;
  user.cookiesBakedAllTime += refund;
  writeState(data);
  return { ok: true, upgrade, refund };
}

function sellInventoryItem(guildId, userId, itemId, sellAll = false) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const qty = user.inventory[itemId] ?? 0;
  if (qty <= 0) return { ok: false, reason: 'You do not own that item.' };
  const item = ITEM_MAP.get(itemId);
  if (!item) return { ok: false, reason: 'Unknown item.' };
  const amount = sellAll ? qty : 1;
  const value = item.baseValue * RARITY[item.rarity].valueMultiplier * amount;
  user.inventory[itemId] -= amount;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  user.cookies += value;
  user.cookiesBakedAllTime += value;
  writeState(data);
  return { ok: true, amount, value, item };
}

function sellInventoryItemQuantity(guildId, userId, itemId, quantity) {
  const amountRequested = Number.parseInt(quantity, 10);
  if (!Number.isInteger(amountRequested) || amountRequested <= 0) {
    return { ok: false, reason: 'Invalid quantity.' };
  }
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const qty = user.inventory[itemId] ?? 0;
  if (qty <= 0) return { ok: false, reason: 'You do not own that item.' };
  const item = ITEM_MAP.get(itemId);
  if (!item) return { ok: false, reason: 'Unknown item.' };
  const amount = Math.min(qty, amountRequested);
  if (amount <= 0) return { ok: false, reason: 'Nothing to sell.' };
  const value = item.baseValue * RARITY[item.rarity].valueMultiplier * amount;
  user.inventory[itemId] -= amount;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  user.cookies += value;
  user.cookiesBakedAllTime += value;
  writeState(data);
  return { ok: true, amount, value, item };
}

function consumeInventoryItem(guildId, userId, itemId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const qty = user.inventory[itemId] ?? 0;
  if (qty <= 0) return { ok: false, reason: 'You do not own that item.' };
  const item = ITEM_MAP.get(itemId);
  if (!item) return { ok: false, reason: 'Unknown item.' };
  user.inventory[itemId] -= 1;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  const cpsBonus = (item.baseValue * RARITY[item.rarity].valueMultiplier) * 0.01;
  user.consumedBoosts.push({
    cpsBonus,
    expiresAt: Date.now() + (5 * 60 * 1000),
    source: item.name,
    itemId: item.id,
    itemName: item.name,
  });
  writeState(data);
  return { ok: true, item, cpsBonus };
}

function getRandomIntInclusive(min, max) {
  const lower = Math.max(0, Math.floor(min));
  const upper = Math.max(lower, Math.floor(max));
  return lower + Math.floor(Math.random() * ((upper - lower) + 1));
}

function openRewardGift(guildId, userId, rewardBoxId) {
  const box = REWARD_BOX_MAP.get(rewardBoxId);
  if (!box) return { ok: false, reason: 'Unknown reward box.' };
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const owned = user.rewardGifts[rewardBoxId] ?? 0;
  if (owned <= 0) return { ok: false, reason: 'You do not own that reward box.' };
  user.rewardGifts[rewardBoxId] = owned - 1;
  if (user.rewardGifts[rewardBoxId] <= 0) delete user.rewardGifts[rewardBoxId];
  const grants = [];
  for (const reward of box.rewards) {
    const item = ITEM_MAP.get(reward.itemId);
    if (!item) continue;
    const quantity = getRandomIntInclusive(reward.min, reward.max);
    if (quantity <= 0) continue;
    for (let i = 0; i < quantity; i += 1) registerItemBake(guildState, user, item, userId);
    grants.push({ itemId: item.id, quantity, item });
  }
  evaluateAchievements(user);
  writeState(data);
  return { ok: true, rewardBox: box, grants };
}

function listItemForSale(guildId, userId, sellerTag, itemId, quantity, pricePerUnit) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const user = getUserState(guildState, userId);
  const owned = user.inventory[itemId] ?? 0;
  if (owned < quantity) return { ok: false, reason: 'Not enough inventory.' };
  user.inventory[itemId] -= quantity;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  const listing = {
    id: guildState.marketplace.nextListingId++,
    itemId,
    quantity,
    pricePerUnit,
    listedAt: Date.now(),
    sellerId: userId,
    sellerTag,
  };
  guildState.marketplace.listings.push(listing);
  writeState(data);
  return { ok: true, listing };
}

function cancelListing(guildId, userId, listingId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const index = guildState.marketplace.listings.findIndex((listing) => listing.id === listingId);
  if (index === -1) return { ok: false, reason: 'Listing not found.' };
  const listing = guildState.marketplace.listings[index];
  if (listing.sellerId !== userId) return { ok: false, reason: 'That listing is not yours.' };
  const user = getUserState(guildState, userId);
  user.inventory[listing.itemId] = (user.inventory[listing.itemId] ?? 0) + listing.quantity;
  guildState.marketplace.listings.splice(index, 1);
  writeState(data);
  return { ok: true, listing };
}

function buyListing(guildId, buyerId, listingId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const listing = guildState.marketplace.listings.find((entry) => entry.id === listingId);
  if (!listing) return { ok: false, reason: 'Listing not found.' };
  if (listing.sellerId === buyerId) return { ok: false, reason: "You can't buy your own listing." };

  const buyer = getUserState(guildState, buyerId);
  const seller = getUserState(guildState, listing.sellerId);
  applyPassiveIncome(buyer, Date.now());
  const totalPrice = listing.quantity * listing.pricePerUnit;
  if (buyer.cookies < totalPrice) return { ok: false, reason: `Need ${toCookieNumber(totalPrice)} cookies.` };

  const fee = Math.floor(totalPrice * MARKET_FEE_RATE);
  const payout = totalPrice - fee;
  buyer.cookies -= totalPrice;
  seller.cookies += payout;
  seller.cookiesBakedAllTime += payout;
  buyer.inventory[listing.itemId] = (buyer.inventory[listing.itemId] ?? 0) + listing.quantity;
  buyer.marketplaceBuys += 1;
  seller.marketplaceSells += 1;
  buyer.transactionHistory.push({
    type: 'buy',
    itemId: listing.itemId,
    quantity: listing.quantity,
    price: totalPrice,
    counterparty: listing.sellerId,
    timestamp: Date.now(),
  });
  seller.transactionHistory.push({
    type: 'sell',
    itemId: listing.itemId,
    quantity: listing.quantity,
    price: totalPrice,
    counterparty: buyerId,
    timestamp: Date.now(),
  });
  buyer.transactionHistory = buyer.transactionHistory.slice(-50);
  seller.transactionHistory = seller.transactionHistory.slice(-50);
  const idx = guildState.marketplace.listings.findIndex((entry) => entry.id === listing.id);
  if (idx >= 0) guildState.marketplace.listings.splice(idx, 1);
  evaluateAchievements(buyer);
  evaluateAchievements(seller);
  writeState(data);
  return { ok: true, listing, totalPrice, fee, payout };
}

function getAdminLogChannelId(guildId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  return guildState.settings.adminLogChannelId ?? null;
}

function setAdminLogChannel(guildId, channelId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  guildState.settings.adminLogChannelId = channelId;
  writeState(data);
}

function getAdminModRoleId(guildId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  return guildState.settings.adminModRoleId ?? BAKE_ADMIN_ROLE_ID;
}

function adminEnsureTarget(guildId, targetUserId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const target = getUserState(guildState, targetUserId);
  return { data, guildState, target };
}

function adminGiveCookies(guildId, targetUserId, amount) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  target.cookies += amount;
  if (amount > 0) target.cookiesBakedAllTime += amount;
  writeState(data);
}

function adminGiveItem(guildId, targetUserId, itemId, quantity) {
  const { data, guildState, target } = adminEnsureTarget(guildId, targetUserId);
  const item = ITEM_MAP.get(itemId);
  if (!item) return false;
  target.inventory[itemId] = (target.inventory[itemId] ?? 0) + quantity;
  registerItemBake(guildState, target, item, targetUserId);
  writeState(data);
  return true;
}

function adminUnlockUpgrade(guildId, targetUserId, upgradeId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!UPGRADE_MAP.has(upgradeId)) return false;
  if (!target.upgrades.includes(upgradeId)) target.upgrades.push(upgradeId);
  writeState(data);
  return true;
}

function adminSetBuilding(guildId, targetUserId, buildingId, count) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!BUILDING_MAP.has(buildingId)) return false;
  target.buildings[buildingId] = Math.max(0, count);
  writeState(data);
  return true;
}

function adminGrantAchievement(guildId, targetUserId, achievementId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!ACHIEVEMENTS.some((a) => a.id === achievementId)) return false;
  if (!target.milestones.includes(achievementId)) target.milestones.push(achievementId);
  target.milkLevel = target.milestones.length * 4;
  writeState(data);
  return true;
}

function adminForceGolden(guildId, targetUserId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  target.forceGoldenCookieOnNextBake = true;
  writeState(data);
}

function adminSetBakeBan(guildId, targetUserId, banned) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  target.bakeBanned = Boolean(banned);
  writeState(data);
}

function adminSetRank(guildId, targetUserId, rankId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  const rankIndex = RANK_INDEX.get(rankId);
  if (!Number.isInteger(rankIndex)) return false;
  target.rankId = rankId;
  target.title = RANKS[rankIndex].name;
  target.rankRewardsClaimed = RANKS.slice(0, rankIndex + 1).map((rank) => rank.id);
  // Persist the admin-forced rank index so syncUserRank won't downgrade it.
  target.adminForcedRankIndex = rankIndex;
  writeState(data);
  return true;
}

function adminStartEvent(guildId, durationMinutes, eventId = null) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const nowTs = Date.now();
  const durationMs = Math.max(60_000, Math.floor(durationMinutes * 60_000));
  const resolvedId = eventId && COOKIE_EVENT_DEFINITIONS.find((e) => e.id === eventId)
    ? eventId
    : BAKE_EVENT_SPECIAL_COOKIE_HUNT;
  guildState.settings.bakeEvent = {
    id: resolvedId,
    startedAt: nowTs,
    endsAt: nowTs + durationMs,
  };
  writeState(data);
  return guildState.settings.bakeEvent;
}

function weightedPickCookieEventDefinition() {
  const totalWeight = COOKIE_EVENT_DEFINITIONS.reduce((sum, event) => sum + event.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const event of COOKIE_EVENT_DEFINITIONS) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return COOKIE_EVENT_DEFINITIONS[0];
}

function startRandomCookieEvent(guildId, durationMinutes) {
  const event = weightedPickCookieEventDefinition();
  db.update(ECONOMY_FILE, {}, (data) => {
    const guildState = getGuildState(data, guildId);
    const now = Date.now();
    guildState.settings.bakeEvent = {
      id: event.id,
      startedAt: now,
      endsAt: now + (durationMinutes * 60_000),
    };
  });
  return event;
}

function adminGrantRewardBox(guildId, targetUserId, rewardBoxId, quantity) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!REWARD_BOX_MAP.has(rewardBoxId)) return false;
  if (!Number.isInteger(quantity) || quantity <= 0) return false;
  target.rewardGifts[rewardBoxId] = (target.rewardGifts[rewardBoxId] ?? 0) + quantity;
  writeState(data);
  return true;
}

/**
 * Stores a gift box as a pending message for a single user.
 * The gift is only granted to rewardGifts when the user claims it via /messages.
 */
function adminGrantRewardBoxWithMessage(guildId, targetUserId, rewardBoxId, quantity, message, senderTag) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!REWARD_BOX_MAP.has(rewardBoxId)) return false;
  if (!Number.isInteger(quantity) || quantity <= 0) return false;
  if (!Array.isArray(target.pendingMessages)) target.pendingMessages = [];
  target.pendingMessages.push({
    id: Date.now(),
    type: 'gift_box',
    from: senderTag ?? 'Admin',
    message: message ? String(message).slice(0, 500) : '',
    rewardBoxId,
    quantity,
    createdAt: new Date().toISOString(),
    claimed: false,
  });
  if (target.pendingMessages.length > MAX_PENDING_MESSAGES) {
    const firstClaimedIdx = target.pendingMessages.findIndex((m) => m.claimed);
    if (firstClaimedIdx >= 0) target.pendingMessages.splice(firstClaimedIdx, 1);
    else target.pendingMessages.shift();
  }
  writeState(data);
  return true;
}

/**
 * Stores a pending gift box message for every tracked user in the guild.
 * Returns the number of users gifted.
 */
function adminGiftAllUsers(guildId, rewardBoxId, quantity, message, senderTag) {
  if (!REWARD_BOX_MAP.has(rewardBoxId)) return 0;
  if (!Number.isInteger(quantity) || quantity <= 0) return 0;
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const users = Object.values(guildState.users ?? {});
  let msgId = Date.now();
  for (const user of users) {
    if (!Array.isArray(user.pendingMessages)) user.pendingMessages = [];
    user.pendingMessages.push({
      id: msgId++,
      type: 'gift_box',
      from: senderTag ?? 'Admin',
      message: message ? String(message).slice(0, 500) : '',
      rewardBoxId,
      quantity,
      createdAt: new Date().toISOString(),
      claimed: false,
    });
    if (user.pendingMessages.length > MAX_PENDING_MESSAGES) {
      const firstClaimedIdx = user.pendingMessages.findIndex((m) => m.claimed);
      if (firstClaimedIdx >= 0) user.pendingMessages.splice(firstClaimedIdx, 1);
      else user.pendingMessages.shift();
    }
  }
  writeState(data);
  return users.length;
}

function adminGiftCookies(guildId, targetUserId, amount, message, senderTag) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if (!Array.isArray(target.pendingMessages)) target.pendingMessages = [];
  target.pendingMessages.push({
    id: Date.now(),
    type: 'gift_cookies',
    from: senderTag ?? 'Admin',
    message: message ? String(message).slice(0, 500) : '',
    cookieAmount: amount,
    createdAt: new Date().toISOString(),
    claimed: false,
  });
  if (target.pendingMessages.length > MAX_PENDING_MESSAGES) {
    const firstClaimedIdx = target.pendingMessages.findIndex((m) => m.claimed);
    if (firstClaimedIdx >= 0) target.pendingMessages.splice(firstClaimedIdx, 1);
    else target.pendingMessages.shift();
  }
  writeState(data);
  return true;
}

function addPendingMessage(guildId, userId, messageData) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  appendPendingMessage(user, messageData);
  writeState(data);
}

function markInboxMessagesRead(guildId, userId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  let updated = false;
  for (const msg of user.pendingMessages) {
    if (msg.claimed) continue;
    if (msg.type === 'gift_box' || msg.type === 'gift_cookies' || msg.type === 'rank_reward') continue;
    msg.claimed = true;
    updated = true;
  }
  if (updated) writeState(data);
  return updated;
}

function getAllTrackedUserIds(guildId) {
  const data = readState();
  const guildState = data[guildId];
  if (!guildState?.users) return [];
  return Object.keys(guildState.users);
}

function claimPendingMessage(guildId, userId, messageId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const msg = user.pendingMessages.find((m) => m.id === messageId);
  if (!msg) return { ok: false, reason: 'Message not found.' };
  if (msg.claimed) return { ok: false, reason: 'Already claimed.' };
  if (msg.type !== 'gift_box' && msg.type !== 'gift_cookies' && msg.type !== 'rank_reward') {
    return { ok: false, reason: 'This message has nothing to claim.' };
  }
  msg.claimed = true;
  let reward = null;
  if (msg.type === 'gift_box') {
    if (!REWARD_BOX_MAP.has(msg.rewardBoxId)) {
      writeState(data);
      return { ok: false, reason: 'Unknown reward box type.' };
    }
    user.rewardGifts[msg.rewardBoxId] = (user.rewardGifts[msg.rewardBoxId] ?? 0) + msg.quantity;
    reward = { rewardBoxId: msg.rewardBoxId, quantity: msg.quantity };
  } else if (msg.type === 'gift_cookies') {
    user.cookies += msg.cookieAmount;
    user.cookiesBakedAllTime += msg.cookieAmount;
    reward = { cookieAmount: msg.cookieAmount };
  } else if (msg.type === 'rank_reward') {
    const rank = RANKS.find((entry) => entry.id === msg.rankId) ?? null;
    const rewards = (msg.rewards && typeof msg.rewards === 'object') ? msg.rewards : (rank?.rewards ?? {});
    applyRankRewards(user, { rewards });
    reward = {
      rankId: msg.rankId ?? rank?.id ?? null,
      rankName: rank?.name ?? msg.rankId ?? 'Unknown rank',
      rewards,
    };
  }
  writeState(data);
  return { ok: true, type: msg.type, reward };
}

function claimAllPendingMessages(guildId, userId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const claimed = [];
  for (const msg of user.pendingMessages) {
    if (msg.claimed) continue;
    if (msg.type !== 'gift_box' && msg.type !== 'gift_cookies' && msg.type !== 'rank_reward') continue;
    msg.claimed = true;
    if (msg.type === 'gift_box' && REWARD_BOX_MAP.has(msg.rewardBoxId)) {
      user.rewardGifts[msg.rewardBoxId] = (user.rewardGifts[msg.rewardBoxId] ?? 0) + msg.quantity;
      claimed.push({ type: 'gift_box', rewardBoxId: msg.rewardBoxId, quantity: msg.quantity });
    } else if (msg.type === 'gift_cookies') {
      user.cookies += msg.cookieAmount;
      user.cookiesBakedAllTime += msg.cookieAmount;
      claimed.push({ type: 'gift_cookies', cookieAmount: msg.cookieAmount });
    } else if (msg.type === 'rank_reward') {
      const rank = RANKS.find((entry) => entry.id === msg.rankId) ?? null;
      const rewards = (msg.rewards && typeof msg.rewards === 'object') ? msg.rewards : (rank?.rewards ?? {});
      applyRankRewards(user, { rewards });
      claimed.push({
        type: 'rank_reward',
        rankId: msg.rankId ?? rank?.id ?? null,
        rankName: rank?.name ?? msg.rankId ?? 'Unknown rank',
        rewards,
      });
    }
  }
  writeState(data);
  return claimed;
}

function deletePendingMessage(guildId, userId, messageId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const idx = user.pendingMessages.findIndex((m) => m.id === messageId);
  if (idx === -1) return false;
  user.pendingMessages.splice(idx, 1);
  writeState(data);
  return true;
}

function buildMessagesEmbed(guild, user, page) {
  const pending = user.pendingMessages ?? [];
  const unreadCount = pending.filter((msg) => !msg.claimed).length;
  const unclaimedRewards = pending.filter((msg) => (msg.type === 'gift_box' || msg.type === 'gift_cookies' || msg.type === 'rank_reward') && !msg.claimed).length;
  const totalPages = Math.max(1, Math.ceil(pending.length / MESSAGES_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const newestFirst = [...pending].reverse();
  const pageMsgs = newestFirst.slice(safePage * MESSAGES_PER_PAGE, safePage * MESSAGES_PER_PAGE + MESSAGES_PER_PAGE);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📬 Inbox')
    .setDescription([
      `**Unread:** ${unreadCount}`,
      `**Unclaimed Rewards:** ${unclaimedRewards}`,
      `**Total Messages:** ${pending.length}`,
      '',
      'Use the buttons below to claim rewards or dismiss messages.',
    ].join('\n'))
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} • newest first` });

  if (pending.length === 0) {
    embed.setDescription('Your inbox is empty right now.\n\nGift notifications, staff updates, and alliance alerts will appear here.');
    return embed;
  }

  const fields = pageMsgs.map((msg, idx) => {
    const globalIndex = pending.length - (safePage * MESSAGES_PER_PAGE + idx);
    const ts = msg.createdAt ? `<t:${Math.floor(new Date(msg.createdAt).getTime() / 1000)}:R>` : '';
    const unreadPrefix = msg.claimed ? '✅' : '🆕';
    let icon; let category; let summary;
    if (msg.type === 'gift_box') {
      const box = REWARD_BOX_MAP.get(msg.rewardBoxId);
      icon = msg.claimed ? '✅' : '🎁';
      category = 'Gift Box';
      const msgText = msg.message ? `: *${msg.message.slice(0, 80)}${msg.message.length > 80 ? '…' : ''}*` : '';
      summary = `×${msg.quantity} **${box?.name ?? msg.rewardBoxId}** from **${msg.from}**${msgText}${msg.claimed ? ' *(claimed)*' : ''}`;
    } else if (msg.type === 'gift_cookies') {
      icon = msg.claimed ? '✅' : '🍪';
      category = 'Cookie Gift';
      const msgText = msg.message ? `: *${msg.message.slice(0, 80)}${msg.message.length > 80 ? '…' : ''}*` : '';
      summary = `**${toCookieNumber(msg.cookieAmount)}** cookies from **${msg.from}**${msgText}${msg.claimed ? ' *(claimed)*' : ''}`;
    } else if (msg.type === 'rank_reward') {
      const rank = RANKS.find((entry) => entry.id === msg.rankId) ?? null;
      icon = msg.claimed ? '✅' : '🏅';
      category = 'Rank Reward';
      const rewardText = formatRankReward({ rewards: msg.rewards ?? rank?.rewards ?? {} });
      summary = `**${rank?.name ?? msg.rankId ?? 'Unknown rank'}**\n${rewardText}${msg.claimed ? '\n*(claimed)*' : '\n*Claim with this inbox button.*'}`;
    } else if (msg.type === 'alliance_notification') {
      icon = '🤝';
      category = 'Alliance';
      summary = msg.content ?? '(alliance notification)';
    } else if (msg.type === 'staff_message') {
      const typeIcon = msg.messageType === 'moderation' ? '⚠️' : msg.messageType === 'bakery' ? '🍪' : '🔔';
      icon = typeIcon;
      category = 'Staff';
      const titlePart = msg.title ? `**${msg.title}**\n` : '';
      summary = `${titlePart}${(msg.content ?? '').slice(0, 400)}\n*From ${msg.from ?? 'Staff'}*`;
    } else {
      icon = '📢';
      category = 'Notification';
      summary = msg.content ?? msg.message ?? '(notification)';
    }
    const name = `#${globalIndex} • ${unreadPrefix} ${icon} ${category}${ts ? ` • ${ts}` : ''}`.slice(0, 256);
    return { name, value: summary.slice(0, 1024), inline: false };
  });

  embed.addFields(fields);
  return embed;
}

function buildMessagesComponents(user, page) {
  const pending = user.pendingMessages ?? [];
  const totalPages = Math.max(1, Math.ceil(pending.length / MESSAGES_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const newestFirst = [...pending].reverse();
  const pageMsgs = newestFirst.slice(safePage * MESSAGES_PER_PAGE, safePage * MESSAGES_PER_PAGE + MESSAGES_PER_PAGE);

  const rows = [];
  // Pair messages 2 per action row: [Claim N] [Dismiss N] [Claim N+1] [Dismiss N+1]
  for (let i = 0; i < pageMsgs.length && rows.length < 4; i += 2) {
    const btns = [];
    for (let j = i; j < Math.min(i + 2, pageMsgs.length); j++) {
      const msg = pageMsgs[j];
      const label = `#${pending.length - (safePage * MESSAGES_PER_PAGE + j)}`;
      const isClaimable = (msg.type === 'gift_box' || msg.type === 'gift_cookies' || msg.type === 'rank_reward') && !msg.claimed;
      if (isClaimable) {
        btns.push(
          new ButtonBuilder()
            .setCustomId(`messages_claim:${safePage}:${msg.id}`)
            .setLabel(`Claim ${label}`)
            .setStyle(ButtonStyle.Success),
        );
      }
      btns.push(
        new ButtonBuilder()
          .setCustomId(`messages_delete:${safePage}:${msg.id}`)
          .setLabel(isClaimable ? `Dismiss ${label}` : `Delete ${label}`)
          .setStyle(ButtonStyle.Danger),
      );
    }
    if (btns.length > 0) rows.push(new ActionRowBuilder().addComponents(btns));
  }

  const hasUnclaimed = pending.some(
    (m) => (m.type === 'gift_box' || m.type === 'gift_cookies' || m.type === 'rank_reward') && !m.claimed,
  );

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`messages_page:${safePage - 1}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`messages_page:${safePage + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('messages_claim_all')
      .setLabel('🎁 Claim All')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasUnclaimed),
  );
  rows.push(navRow);

  return rows;
}

function adminResetUser(guildId, targetUserId) {
  const guildState = getGuildState(data, guildId);
  guildState.users[targetUserId] = getDefaultUserState(targetUserId);
  writeState(data);
}

function adminResetGuildEconomy(guildId) {
  const data = readState();
  const existing = getGuildState(data, guildId);
  const reset = getDefaultGuildState();
  reset.settings.adminLogChannelId = existing.settings?.adminLogChannelId ?? null;
  reset.settings.adminModRoleId = existing.settings?.adminModRoleId ?? BAKE_ADMIN_ROLE_ID;
  data[guildId] = reset;
  writeState(data);
}

function buildBakeAdminDashboardEmbed(guild, actorId) {
  const data = readState();
  const guildState = getGuildState(data, guild?.id ?? 'unknown_guild');
  const now = Date.now();
  const users = Object.values(guildState.users ?? {});
  const totals = users.reduce((acc, user) => {
    acc.cookies += Number(user?.cookies ?? 0);
    acc.cookiesBakedAllTime += Number(user?.cookiesBakedAllTime ?? 0);
    acc.cookiesSpent += Number(user?.cookiesSpent ?? 0);
    acc.totalBakes += Number(user?.totalBakes ?? 0);
    acc.totalBuildings += getTotalBuildingsOwned(user);
    acc.totalUpgrades += Number((user?.upgrades ?? []).length);
    acc.bakeBanned += user?.bakeBanned ? 1 : 0;
    acc.totalCps += Number(computeCps(user, now) ?? 0);
    return acc;
  }, {
    cookies: 0,
    cookiesBakedAllTime: 0,
    cookiesSpent: 0,
    totalBakes: 0,
    totalBuildings: 0,
    totalUpgrades: 0,
    bakeBanned: 0,
    totalCps: 0,
  });
  const activeEvent = getActiveBakeEvent(guildState, now);
  const eventLabel = activeEvent
    ? `${COOKIE_EVENT_DEFINITIONS.find((event) => event.id === activeEvent.id)?.name ?? activeEvent.id} (ends <t:${Math.floor(activeEvent.endsAt / 1000)}:R>)`
    : 'None';

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🛠️ Bake Admin Dashboard')
    .setDescription(`Global bakery economy overview for this server.\nModerator: <@${actorId}>`)
    .addFields(
      {
        name: 'Economy Totals',
        value: [
          `Users tracked: **${toCookieNumber(users.length)}**`,
          `Live cookies: **${toCookieNumber(totals.cookies)}**`,
          `Lifetime baked: **${toCookieNumber(totals.cookiesBakedAllTime)}**`,
          `Lifetime spent: **${toCookieNumber(totals.cookiesSpent)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Production & Progress',
        value: [
          `Combined CPS: **${toCookieNumber(totals.totalCps)}**`,
          `Total bakes: **${toCookieNumber(totals.totalBakes)}**`,
          `Buildings owned: **${toCookieNumber(totals.totalBuildings)}**`,
          `Upgrades unlocked: **${toCookieNumber(totals.totalUpgrades)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Global Status',
        value: [
          `Bake-banned users: **${toCookieNumber(totals.bakeBanned)}**`,
          `Marketplace listings: **${toCookieNumber(guildState.marketplace?.listings?.length ?? 0)}**`,
          `Unique item stats tracked: **${toCookieNumber(Object.keys(guildState.itemStats ?? {}).length)}**`,
          `Active event: **${eventLabel}**`,
        ].join('\n'),
      },
    )
    .setTimestamp();

  if (guild) {
    embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
  }
  return embed;
}

function buildBakeAdminDashboardComponents(actorId) {
  const targetSelectRow = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`bakeadmin_target_select:${actorId}`)
      .setPlaceholder('Select a user for user-level bakeadmin actions')
      .setMinValues(1)
      .setMaxValues(1),
  );
  const globalActionRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bakeadmin_global_action:${actorId}`)
      .setPlaceholder('Select a global bakeadmin action')
      .addOptions(
        { label: 'Refresh Dashboard', value: 'refresh_dashboard', description: 'Refresh global economy statistics.' },
        { label: 'Start Event', value: 'start_event', description: 'Start a timed special cookie event for the server.' },
        { label: 'Gift All Users', value: 'gift_all_users', description: 'Grant a reward gift box to every user with a message.' },
        { label: 'Set Admin Log Channel', value: 'set_log_channel', description: 'Set channel for bakeadmin action logs.' },
        { label: 'Reset Entire Economy', value: 'reset_economy', description: 'Reset ALL bakery economy data for this guild.' },
      ),
  );
  return [targetSelectRow, globalActionRow];
}

function buildBakeAdminEmbed(guild, actorId, targetId) {
  const data = readState();
  const guildState = getGuildState(data, guild?.id ?? 'unknown_guild');
  const target = getUserState(guildState, targetId);
  const now = Date.now();
  const targetCps = computeCps(target, Date.now());
  const rank = RANKS[RANK_INDEX.get(target.rankId) ?? 0] ?? null;
  const unlockedRarities = getUnlockedRarities(target, new Date(now));
  const unlockedRarityLabel = RARITY_ORDER
    .filter((rarityId) => unlockedRarities.has(rarityId))
    .map((rarityId) => RARITY[rarityId].name)
    .join(' • ') || DEFAULT_UNLOCKED_RARITY_LABEL;
  const activeEvent = getActiveBakeEvent(guildState, now);
  const eventLabel = activeEvent?.id === 'special_cookie_hunt' && Number.isFinite(activeEvent?.endsAt)
    ? `<t:${Math.floor(activeEvent.endsAt / 1000)}:R>`
    : 'None';
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🛠️ Bake Admin Dashboard')
    .setDescription(`Detailed baking profile for <@${targetId}> (\`${targetId}\`).`)
    .addFields(
      {
        name: 'Economy',
        value: [
          `Cookies: **${toCookieNumber(target.cookies)}**`,
          `CPS: **${toCookieNumber(targetCps)}**`,
          `Cookies baked: **${toCookieNumber(target.cookiesBakedAllTime)}**`,
          `Cookies spent: **${toCookieNumber(target.cookiesSpent)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Progression',
        value: [
          `Rank: **${getRankEmoji(rank ?? target.rankId, guild)} ${rank?.name ?? 'Unknown'}**`,
          `Achievements: **${getEarnedAchievementCount(target)}/${ACHIEVEMENTS.length}**`,
          `Rarity pool: **${unlockedRarityLabel}**`,
          `Rarest item: **${target.rarestItemId ? (ITEM_MAP.get(target.rarestItemId)?.name ?? target.rarestItemId) : 'None'}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Activity',
        value: [
          `Total bakes: **${toCookieNumber(target.totalBakes)}**`,
          `Golden Cookies: **${toCookieNumber(target.goldenCookiesClaimed)}/${toCookieNumber(target.goldenCookiesTriggered)} claimed**`,
          `Marketplace: **${toCookieNumber(target.marketplaceBuys)} buys • ${toCookieNumber(target.marketplaceSells)} sells**`,
          `Bake banned: **${target.bakeBanned ? 'Yes' : 'No'}**`,
          `Active event ends: **${eventLabel}**`,
        ].join('\n'),
      },
    )
    .setTimestamp();
  if (guild) {
    embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
  }
  return embed;
}

function buildBakeAdminComponents(actorId, targetId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`bakeadmin_action:${actorId}:${targetId}`)
    .setPlaceholder('Choose a user-level admin action')
    .addOptions(
      { label: 'Give Cookies', value: 'give_cookies', description: 'Add cookies directly to the target.' },
      { label: 'Remove Cookies', value: 'remove_cookies', description: 'Subtract cookies from the target.' },
      { label: 'Give Item', value: 'give_item', description: 'Grant inventory items from a picker.' },
      { label: 'Unlock Upgrade', value: 'unlock_upgrade', description: 'Unlock one upgrade for the target.' },
      { label: 'Set Building Count', value: 'set_building', description: 'Set ownership count from a building picker.' },
      { label: 'Grant Achievement', value: 'grant_achievement', description: 'Force-unlock one achievement.' },
      { label: 'Set Rank', value: 'set_rank', description: 'Set target rank from the rank picker.' },
      { label: 'Grant Reward Gift Box', value: 'grant_reward_box', description: 'Grant a reward gift box with a message.' },
      { label: 'Trigger Golden Cookie', value: 'trigger_golden', description: 'Force a Golden Cookie on next bake.' },
      { label: 'Ban Bake Commands', value: 'ban_bake', description: 'Block target from baking commands.' },
      { label: 'Unban Bake Commands', value: 'unban_bake', description: 'Restore target bake command access.' },
      { label: 'Alliance: Grant Upgrade', value: 'alliance_add_upgrade', description: 'Grant alliance store upgrade via pickers.' },
      { label: 'Alliance: Delete Alliance', value: 'alliance_delete', description: 'Delete alliance via picker and confirm.' },
      { label: 'Reset User', value: 'reset_user', description: 'Reset target baking profile to defaults.' },
      { label: 'View User Data', value: 'view_user', description: 'Open target user data embed.' },
    );
  return [new ActionRowBuilder().addComponents(select)];
}

function modalForAdminAction(actorId, targetId, action) {
  const modal = new ModalBuilder().setCustomId(`bakeadmin_modal:${actorId}:${targetId}:${action}`);
  if (action === 'give_cookies' || action === 'remove_cookies') {
    modal.setTitle(action === 'give_cookies' ? 'Give Cookies' : 'Remove Cookies');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true),
    ));
    return modal;
  }
  if (action === 'start_event') {
    modal.setTitle('Start Bake Event');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('durationMinutes')
        .setLabel('Event duration (minutes)')
        .setPlaceholder('e.g. 30')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)),
    );
    return modal;
  }
  return null;
}

function modalForListItem(itemId) {
  return new ModalBuilder()
    .setCustomId(`market_modal_list:${itemId}`)
    .setTitle('List Item on Marketplace')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Price per unit').setStyle(TextInputStyle.Short).setRequired(true)),
    );
}

function modalForBakeryName() {
  return new ModalBuilder()
    .setCustomId('bakery_modal_name')
    .setTitle('Name Your Bakery')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Bakery name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60),
      ),
    );
}

function sanitizeBakeryName(input) {
  const raw = String(input ?? '')
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '')
    .trim();
  if (!raw) return { ok: false, reason: 'Bakery name cannot be empty.', value: '' };
  if (raw.length > 60) return { ok: false, reason: 'Bakery name must be 60 characters or fewer.', value: '' };
  if (/@everyone|@here|<@!?(\d+)>|<@&(\d+)>/.test(raw)) {
    return { ok: false, reason: 'Bakery name cannot contain mentions.', value: '' };
  }
  if (/(discord\.gg\/|discord\.com\/invite\/|hxxps?:\/\/|https?:\/\/)/i.test(raw)) {
    return { ok: false, reason: 'Bakery name cannot contain links or invites.', value: '' };
  }
  const compact = raw
    .replace(/[`*_~|>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!compact) return { ok: false, reason: 'Bakery name is not valid after sanitization.', value: '' };
  return { ok: true, reason: null, value: compact };
}

function resolveBakeryEmojiInput(guild, input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(raw)) return raw;
  const normalized = normalizeEmojiName(raw);
  if (!normalized) return raw;
  const item = ITEMS.find((entry) => {
    const normalizedId = normalizeEmojiName(entry.id);
    const normalizedName = normalizeEmojiName(entry.name);
    return normalizedId === normalized || normalizedName === normalized;
  });
  if (item) return getItemEmoji(item, guild);
  return raw;
}

function setBakeryIdentity(guildId, userId, bakeryName, bakeryEmoji) {
  const sanitized = sanitizeBakeryName(bakeryName);
  if (!sanitized.ok) return { ok: false, reason: sanitized.reason };
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  user.bakeryName = sanitized.value;
  if (bakeryEmoji) user.bakeryEmoji = bakeryEmoji;
  evaluateAchievements(user);
  writeState(data);
  return { ok: true, bakeryName: sanitized.value, bakeryEmoji: user.bakeryEmoji ?? DEFAULT_COOKIE_EMOJI_STRING };
}

function inspectItem(guildId, userId, itemId) {
  const snapshot = getUserSnapshot(guildId, userId);
  const stats = snapshot.guildState.itemStats[itemId];
  const item = ITEM_MAP.get(itemId);
  if (!item) return null;
  return { item, stats, quantity: snapshot.user.inventory[itemId] ?? 0 };
}

function buildItemInspectEmbed(guild, itemDetails) {
  const { item, stats, quantity } = itemDetails;
  const rarity = RARITY[item.rarity];
  const embed = new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(`${getItemEmoji(item, guild)} ${item.name}`)
    .setDescription(item.flavorText)
    .addFields(
      { name: 'Rarity', value: rarity.name, inline: true },
      { name: 'Base value', value: toCookieNumber(item.baseValue * rarity.valueMultiplier), inline: true },
      { name: 'Owned', value: toCookieNumber(quantity), inline: true },
      { name: 'Total in circulation', value: toCookieNumber(stats?.totalInCirculation ?? 0), inline: true },
      { name: 'First baked by', value: stats?.firstBakedBy ? `<@${stats.firstBakedBy}>` : 'Unknown', inline: true },
    )
    .setTimestamp();
  if (guild) embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
  return embed;
}

function getUserDataEmbed(guild, targetUserId) {
  const snapshot = getUserSnapshot(guild?.id, targetUserId);
  const user = snapshot.user;
  return buildDashboardEmbed(guild, user, 'stats');
}

function isBakeAdminAuthorized(member, guildId) {
  return member.roles.cache.has(BAKE_ADMIN_ROLE_ID);
}

function isUserBakeBanned(guildId, userId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  return Boolean(user.bakeBanned);
}

function getGuildUserStates(guildId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  return guildState.users ?? {};
}

function getLeaderboardScore(userState, metricId) {
  const allianceBoostMultiplier = 1 + Math.max(0, Number(userState?.allianceCpsBoost ?? 0));
  if (metricId === 'special') {
    const inventory = userState?.inventory ?? {};
    const baseScore = Number(inventory.perfectcookie ?? 0)
      + Number(inventory.goldcookie ?? 0)
      + Number(inventory.spoopiercookie ?? 0);
    return baseScore * allianceBoostMultiplier;
  }
  if (metricId === 'lifetime') return Number(userState?.cookiesBakedAllTime ?? 0) * allianceBoostMultiplier;
  if (metricId === 'cps') {
    const safeUser = JSON.parse(JSON.stringify(userState ?? {}));
    safeUser.allianceCpsBoost = 0;
    const baseScore = Number(computeCps(safeUser, Date.now()) ?? 0);
    return baseScore * allianceBoostMultiplier;
  }
  return Number(userState?.cookies ?? 0) * allianceBoostMultiplier;
}

function getBakeryLeaderboard(guildId, metricId = 'cookies') {
  const metric = BAKERY_LEADERBOARD_METRICS.some((entry) => entry.id === metricId) ? metricId : BAKERY_LEADERBOARD_METRICS[0].id;
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const users = Object.entries(guildState.users ?? {});
  const leaderboard = [];

  for (const [userId, userState] of users) {
    const score = getLeaderboardScore(userState, metric);
    if (!Number.isFinite(score) || score <= 0) continue;
    leaderboard.push({ userId, score });
  }

  leaderboard.sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
  return leaderboard;
}

function getSpecialCookieLeaderboard(guildId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const users = Object.entries(guildState.users ?? {});
  const leaderboard = [];
  for (const [userId, userState] of users) {
    const inventory = userState?.inventory ?? {};
    const perfect = Number(inventory.perfectcookie ?? 0);
    const gold = Number(inventory.goldcookie ?? 0);
    const spoopier = Number(inventory.spoopiercookie ?? 0);
    const total = perfect + gold + spoopier;
    if (total <= 0) continue;
    leaderboard.push({ userId, total, counts: { perfect, gold, spoopier } });
  }
  leaderboard.sort((a, b) =>
    b.total - a.total
    || b.counts.spoopier - a.counts.spoopier
    || b.counts.gold - a.counts.gold
    || b.counts.perfect - a.counts.perfect);
  return leaderboard;
}

module.exports = {
  MessageFlags,
  RARITY,
  RARITY_ORDER,
  BUILDINGS,
  UPGRADES,
  UPGRADE_MAP,
  ACHIEVEMENTS,
  RANKS,
  REWARD_BOXES,
  ITEMS,
  ITEM_MAP,
  THEMES,
  TITLES,
  toCookieNumber,
  getEarnedAchievementCount,
  getUserSnapshot,
  saveUserSnapshot,
  setAllianceCpsBoostBatch,
  setUserAllianceCpsBoost,
  setUserBoosterStatus,
  setUserVcfTagStatus,
  inferVcfProfileTagStatus,
  buildDashboardEmbed,
  buildDashboardComponents,
  buildCpsBreakdownEmbed,
  bake,
  claimGoldenCookie,
  getMarketplaceEmbed,
  getMarketplaceComponents,
  modalForListItem,
  listItemForSale,
  buyListing,
  cancelListing,
  buyBuilding,
  sellBuilding,
  buyUpgrade,
  sellUpgrade,
  sellInventoryItem,
  sellInventoryItemQuantity,
  consumeInventoryItem,
  openRewardGift,
  inspectItem,
  buildItemInspectEmbed,
  modalForBakeryName,
  sanitizeBakeryName,
  setBakeryIdentity,
  resolveBakeryEmojiInput,
  buildBakeAdminEmbed,
  buildBakeAdminComponents,
  modalForAdminAction,
  getAdminLogChannelId,
  setAdminLogChannel,
  adminGiveCookies,
  adminGiveItem,
  adminUnlockUpgrade,
  adminSetBuilding,
  adminGrantAchievement,
  adminForceGolden,
  adminSetBakeBan,
  adminSetRank,
  adminStartEvent,
  adminGrantRewardBox,
  adminGrantRewardBoxWithMessage,
  adminGiftAllUsers,
  adminGiftCookies,
  adminResetUser,
  adminResetGuildEconomy,
  buildBakeAdminDashboardEmbed,
  buildBakeAdminDashboardComponents,
  getUserDataEmbed,
  getGuildUserStates,
  isBakeAdminAuthorized,
  isUserBakeBanned,
  computeCps,
  getBuildingPrice,
  getBuildingSellValue,
  getRarityEmoji,
  getCookieEmoji,
  getItemEmoji,
  getRankEmoji,
  getRewardBoxEmoji,
  getButtonEmoji,
  getItemSellValue,
  formatRankRequirements,
  formatRankReward,
  getItemDropChance,
  getBakeryLeaderboard,
  getSpecialCookieLeaderboard,
  SPECIAL_COOKIE_IDS,
  COOKIE_EVENT_DEFINITIONS,
  startRandomCookieEvent,
  GIFT_BOX_OPTION_PREFIX,
  addPendingMessage,
  markInboxMessagesRead,
  getAllTrackedUserIds,
  claimPendingMessage,
  claimAllPendingMessages,
  deletePendingMessage,
  buildMessagesEmbed,
  buildMessagesComponents,
};
