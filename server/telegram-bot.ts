import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import type { Request, Response } from 'express';

// ── Config ──
function getBotApiSecret(): string {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) {
    throw new Error('FATAL: BOT_API_SECRET environment variable must be set');
  }
  if (secret.length < 20) {
    throw new Error('FATAL: BOT_API_SECRET must be at least 20 characters');
  }
  return secret;
}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// ── Session / State ──
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionManager {
  ttlMs: number;
  sessions: Map<number | string, { value: any; lastSeen: number }>;
  cleanupInterval: ReturnType<typeof setInterval>;

  constructor(ttlMs = SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000);

    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  set(userId: number | string, data: any) {
    this.sessions.set(userId, {
      value: data,
      lastSeen: Date.now()
    });
  }

  get(userId: number | string): any {
    const record = this.sessions.get(userId);
    if (!record) return null;

    const now = Date.now();
    if (now - record.lastSeen > this.ttlMs) {
      this.sessions.delete(userId);
      return null;
    }

    record.lastSeen = now;
    return record.value;
  }

  delete(userId: number | string) {
    this.sessions.delete(userId);
  }

  cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, record] of this.sessions.entries()) {
      if (now - record.lastSeen > this.ttlMs) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired bot sessions`);
    }
  }
}

const userSessions = new SessionManager();
const userStates = new Map();
const pendingOperations = new Map(); // Track pending operations to prevent concurrent trades
let cachedSolPrice = 0;
let solPriceLastUpdated = 0;

// ── Utilities ──
const escapeMarkdown = (input: any): string => {
  const s = String(input ?? '');
  return s.replace(/([_*\[\]()`])/g, '\\$1');
};

const isAuthState = (state: any): boolean => {
  return state === 'awaiting_login_credentials' ||
         state === 'awaiting_registration' ||
         state === 'login_password' ||
         state === 'register_password';
};

const CHAIN_CONFIG: Record<string, { decimals: number; symbol: string; nativeName: string; name: string }> = {
  solana: { decimals: 9, symbol: 'SOL', nativeName: 'Solana', name: 'Solana' },
  base: { decimals: 18, symbol: 'ETH', nativeName: 'Base', name: 'Base' },
};

let cachedNativePrices = { sol: 0, eth: 0 };
let nativePricesLastUpdated = 0;

const formatNative = (atomic: any, chain = 'solana'): string => {
  const cfg = CHAIN_CONFIG[chain] || CHAIN_CONFIG.solana;
  const val = Number(atomic) / (10 ** cfg.decimals);
  return val.toFixed(4);
};

const formatTokenAmount = (atomic: any, decimals = 6): string => {
  const tokens = Number(atomic) / (10 ** decimals);
  return tokens.toFixed(2);
};

const formatNativeToUsd = (atomic: any, chain = 'solana'): string => {
  const price = chain === 'solana' ? cachedNativePrices.sol : cachedNativePrices.eth;
  if (!price || !Number.isFinite(price)) return 'N/A';
  const cfg = CHAIN_CONFIG[chain] || CHAIN_CONFIG.solana;
  const native = Number(atomic) / (10 ** cfg.decimals);
  const usd = native * price;
  if (!Number.isFinite(usd)) return 'N/A';
  return `$${usd.toFixed(2)}`;
};

const getNativePrices = async (token: string | null) => {
  const now = Date.now();
  if (cachedNativePrices.sol > 0 && cachedNativePrices.eth > 0 && (now - nativePricesLastUpdated) < 5000) {
    return cachedNativePrices;
  }

  const result = await apiRequest('/api/market/native-prices', 'GET', null, token);
  if (result.success && result.data) {
    cachedNativePrices = {
      sol: result.data.sol?.usd || cachedNativePrices.sol,
      eth: result.data.eth?.usd || cachedNativePrices.eth,
    };
    nativePricesLastUpdated = now;
    return cachedNativePrices;
  }

  console.warn('Failed to fetch native prices:', result.error || 'unavailable');
  return cachedNativePrices;
};

const formatSol = (lamports: any): string => formatNative(lamports, 'solana');
const formatSolToUsd = (lamports: any, solPrice = cachedNativePrices.sol): string => {
  if (!solPrice || !Number.isFinite(solPrice)) return 'N/A';
  const sol = Number(lamports) / 1_000_000_000;
  const usd = sol * solPrice;
  if (!Number.isFinite(usd)) return 'N/A';
  return `$${usd.toFixed(2)}`;
};
const getSolPrice = async (token: string | null) => {
  const prices = await getNativePrices(token);
  return prices.sol || null;
};

const isSolanaAddress = (text: string): boolean => {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(text.trim());
};

const isEvmAddress = (text: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(text.trim());
};

const detectChainFromAddress = (text: string): string | null => {
  if (isEvmAddress(text)) return 'base';
  if (isSolanaAddress(text)) return 'solana';
  return null;
};

const generateIdempotencyKey = (ctx: any, action: string, data = ''): string => {
  const userId = ctx.from?.id || 'unknown';
  const updateId = ctx.update?.update_id || Date.now();
  const sanitizedData = String(data).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  return `tg_${userId}_${updateId}_${action}_${sanitizedData}`.substring(0, 256);
};

const apiRequest = async (
  endpoint: string,
  method = 'GET',
  data: any = null,
  token: string | null = null,
  isBotRequest = false,
  extraHeaders: Record<string, string> = {}
) => {
  try {
    const headers: Record<string, string> = { ...extraHeaders };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (isBotRequest) {
      headers['x-bot-secret'] = getBotApiSecret();
    }

    const config: any = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers,
      withCredentials: false,
      timeout: 15000
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);

    if (response.data === undefined || response.data === null) {
      console.warn(`⚠️ API returned empty response for ${endpoint}`);
    }

    return {
      success: true,
      data: response.data,
      headers: response.headers
    };
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('❌ Network Error:', error.code, error.message);
      return {
        success: false,
        error: 'Network error - cannot reach server. Please try again.'
      };
    }

    if (error.code === 'ECONNABORTED') {
      console.error('❌ Request timeout:', endpoint);
      return {
        success: false,
        error: 'Request timeout - server took too long to respond.'
      };
    }

    console.error('API Error:', error.response?.data || error.message);

    let errorMessage = 'Unknown error occurred';
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (typeof error.message === 'string') {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

// Cleanup old user states every 30 minutes
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  let deletedCount = 0;

  for (const [userId, state] of userStates.entries()) {
    if (state.lastActivity && (now - state.lastActivity) > THIRTY_MINUTES) {
      userStates.delete(userId);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} inactive user states`);
  }
}, 30 * 60 * 1000);

// ── Helper functions ──
const getMainMenuKeyboard = (balance: any, baseBalance: any, chain: string) => {
  const solStr = formatNative(balance, 'solana');
  const ethStr = formatNative(baseBalance, 'base');
  const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

  return Markup.inlineKeyboard([
    [Markup.button.callback(`💰 SOL: ${solStr} | ETH: ${ethStr}`, 'noop')],
    [
      Markup.button.callback('📈 Buy', 'buy'),
      Markup.button.callback('📊 Portfolio', 'portfolio')
    ],
    [
      Markup.button.callback('📉 Sell', 'sell'),
      Markup.button.callback('📜 History', 'history')
    ],
    [
      Markup.button.callback('🏆 Leaderboard', 'leaderboard'),
      Markup.button.callback(`${chainEmoji} Chain: ${chain.toUpperCase()}`, 'chain_menu')
    ],
    [Markup.button.callback('❌ Logout', 'logout')]
  ]);
};

const showMainMenu = async (ctx: any) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  const result = await apiRequest('/api/auth/profile', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error fetching profile. Please /start to login again.');
  }

  const balance = result.data.balance;
  const baseBalance = result.data.baseBalance;
  const preferredChain = result.data.preferredChain || 'base';

  session.balance = BigInt(balance);
  session.baseBalance = BigInt(baseBalance);
  session.chain = preferredChain;

  return ctx.reply(
    `🎮 *SimFi Trading Bot*\n\nWelcome back, *${escapeMarkdown(result.data.username)}*!`,
    {
      parse_mode: 'Markdown',
      ...getMainMenuKeyboard(balance, baseBalance, preferredChain)
    }
  );
};

const showBuyMenu = async (ctx: any, tokenAddress: string, session: any) => {
  const userId = ctx.from.id;

  const detectedChain = detectChainFromAddress(tokenAddress);
  if (!detectedChain) {
    return ctx.reply(
      '❌ Invalid token address.\n\n' +
      'Please paste a valid address:\n' +
      '• Solana: base58 format (e.g. So1111...1112)\n' +
      '• Base: 0x + 40 hex chars (e.g. 0x4200...0006)'
    );
  }

  const chain = detectedChain;
  const cfg = CHAIN_CONFIG[chain];

  let loadingMsg;
  try {
    loadingMsg = await ctx.reply(`🔍 Fetching ${cfg.nativeName} token info...`);
  } catch (e) {
    console.error('Failed to send loading message:', e);
  }

  const result = await apiRequest(`/api/tokens/${tokenAddress}?chain=${chain}`, 'GET', null, session.token);

  try {
    if (loadingMsg?.message_id) {
      await ctx.deleteMessage(loadingMsg.message_id);
    }
  } catch (e: any) {
    console.log('ℹ️ Could not delete loading message:', e.message);
  }

  if (!result.success) {
    userStates.delete(userId);

    if (result.error && result.error.includes('liquidity')) {
      return ctx.reply(
        `❌ This token doesn't meet liquidity requirements.\n\n` +
        `Minimum: $1,000 liquidity, $500 daily volume\n\n` +
        `Try a more established token.`
      );
    }

    return ctx.reply(
      '❌ Could not fetch token info.\n\n' +
      `This token may not be listed on DexScreener or may not have a ${cfg.nativeName} trading pair.\n\n` +
      'Please try another token or use /start to return to the main menu.'
    );
  }

  const token = result.data.token;
  const priceNative = BigInt(token.price);
  const priceDisplay = Number(priceNative) / (10 ** cfg.decimals);
  const prices = await getNativePrices(session.token);
  const nativePriceUsd = chain === 'solana' ? prices.sol : prices.eth;
  const priceInUsd = nativePriceUsd ? (priceDisplay * nativePriceUsd) : null;

  userStates.set(userId, {
    state: 'awaiting_buy_amount',
    tokenAddress,
    chain,
    token: {
      name: token.name,
      symbol: token.symbol,
      price: priceNative.toString()
    },
    lastActivity: Date.now()
  });

  const priceUsdStr = priceInUsd ? `($${priceInUsd.toFixed(6)})` : '';

  const quickAmounts = chain === 'solana'
    ? [['0.1 SOL', '0.1'], ['0.5 SOL', '0.5'], ['1 SOL', '1'], ['5 SOL', '5']]
    : [['0.05 ETH', '0.05'], ['0.1 ETH', '0.1'], ['0.5 ETH', '0.5'], ['1 ETH', '1']];

  await ctx.reply(
    `📊 *${escapeMarkdown(token.symbol)}* \(${cfg.nativeName}\)\n` +
    `${escapeMarkdown(token.name)}\n\n` +
    `💰 Price: ${priceDisplay.toFixed(9)} ${cfg.symbol} ${priceUsdStr}\n` +
    `⚠️ Note: ~0.5% slippage will be applied\n\n` +
    `How much ${cfg.symbol} do you want to spend?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(quickAmounts[0][0], `buy_amt:${quickAmounts[0][1]}`),
          Markup.button.callback(quickAmounts[1][0], `buy_amt:${quickAmounts[1][1]}`),
        ],
        [
          Markup.button.callback(quickAmounts[2][0], `buy_amt:${quickAmounts[2][1]}`),
          Markup.button.callback(quickAmounts[3][0], `buy_amt:${quickAmounts[3][1]}`),
        ],
        [Markup.button.callback('✏️ Custom Amount', 'buy_custom')],
        [Markup.button.callback('« Back to Menu', 'main_menu')]
      ])
    }
  );
};

// ── Bot Factory ──
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Global error handler
  bot.catch((err: any, ctx: any) => {
    console.error('❌ Telegraf error:', err.message);
    try {
      ctx.reply('❌ An error occurred. Please try again or use /start to restart.');
    } catch (e) {
      console.error('Failed to send error message to user:', e);
    }
  });

  // Debug middleware with credential redaction
  bot.use(async (ctx: any, next: any) => {
    const updateType = ctx.updateType;
    const userId = ctx.from?.id;
    const username = ctx.from?.username || ctx.from?.first_name;

    console.log(`[MIDDLEWARE] 📨 Received update: ${updateType} from user ${userId} (@${username})`);

    if (ctx.message?.text) {
      const st = userStates.get(userId);
      const redacted = st && isAuthState(st.state);
      console.log(`[MIDDLEWARE]    Message text: "${redacted ? '[REDACTED]' : ctx.message.text}"`);
    }
    if (ctx.callbackQuery) {
      console.log(`[MIDDLEWARE]    Callback data: "${ctx.callbackQuery.data}"`);
    }

    try {
      await next();
      console.log(`[MIDDLEWARE] ✅ Finished processing ${updateType}`);
    } catch (err: any) {
      console.error(`[MIDDLEWARE] ❌ Middleware error:`, err.message);
      throw err;
    }
  });

  bot.command('start', async (ctx: any) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;

    console.log(`📱 User ${userId} (@${username}) started the bot`);

    const session = userSessions.get(userId);

    if (session) {
      console.log(`✅ User ${userId} has active session`);
      return showMainMenu(ctx);
    }

    const telegramUserId = userId.toString();
    const sessionResult = await apiRequest(`/api/telegram/session/${telegramUserId}`, 'GET', null, null, true);

    if (sessionResult.success && sessionResult.data.session) {
      const dbSession = sessionResult.data.session;

      const profileTest = await apiRequest('/api/auth/profile', 'GET', null, dbSession.token);

      if (profileTest.success) {
        const profile = profileTest.data;
        const balanceSol = profile.balance || dbSession.balance || 0;
        const balanceEth = profile.baseBalance || 0;
        const preferredChain = profile.preferredChain || 'base';

        let balanceValue;
        if (typeof balanceSol === 'bigint') {
          balanceValue = balanceSol;
        } else if (typeof balanceSol === 'string' || typeof balanceSol === 'number') {
          balanceValue = BigInt(balanceSol);
        } else {
          balanceValue = BigInt(0);
        }

        let baseBalanceValue;
        if (typeof balanceEth === 'bigint') {
          baseBalanceValue = balanceEth;
        } else if (typeof balanceEth === 'string' || typeof balanceEth === 'number') {
          baseBalanceValue = BigInt(balanceEth);
        } else {
          baseBalanceValue = BigInt(0);
        }

        userSessions.set(userId, {
          username: dbSession.username || profile.username,
          token: dbSession.token,
          balance: balanceValue,
          baseBalance: baseBalanceValue,
          chain: preferredChain
        });

        await ctx.reply('👋 Welcome back! Your session has been restored.');
        return showMainMenu(ctx);
      } else {
        await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
      }
    }

    await ctx.reply(
      `👋 Welcome to *SimFi Trading Bot*!\n\n` +
      `Paper trade tokens on Solana and Base with ease.\n\n` +
      `Please choose an option:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔐 Login', 'login')],
          [Markup.button.callback('📝 Register', 'register')]
        ])
      }
    );
  });

  bot.command('help', async (ctx: any) => {
    const session = userSessions.get(ctx.from.id);
    const loggedIn = !!session;

    let message = `📚 *SimFi Bot Commands*\n\n`;
    message += `/start - Start bot & show main menu\n`;
    message += `/help - Show this help message\n\n`;

    if (loggedIn) {
      message += `*Trading:*\n`;
      message += `/buy - Buy a token by address\n`;
      message += `/sell - Sell your open positions\n\n`;
      message += `*Portfolio:*\n`;
      message += `/portfolio - View your holdings\n`;
      message += `/balance - Check your balance\n`;
      message += `/history - View trade history\n\n`;
      message += `*Social:*\n`;
      message += `/leaderboard - View top traders\n\n`;
      message += `*Account:*\n`;
      message += `/logout - Log out of your account\n`;
    } else {
      message += `Please /start to login or register first.`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('buy', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Please /start to login first.');
    }

    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    const args = ctx.message.text.split(/\s+/).slice(1);

    if (args.length > 0 && detectChainFromAddress(args[0])) {
      await showBuyMenu(ctx, args[0], session);
    } else {
      userStates.set(userId, {
        state: 'awaiting_buy_token',
        lastActivity: Date.now()
      });

      await ctx.reply(
        '📈 *Buy Token*\n\n' +
        'Please send the token address you want to buy.\n\n' +
        '💡 Tip: You can also use `/buy <address>` directly.\n' +
        'Supports both Solana (base58) and Base (0x...) addresses.',
        { parse_mode: 'Markdown' }
      );
    }
  });

  bot.command('sell', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Please /start to login first.');
    }

    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const positions = result.data.positions || [];

    if (positions.length === 0) {
      return ctx.reply(
        '📉 *Sell Position*\n\n' +
        'You have no open positions to sell.',
        { parse_mode: 'Markdown' }
      );
    }

    const buttons = positions.map((pos: any) => {
      const chain = pos.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const currentValue = BigInt(pos.currentValue || 0);
      const costBasis = BigInt(pos.solSpent || 0);
      const profitLoss = currentValue - costBasis;
      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

      return [Markup.button.callback(
        `${profitEmoji} ${chainEmoji} ${pos.tokenSymbol} (${formatNative(currentValue, chain)} ${cfg.symbol})`,
        `sell_pos:${pos.id}`
      )];
    });

    buttons.push([Markup.button.callback('« Back to Menu', 'main_menu')]);

    await ctx.reply(
      '📉 *Sell Position*\n\n' +
      'Select a position to sell:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
  });

  bot.command('portfolio', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Please /start to login first.');
    }

    const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const positions = result.data.positions || [];

    if (positions.length === 0) {
      return ctx.reply(
        '📊 *Your Portfolio*\n\n' +
        'You have no open positions.\n\n' +
        'Use /buy to start trading!',
        { parse_mode: 'Markdown' }
      );
    }

    let message = '📊 *Your Portfolio*\n\n';
    let totalSolValue = BigInt(0);
    let totalEthValue = BigInt(0);

    for (const pos of positions) {
      const chain = pos.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const currentValue = BigInt(pos.currentValue || 0);
      const costBasis = BigInt(pos.solSpent || 0);
      const profitLoss = currentValue - costBasis;
      const profitPercent = costBasis > 0n
        ? (Number(profitLoss) / Number(costBasis)) * 100
        : 0;

      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const profitSign = profitLoss > 0n ? '+' : '';
      const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

      message += `${profitEmoji} *${escapeMarkdown(pos.tokenSymbol)}* ${chainEmoji}\n`;
      message += `Amount: ${formatTokenAmount(pos.amount, pos.decimals ?? 6)} ${escapeMarkdown(pos.tokenSymbol)}\n`;
      message += `Value: ${formatNative(currentValue, chain)} ${cfg.symbol}\n`;
      message += `P/L: ${profitSign}${formatNative(profitLoss, chain)} ${cfg.symbol} (${profitSign}${profitPercent.toFixed(2)}%)\n\n`;

      if (chain === 'solana') {
        totalSolValue += currentValue;
      } else {
        totalEthValue += currentValue;
      }
    }

    message += `💰 *Total Value:*\n`;
    if (totalSolValue > 0n) message += `  ☀️ ${formatNative(totalSolValue, 'solana')} SOL\n`;
    if (totalEthValue > 0n) message += `  🔷 ${formatNative(totalEthValue, 'base')} ETH\n`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('balance', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Please /start to login first.');
    }

    const result = await apiRequest('/api/auth/profile', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error fetching balance. Please /start to login again.');
    }

    const prices = await getNativePrices(session.token);
    const balanceSol = result.data.balance;
    const balanceEth = result.data.baseBalance;
    const solUsd = prices.sol ? (Number(balanceSol) / 1e9 * prices.sol) : null;
    const ethUsd = prices.eth ? (Number(balanceEth) / 1e18 * prices.eth) : null;
    const totalUsd = (solUsd || 0) + (ethUsd || 0);

    await ctx.reply(
      `💰 *Your Balance*\n\n` +
      `☀️ Solana: *${formatNative(balanceSol, 'solana')} SOL*${solUsd ? ` (~$${solUsd.toFixed(2)})` : ''}\n` +
      `🔷 Base: *${formatNative(balanceEth, 'base')} ETH*${ethUsd ? ` (~$${ethUsd.toFixed(2)})` : ''}\n\n` +
      `💵 Total: ~$${totalUsd.toFixed(2)}\n\n` +
      `Use /buy to trade or /portfolio to see holdings.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('history', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Please /start to login first.');
    }

    const result = await apiRequest('/api/trades/history?page=1', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const trades = result.data.trades || [];

    if (trades.length === 0) {
      return ctx.reply(
        '📜 *Trade History*\n\n' +
        'No trades yet. Use /buy to start trading!',
        { parse_mode: 'Markdown' }
      );
    }

    let message = '📜 *Recent Trades*\n\n';

    for (const trade of trades.slice(0, 10)) {
      const chain = trade.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const profitLoss = BigInt(trade.profitLoss || 0);
      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const profitSign = profitLoss > 0n ? '+' : '';
      const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

      message += `${profitEmoji} *${escapeMarkdown(trade.tokenSymbol)}* ${chainEmoji}\n`;
      message += `Amount: ${formatTokenAmount(trade.amount, trade.decimals ?? 6)}\n`;
      message += `P/L: ${profitSign}${formatNative(profitLoss, chain)} ${cfg.symbol}\n`;
      message += `Date: ${new Date(trade.closedAt).toLocaleDateString()}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('leaderboard', async (ctx: any) => {
    await ctx.reply(
      '🏆 *Leaderboard*\n\n' +
      'Choose a leaderboard:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🌍 Overall', 'lb_overall')],
          [Markup.button.callback('📅 Current Period', 'lb_period')],
          [Markup.button.callback('« Back to Menu', 'main_menu')]
        ])
      }
    );
  });

  bot.command('logout', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ You are not logged in. Use /start to login.');
    }

    const telegramUserId = userId.toString();
    await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);

    userSessions.delete(userId);
    userStates.delete(userId);

    await ctx.reply(
      '👋 You have been logged out.\n\n' +
      'Use /start to login again.'
    );
  });

  bot.action('login', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;

    userStates.set(userId, {
      state: 'awaiting_login_credentials',
      lastActivity: Date.now()
    });

    await ctx.reply(
      '🔐 *Login*\n\n' +
      'Please send your credentials in this format:\n' +
      '`email password`\n' +
      'or\n' +
      '`username password`\n\n' +
      'Example: `user@example.com mypassword`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('register', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;

    userStates.set(userId, {
      state: 'awaiting_registration',
      lastActivity: Date.now()
    });

    await ctx.reply(
      '📝 *Registration*\n\n' +
      'Please send your details in this format:\n' +
      '`email username password solana_wallet base_wallet`\n\n' +
      'At least one wallet address is required.\n' +
      '• Solana: base58 (e.g. `So1111...1112`)\n' +
      '• Base: 0x + 40 hex chars (e.g. `0x4200...0006`)\n\n' +
      'Example:\n' +
      '`user@example.com myusername mypassword 0x1234567890123456789012345678901234567890`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('logout', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;

    const telegramUserId = userId.toString();
    await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);

    userSessions.delete(userId);
    userStates.delete(userId);

    await ctx.reply(
      '👋 You have been logged out.\n\n' +
      'Use /start to login again.'
    );
  });

  bot.action('buy', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    userStates.set(userId, {
      state: 'awaiting_buy_token',
      lastActivity: Date.now()
    });

    await ctx.reply(
      '📈 *Buy Token*\n\n' +
      'Please send the token address you want to buy.\n' +
      'Supports both Solana (base58) and Base (0x...) addresses.',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('buy_custom', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;

    const state = userStates.get(userId);
    if (!state || !state.token) {
      return ctx.reply('❌ Session expired. Please try again.');
    }

    const chain = state.chain || 'solana';
    const cfg = CHAIN_CONFIG[chain];

    userStates.set(userId, {
      ...state,
      state: 'awaiting_buy_amount_custom',
      lastActivity: Date.now()
    });

    await ctx.reply(
      `✏️ Enter the amount of ${cfg.symbol} you want to spend:\n\n` +
      `Example: ${chain === 'solana' ? '0.25' : '0.05'}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.action(/^buy_amt:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const amount = parseFloat(ctx.match[1]);
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const session = userSessions.get(userId);

    if (!session) {
      userStates.delete(userId);
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    if (!state || !state.token) {
      return ctx.reply('❌ Session expired. Please try again.');
    }

    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    pendingOperations.set(userId, true);

    try {
      const loadingMsg = await ctx.reply('⏳ Processing buy order...');

      const idempotencyKey = generateIdempotencyKey(ctx, 'buy', `${state.tokenAddress}_${amount}`);

      const chain = state.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const result = await apiRequest('/api/trades/buy', 'POST', {
        tokenAddress: state.tokenAddress,
        tokenName: state.token.name,
        tokenSymbol: state.token.symbol,
        amount,
        chain,
      }, session.token, false, {
        'x-idempotency-key': idempotencyKey
      });

      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e: any) {
        console.log('ℹ️ Could not delete loading message:', e.message);
      }

      if (!result.success) {
        userStates.delete(userId);

        if (result.error && result.error.includes('liquidity')) {
          return ctx.reply(
            `❌ This token doesn't meet liquidity requirements.\n\n` +
            `Minimum: $1,000 liquidity, $500 daily volume\n\n` +
            `Try a more established token.`
          );
        }

        return ctx.reply('❌ Error: ' + result.error);
      }

      userStates.delete(userId);
      const tokenAmount = result.data.tokensReceived || 0;
      const decimals = result.data.decimals ?? 6;

      await ctx.reply(
        `✅ Successfully bought *${escapeMarkdown(state.token.symbol)}*!\n\n` +
        `Amount: *${formatTokenAmount(tokenAmount, decimals)} ${escapeMarkdown(state.token.symbol)}*\n` +
        `Spent: *${amount} ${cfg.symbol}*`,
        { parse_mode: 'Markdown' }
      );

      await showMainMenu(ctx);
    } finally {
      pendingOperations.delete(userId);
    }
  });

  bot.action('sell', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const positions = result.data.positions || [];

    if (positions.length === 0) {
      return ctx.reply(
        '📉 *Sell Position*\n\n' +
        'You have no open positions to sell.',
        { parse_mode: 'Markdown' }
      );
    }

    const buttons = positions.map((pos: any) => {
      const chain = pos.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const currentValue = BigInt(pos.currentValue || 0);
      const costBasis = BigInt(pos.solSpent || 0);
      const profitLoss = currentValue - costBasis;
      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

      return [Markup.button.callback(
        `${profitEmoji} ${chainEmoji} ${pos.tokenSymbol} (${formatNative(currentValue, chain)} ${cfg.symbol})`,
        `sell_pos:${pos.id}`
      )];
    });

    buttons.push([Markup.button.callback('« Back to Menu', 'main_menu')]);

    await ctx.reply(
      '📉 *Sell Position*\n\n' +
      'Select a position to sell:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
  });

  bot.action(/^sell_pos:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const positionId = ctx.match[1];
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);
    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const positions = result.data.positions || [];
    const position = positions.find((p: any) => p.id === positionId);

    if (!position) {
      return ctx.reply('❌ Position not found. It may have been already closed.');
    }

    const chain = position.chain || 'solana';
    const cfg = CHAIN_CONFIG[chain];
    const currentValue = BigInt(position.currentValue || 0);
    const costBasis = BigInt(position.solSpent || 0);
    const profitLoss = currentValue - costBasis;
    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';

    await ctx.reply(
      `📉 *Sell ${escapeMarkdown(position.tokenSymbol)}*\n\n` +
      `${profitEmoji} Current Value: ${formatNative(currentValue, chain)} ${cfg.symbol}\n` +
      `💰 Cost Basis: ${formatNative(costBasis, chain)} ${cfg.symbol}\n` +
      `P/L: ${profitLoss > 0n ? '+' : ''}${formatNative(profitLoss, chain)} ${cfg.symbol}\n\n` +
      `Select how much to sell:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('25%', `sell_pct:${positionId}:25`),
            Markup.button.callback('50%', `sell_pct:${positionId}:50`),
          ],
          [
            Markup.button.callback('75%', `sell_pct:${positionId}:75`),
            Markup.button.callback('100% (All)', `sell_pct:${positionId}:100`),
          ],
          [Markup.button.callback('« Back to Menu', 'main_menu')]
        ])
      }
    );
  });

  bot.action(/^sell_pct:(.+):(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const positionId = ctx.match[1];
    const percentage = parseInt(ctx.match[2], 10);
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    pendingOperations.set(userId, true);

    try {
      const posResult = await apiRequest('/api/trades/positions', 'GET', null, session.token);
      if (!posResult.success) {
        return ctx.reply('❌ Error: ' + posResult.error);
      }

      const positions = posResult.data.positions || [];
      const position = positions.find((p: any) => p.id === positionId);
      if (!position) {
        return ctx.reply('❌ Position not found. It may have been already closed.');
      }

      const isFullSell = percentage >= 100;
      const positionAmount = BigInt(position.amount || 0);
      const sellAmount = isFullSell
        ? positionAmount
        : (positionAmount * BigInt(percentage)) / 100n;

      const loadingMsg = await ctx.reply('⏳ Processing sell order...');
      const idempotencyKey = generateIdempotencyKey(ctx, 'sell', `${positionId}_${percentage}`);

      const result = await apiRequest('/api/trades/sell', 'POST', {
        positionId,
        amountLamports: sellAmount.toString(),
        chain: position.chain || 'solana',
      }, session.token, false, {
        'x-idempotency-key': idempotencyKey
      });

      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e: any) {
        console.log('ℹ️ Could not delete loading message:', e.message);
      }

      if (!result.success) {
        return ctx.reply('❌ Error: ' + result.error);
      }

      const chain = position.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const profitLoss = BigInt(result.data.profitLoss || 0);
      const nativeReceived = BigInt(result.data.nativeReceived || 0);
      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const profitSign = profitLoss > 0n ? '+' : '';

      await ctx.reply(
        `✅ *Sold ${percentage}% of ${escapeMarkdown(position.tokenSymbol)}!*\n\n` +
        `${profitEmoji} P/L: ${profitSign}${formatNative(profitLoss, chain)} ${cfg.symbol}\n` +
        `💰 Received: ${formatNative(nativeReceived, chain)} ${cfg.symbol}`,
        { parse_mode: 'Markdown' }
      );

      await showMainMenu(ctx);
    } finally {
      pendingOperations.delete(userId);
    }
  });

  bot.action('portfolio', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const positions = result.data.positions || [];

    if (positions.length === 0) {
      return ctx.reply(
        '📊 *Your Portfolio*\n\n' +
        'You have no open positions.\n\n' +
        'Use the Buy button to start trading!',
        { parse_mode: 'Markdown' }
      );
    }

    let message = '📊 *Your Portfolio*\n\n';
    let totalSolValue = BigInt(0);
    let totalEthValue = BigInt(0);

    for (const pos of positions) {
      const chain = pos.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const currentValue = BigInt(pos.currentValue || 0);
      const costBasis = BigInt(pos.solSpent || 0);
      const profitLoss = currentValue - costBasis;
      const profitPercent = costBasis > 0n
        ? (Number(profitLoss) / Number(costBasis)) * 100
        : 0;

      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const profitSign = profitLoss > 0n ? '+' : '';
      const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

      message += `${profitEmoji} *${escapeMarkdown(pos.tokenSymbol)}* ${chainEmoji}\n`;
      message += `Amount: ${formatTokenAmount(pos.amount, pos.decimals ?? 6)} ${escapeMarkdown(pos.tokenSymbol)}\n`;
      message += `Value: ${formatNative(currentValue, chain)} ${cfg.symbol}\n`;
      message += `P/L: ${profitSign}${formatNative(profitLoss, chain)} ${cfg.symbol} (${profitSign}${profitPercent.toFixed(2)}%)\n\n`;

      if (chain === 'solana') {
        totalSolValue += currentValue;
      } else {
        totalEthValue += currentValue;
      }
    }

    message += `💰 *Total Value:*\n`;
    if (totalSolValue > 0n) message += `  ☀️ ${formatNative(totalSolValue, 'solana')} SOL\n`;
    if (totalEthValue > 0n) message += `  🔷 ${formatNative(totalEthValue, 'base')} ETH\n`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
  });

  bot.action('history', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    const result = await apiRequest('/api/trades/history?page=1', 'GET', null, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const trades = result.data.trades || [];

    if (trades.length === 0) {
      return ctx.reply(
        '📜 *Trade History*\n\n' +
        'No trades yet.',
        { parse_mode: 'Markdown' }
      );
    }

    let message = '📜 *Recent Trades*\n\n';

    for (const trade of trades.slice(0, 10)) {
      const chain = trade.chain || 'solana';
      const cfg = CHAIN_CONFIG[chain];
      const profitLoss = BigInt(trade.profitLoss || 0);
      const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
      const profitSign = profitLoss > 0n ? '+' : '';
      const chainEmoji = chain === 'solana' ? '☀️' : '🔷';

      message += `${profitEmoji} *${escapeMarkdown(trade.tokenSymbol)}* ${chainEmoji}\n`;
      message += `Amount: ${formatTokenAmount(trade.amount, trade.decimals ?? 6)}\n`;
      message += `P/L: ${profitSign}${formatNative(profitLoss, chain)} ${cfg.symbol}\n`;
      message += `Date: ${new Date(trade.closedAt).toLocaleDateString()}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
  });

  bot.action('leaderboard', async (ctx: any) => {
    await ctx.answerCbQuery();

    await ctx.reply(
      '🏆 *Leaderboard*\n\n' +
      'Choose a leaderboard:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🌍 Overall', 'lb_overall')],
          [Markup.button.callback('📅 Current Period', 'lb_period')],
          [Markup.button.callback('« Back to Menu', 'main_menu')]
        ])
      }
    );
  });

  bot.action('lb_overall', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);
    const chain = session?.chain || 'base';

    const result = await apiRequest(`/api/leaderboard/overall?chain=${chain}`, 'GET');

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const leaders = result.data.leaders || [];

    if (leaders.length === 0) {
      return ctx.reply('🏆 No leaderboard data yet.');
    }

    const cfg = CHAIN_CONFIG[chain];
    let message = `🏆 *Overall Leaderboard (${cfg.name})*\n\n`;
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < Math.min(leaders.length, 10); i++) {
      const leader = leaders[i];
      const profit = BigInt(leader.totalProfit || 0);
      const profitSign = profit > 0n ? '+' : '';
      const medal = medals[i] || `${i + 1}.`;

      message += `${medal} *${escapeMarkdown(leader.username)}*\n`;
      message += `   Profit: ${profitSign}${formatNative(profit, chain)} ${cfg.symbol}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.action('lb_period', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);
    const chain = session?.chain || 'base';

    const result = await apiRequest(`/api/leaderboard/current-period?chain=${chain}`, 'GET');

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const leaders = result.data.leaders || [];

    if (leaders.length === 0) {
      return ctx.reply('📅 No period leaderboard data yet.');
    }

    const cfg = CHAIN_CONFIG[chain];
    let message = `📅 *Current Period Leaderboard (${cfg.name})*\n\n`;
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < Math.min(leaders.length, 10); i++) {
      const leader = leaders[i];
      const profit = BigInt(leader.periodProfit || leader.totalProfit || 0);
      const profitSign = profit > 0n ? '+' : '';
      const medal = medals[i] || `${i + 1}.`;

      message += `${medal} *${escapeMarkdown(leader.username)}*\n`;
      message += `   Profit: ${profitSign}${formatNative(profit, chain)} ${cfg.symbol}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.action('main_menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    await showMainMenu(ctx);
  });

  bot.action('noop', async (ctx: any) => {
    await ctx.answerCbQuery();
  });

  bot.command('chain', async (ctx: any) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Please /start to login first.');
    }

    const currentChain = session.chain || 'base';

    await ctx.reply(
      `⛓️ *Select Chain*\n\n` +
      `Currently trading on: *${currentChain.toUpperCase()}*\n\n` +
      `Choose which chain to trade on:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('☀️ Solana', 'chain_solana'),
            Markup.button.callback('🔷 Base', 'chain_base'),
          ],
          [Markup.button.callback('« Back to Menu', 'main_menu')]
        ])
      }
    );
  });

  bot.action('chain_menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    const currentChain = session.chain || 'base';

    await ctx.reply(
      `⛓️ *Select Chain*\n\n` +
      `Currently trading on: *${currentChain.toUpperCase()}*\n\n` +
      `Choose which chain to trade on:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('☀️ Solana', 'chain_solana'),
            Markup.button.callback('🔷 Base', 'chain_base'),
          ],
          [Markup.button.callback('« Back to Menu', 'main_menu')]
        ])
      }
    );
  });

  bot.action('chain_solana', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    session.chain = 'solana';
    await ctx.reply('☀️ Switched to *Solana* chain.', { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
  });

  bot.action('chain_base', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) {
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    session.chain = 'base';
    await ctx.reply('🔷 Switched to *Base* chain.', { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
  });

  bot.on('text', async (ctx: any) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userStates.get(userId);

    if (!state) {
      return ctx.reply('Please use /start to begin.');
    }

    if (state.state === 'awaiting_registration') {
      const parts = text.split(/\s+/);

      if (parts.length < 3) {
        return ctx.reply(
          '❌ Invalid format. Please use:\n' +
          '`email username password [solana_wallet] [base_wallet]`\n\n' +
          'At least one wallet address is required.\n' +
          'Example: `user@example.com myusername mypassword 0x1234...5678`',
          { parse_mode: 'Markdown' }
        );
      }

      const [email, username, password, solanaWallet, baseWallet] = parts;

      const hasSolana = solanaWallet && isSolanaAddress(solanaWallet);
      const hasBase = baseWallet && isEvmAddress(baseWallet);
      if (!hasSolana && !hasBase) {
        return ctx.reply(
          '❌ At least one valid wallet address is required.\n\n' +
          'Please provide either:\n' +
          '• Solana address (base58, 32-44 chars)\n' +
          '• Base address (0x + 40 hex chars)\n\n' +
          'Example: `user@example.com myusername mypassword 0x1234567890123456789012345678901234567890`',
          { parse_mode: 'Markdown' }
        );
      }

      const loadingMsg = await ctx.reply('⏳ Creating account...');

      const preferredChain = hasBase ? 'base' : (hasSolana ? 'solana' : 'base');
      const payload: any = { email, username, password, preferredChain };
      if (hasSolana) payload.solanaWalletAddress = solanaWallet;
      if (hasBase) payload.baseWalletAddress = baseWallet;

      const result = await apiRequest('/api/telegram/auth/register', 'POST', payload, null, true);

      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e: any) {
        console.log('ℹ️ Could not delete loading message:', e.message);
      }

      if (!result.success) {
        userStates.delete(userId);

        const errorMsg = result.error || '';
        if (errorMsg.includes('already registered') || errorMsg.includes('Email already')) {
          return ctx.reply(
            `❌ Registration failed: This email is already registered!\n\n` +
            `💡 Use Login if you already have an account.`
          );
        }
        if (errorMsg.includes('already taken') || errorMsg.includes('Username already')) {
          return ctx.reply(
            `❌ Registration failed: This username is already taken!\n\n` +
            `💡 Try a different username.`
          );
        }

        return ctx.reply('❌ Registration failed: ' + result.error);
      }

      const user = result.data.user;
      const token = result.data.token;

      console.log(`✅ Bot user ${user.username} registered successfully`);

      const balanceSol = user.balance || 0;
      const balanceEth = user.baseBalance || 0;
      const userPreferredChain = user.preferredChain || 'base';

      userSessions.set(userId, {
        username: user.username,
        token,
        balance: BigInt(balanceSol),
        baseBalance: BigInt(balanceEth),
        chain: userPreferredChain
      });

      const telegramUserId = userId.toString();
      await apiRequest('/api/telegram/session', 'POST', {
        telegramUserId,
        userId: user.id,
        token,
        balance: String(balanceSol)
      }, null, true);

      userStates.delete(userId);

      const hasSolBalance = balanceSol > 0;
      const hasBaseBalance = balanceEth > 0;
      let balanceMsg = '';
      if (hasSolBalance) balanceMsg += `☀️ Solana: ${formatNative(balanceSol, 'solana')} SOL\n`;
      if (hasBaseBalance) balanceMsg += `🔷 Base: ${formatNative(balanceEth, 'base')} ETH\n`;

      await ctx.reply(
        `✅ *Registration successful!*\n\n` +
        `Welcome, *${escapeMarkdown(user.username)}*!\n\n` +
        `💰 Starting balances:\n${balanceMsg}`,
        { parse_mode: 'Markdown' }
      );

      await showMainMenu(ctx);
      return;
    }

    if (state.state === 'awaiting_login_credentials') {
      const parts = text.split(/\s+/);

      if (parts.length !== 2) {
        return ctx.reply(
          '❌ Invalid format. Please use:\n' +
          '`email password` or `username password`\n\n' +
          'Example: `user@example.com mypassword`',
          { parse_mode: 'Markdown' }
        );
      }

      const [identifier, password] = parts;
      const isEmail = identifier.includes('@');

      const loadingMsg = await ctx.reply('⏳ Logging in...');

      try {
        const result = await apiRequest('/api/telegram/auth/login', 'POST', {
          ...(isEmail ? { email: identifier } : { username: identifier }),
          password
        }, null, true);

        try {
          if (loadingMsg?.message_id) {
            await ctx.deleteMessage(loadingMsg.message_id);
          }
        } catch (e: any) {
          console.log('ℹ️ Could not delete loading message:', e.message);
        }

        if (!result.success) {
          userStates.delete(userId);

          const errorMsg = result.error || '';

          if (errorMsg.includes('Invalid credentials') || errorMsg.includes('not found') || errorMsg.includes('wrong password')) {
            return ctx.reply(
              `❌ Login failed: Email/username or password is incorrect.\n\n` +
              `💡 Please check:\n` +
              `• Email or username is correct\n` +
              `• Password is correct (case-sensitive)\n\n` +
              `Try again or use /start to restart.`
            );
          }
          if (errorMsg.includes('Invalid bot secret') || errorMsg.includes('Forbidden')) {
            return ctx.reply('❌ Bot authentication failed. Please contact support.');
          }

          return ctx.reply(`❌ Login failed: ${errorMsg}\n\nUse /start to try again.`);
        }

        if (!result.data || !result.data.user || !result.data.token) {
          console.error('❌ Invalid login response structure:', result.data);
          userStates.delete(userId);
          return ctx.reply('❌ Unexpected server response. Please try again.');
        }

        const user = result.data.user;
        const token = result.data.token;

        console.log(`✅ Bot user ${user.username} logged in successfully`);

        const balanceSol = user.balance || 0;
        const balanceEth = user.baseBalance || 0;
        const preferredChain = user.preferredChain || 'base';

        userSessions.set(userId, {
          username: user.username,
          token,
          balance: BigInt(balanceSol),
          baseBalance: BigInt(balanceEth),
          chain: preferredChain
        });

        const telegramUserId = userId.toString();
        await apiRequest('/api/telegram/session', 'POST', {
          telegramUserId,
          userId: user.id,
          token,
          balance: String(balanceSol)
        }, null, true);

        userStates.delete(userId);

        const hasSolBalance = balanceSol > 0;
        const hasBaseBalance = balanceEth > 0;
        let balanceMsg = '';
        if (hasSolBalance) balanceMsg += `☀️ Solana: ${formatNative(balanceSol, 'solana')} SOL\n`;
        if (hasBaseBalance) balanceMsg += `🔷 Base: ${formatNative(balanceEth, 'base')} ETH\n`;

        await ctx.reply(
          `✅ *Welcome back, ${escapeMarkdown(user.username)}!*\n\n` +
          `💰 Balances:\n${balanceMsg}`,
          { parse_mode: 'Markdown' }
        );
        await showMainMenu(ctx);
      } catch (error: any) {
        userStates.delete(userId);
        console.error('❌ Bot login exception:', error);
        await ctx.reply(
          '❌ An unexpected error occurred during login.\n\n' +
          '💡 Please use /start to try again.'
        );
      }
      return;
    }

    if (state.state === 'awaiting_buy_token') {
      const session = userSessions.get(userId);
      if (!session) {
        userStates.delete(userId);
        return ctx.reply('❌ Session expired. Please /start to login again.');
      }

      const tokenAddress = text.trim();
      await showBuyMenu(ctx, tokenAddress, session);
      return;
    }

    if (state.state === 'awaiting_buy_amount_custom') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Invalid amount. Please enter a positive number.');
      }

      const session = userSessions.get(userId);

      if (!session) {
        userStates.delete(userId);
        return ctx.reply('❌ Session expired. Please /start to login again.');
      }

      if (pendingOperations.get(userId)) {
        return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
      }

      pendingOperations.set(userId, true);

      try {
        const loadingMsg = await ctx.reply('⏳ Processing buy order...');

        const idempotencyKey = generateIdempotencyKey(ctx, 'buy', `${state.tokenAddress}_${amount}`);

        const chain = state.chain || 'solana';
        const cfg = CHAIN_CONFIG[chain];

        const result = await apiRequest('/api/trades/buy', 'POST', {
          tokenAddress: state.tokenAddress,
          tokenName: state.token.name,
          tokenSymbol: state.token.symbol,
          amount,
          chain,
        }, session.token, false, {
          'x-idempotency-key': idempotencyKey
        });

        try {
          if (loadingMsg?.message_id) {
            await ctx.deleteMessage(loadingMsg.message_id);
          }
        } catch (e: any) {
          console.log('ℹ️ Could not delete loading message:', e.message);
        }

        if (!result.success) {
          userStates.delete(userId);

          if (result.error && result.error.includes('liquidity')) {
            return ctx.reply(
              `❌ This token doesn't meet liquidity requirements.\n\n` +
              `Minimum: $1,000 liquidity, $500 daily volume\n\n` +
              `Try a more established token.`
            );
          }

          return ctx.reply('❌ Error: ' + result.error);
        }

        userStates.delete(userId);
        const tokenAmount = result.data.tokensReceived || 0;
        const decimals = result.data.decimals ?? 6;

        await ctx.reply(
          `✅ Successfully bought *${escapeMarkdown(state.token.symbol)}*!\n\n` +
          `Amount: *${formatTokenAmount(tokenAmount, decimals)} ${escapeMarkdown(state.token.symbol)}*\n` +
          `Spent: *${amount} ${cfg.symbol}*`,
          { parse_mode: 'Markdown' }
        );

        await showMainMenu(ctx);
      } finally {
        pendingOperations.delete(userId);
      }
      return;
    }
  });

  return bot;
}

export async function setupWebhook(bot: Telegraf, webhookUrl: string, secretToken: string): Promise<void> {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.telegram.setWebhook(webhookUrl, { secret_token: secretToken, drop_pending_updates: true });
}

export function getWebhookCallback(bot: Telegraf, secretToken: string) {
  return async (req: Request, res: Response) => {
    const headerToken = req.headers['x-telegram-bot-api-secret-token'];
    if (headerToken !== secretToken) {
      return res.sendStatus(401);
    }
    try {
      await bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (err: any) {
      console.error('❌ Webhook handler error:', err.message);
      res.sendStatus(500);
    }
  };
}
