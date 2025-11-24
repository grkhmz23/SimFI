// CRITICAL: Log immediately before any imports to ensure bot.js is executing
console.log('[BOT] ✅ bot.js file is executing');

import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';

console.log('[BOT] ✅ Imports completed');

// Use dev token in development, production token in production
const BOT_TOKEN = process.env.NODE_ENV === 'development' 
  ? process.env.TELEGRAM_BOT_TOKEN_DEV 
  : process.env.TELEGRAM_BOT_TOKEN;

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

console.log(`[BOT] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[BOT] Dev token present: ${!!process.env.TELEGRAM_BOT_TOKEN_DEV}`);
console.log(`[BOT] Prod token present: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
console.log(`[BOT] BOT_TOKEN selected: ${!!BOT_TOKEN}`);

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required in environment variables');
  console.error(`Environment: ${process.env.NODE_ENV}`);
  console.error(`Dev token present: ${!!process.env.TELEGRAM_BOT_TOKEN_DEV}`);
  console.error(`Prod token present: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
  process.exit(1);
}

console.log(`🤖 Starting bot in ${process.env.NODE_ENV} mode`);
console.log(`🔑 Using ${process.env.NODE_ENV === 'development' ? 'DEVELOPMENT' : 'PRODUCTION'} bot token`);

console.log('[BOT] ✅ Creating Telegraf instance...');
let bot;
try {
  bot = new Telegraf(BOT_TOKEN);
  console.log('[BOT] ✅ Telegraf instance created successfully');
} catch (err) {
  console.error('[BOT] ❌ Failed to create Telegraf instance:', err.message);
  console.error('[BOT] Stack:', err.stack);
  process.exit(1);
}

const userSessions = new Map();
const userStates = new Map();
const pendingOperations = new Map(); // Track pending operations to prevent concurrent trades
let cachedSolPrice = 0;
let solPriceLastUpdated = 0;

// Global error handler for unhandled errors
bot.catch((err, ctx) => {
  console.error('❌ Telegraf error:', err.message);
  try {
    ctx.reply('❌ An error occurred. Please try again or use /start to restart.');
  } catch (e) {
    console.error('Failed to send error message to user:', e);
  }
});

// Debug middleware to log all updates
bot.use(async (ctx, next) => {
  const updateType = ctx.updateType;
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name;
  
  console.log(`[MIDDLEWARE] 📨 Received update: ${updateType} from user ${userId} (@${username})`);
  console.log(`[MIDDLEWARE] Context keys: ${Object.keys(ctx).join(', ').substring(0, 200)}`);
  
  if (ctx.message?.text) {
    console.log(`[MIDDLEWARE]    Message text: "${ctx.message.text}"`);
  }
  if (ctx.callbackQuery) {
    console.log(`[MIDDLEWARE]    Callback data: "${ctx.callbackQuery.data}"`);
  }
  
  try {
    console.log(`[MIDDLEWARE] ↳ Calling next middleware...`);
    await next();
    console.log(`[MIDDLEWARE] ✅ Finished processing ${updateType}`);
  } catch (err) {
    console.error(`[MIDDLEWARE] ❌ Middleware error:`, err.message);
    throw err;
  }
});

// Cleanup old sessions and states every 30 minutes
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

const formatSol = (lamports) => {
  const sol = Number(lamports) / 1_000_000_000;
  return sol.toFixed(4);
};

const formatTokenAmount = (lamports, decimals = 6) => {
  const tokens = Number(lamports) / (10 ** decimals);
  return tokens.toFixed(2);
};

// Convert lamports (SOL) to USD
const formatSolToUsd = (lamports, solPrice = cachedSolPrice) => {
  const sol = Number(lamports) / 1_000_000_000;
  const usd = sol * solPrice;
  return `$${usd.toFixed(2)}`;
};

// Get current SOL price - cached for 5 seconds to avoid repeated API calls
const getSolPrice = async (token) => {
  const now = Date.now();
  if (cachedSolPrice > 0 && (now - solPriceLastUpdated) < 5000) {
    return cachedSolPrice;
  }
  
  const result = await apiRequest('/api/solana/price', 'GET', null, token);
  if (result.success && result.data.price) {
    cachedSolPrice = result.data.price;
    solPriceLastUpdated = now;
    return result.data.price;
  }
  return cachedSolPrice || 138; // Fallback to last known price
};

// Helper function to detect Solana token addresses
const isSolanaAddress = (text) => {
  // Solana addresses are base58 encoded, typically 32-44 characters
  // They only contain: 1-9, A-H, J-N, P-Z, a-k, m-z (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(text.trim());
};

const apiRequest = async (endpoint, method = 'GET', data = null, token = null, isBotRequest = false) => {
  try {
    const headers = {};
    
    // Use standard Bearer token authentication (not Cookie)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add bot secret for telegram session endpoints
    if (isBotRequest) {
      headers['x-bot-secret'] = BOT_TOKEN;
    }
    
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers,
      withCredentials: false,
      timeout: 15000 // 15 second timeout for faster responses
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    
    // Validate response has data (Bug #18)
    if (response.data === undefined || response.data === null) {
      console.warn(`⚠️ API returned empty response for ${endpoint}`);
    }
    
    return { 
      success: true, 
      data: response.data,
      headers: response.headers 
    };
  } catch (error) {
    // Better error handling for network vs API errors (Bug #14)
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('❌ Network Error:', error.code, error.message);
      return {
        success: false,
        error: 'Network error - cannot reach server. Please try again.'
      };
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED') {
      console.error('❌ Request timeout:', endpoint);
      return {
        success: false,
        error: 'Request timeout - server took too long to respond.'
      };
    }
    
    console.error('API Error:', error.response?.data || error.message);
    
    // Robust error message extraction (Bug #13)
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

const getMainMenuKeyboard = (balance) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`💰 Balance: ${formatSol(balance)} SOL`, 'noop')],
    [
      Markup.button.callback('📈 Buy', 'buy'),
      Markup.button.callback('📉 Sell', 'sell')
    ],
    [
      Markup.button.callback('📊 Positions', 'positions'),
      Markup.button.callback('🏆 Leaderboard', 'leaderboard')
    ],
    [Markup.button.callback('🚪 Logout', 'logout')]
  ]);
};

const showMainMenu = async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  const result = await apiRequest('/api/auth/profile', 'GET', null, session.token);
  if (!result.success) {
    userSessions.delete(ctx.from.id);
    return ctx.reply('Session expired. Please /start to login again.');
  }

  // Profile endpoint returns user object directly, not wrapped
  const user = result.data;
  session.balance = user.balance;
  
  await ctx.reply(
    `🎮 *Solana Paper Trading Bot*\n\n` +
    `Welcome back, *${user.username}*!\n` +
    `Balance: *${formatSol(user.balance)} SOL*\n` +
    `Total Profit: *${formatSol(user.totalProfit)} SOL*`,
    { 
      parse_mode: 'Markdown',
      ...getMainMenuKeyboard(user.balance)
    }
  );
};

// Helper function to show buy menu for a token
const showBuyMenu = async (ctx, tokenAddress, session) => {
  const userId = ctx.from.id;
  
  const result = await apiRequest(`/api/tokens/${tokenAddress}`, 'GET', null, session.token);
  if (!result.success) {
    if (result.error.includes('expired') || result.error.includes('auth')) {
      userSessions.delete(userId);
      userStates.delete(userId);
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }
    return ctx.reply(
      '❌ Token not found. Please check the address and try again.',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  const token = result.data.token;
  userStates.set(userId, {
    state: 'awaiting_buy_amount',
    tokenAddress,
    token,
    lastActivity: Date.now()
  });

  // Format market cap safely (Bug #16)
  const marketCapStr = token.marketCap ? `$${token.marketCap.toLocaleString()}` : 'N/A';

  await ctx.reply(
    `📈 *${token.name} (${token.symbol})*\n\n` +
    `Price: *${formatSol(token.price)} SOL*\n` +
    `Market Cap: *${marketCapStr}*\n\n` +
    `How much SOL do you want to spend?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('0.1 SOL', 'buy_amt:0.1'),
          Markup.button.callback('0.5 SOL', 'buy_amt:0.5'),
        ],
        [
          Markup.button.callback('1 SOL', 'buy_amt:1'),
          Markup.button.callback('5 SOL', 'buy_amt:5'),
        ],
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    }
  );
};

bot.start(async (ctx) => {
  const telegramUserId = ctx.from.id.toString();
  
  // Check if user has an existing session
  const sessionResult = await apiRequest(`/api/telegram/session/${telegramUserId}`, 'GET', null, null, true);
  
  if (sessionResult.success && sessionResult.data.session) {
    const session = sessionResult.data.session;
    
    // Validate token is still valid by testing with profile endpoint (Bug #11)
    const profileTest = await apiRequest('/api/auth/profile', 'GET', null, session.token);
    
    if (profileTest.success) {
      // Safe BigInt conversion - check type first (Bug #7)
      let balanceValue;
      if (typeof session.balance === 'bigint') {
        balanceValue = session.balance;
      } else if (typeof session.balance === 'string' || typeof session.balance === 'number') {
        balanceValue = BigInt(session.balance);
      } else {
        balanceValue = BigInt(0);
      }
      
      userSessions.set(ctx.from.id, {
        username: session.username,
        token: session.token,
        balance: balanceValue
      });
      
      await ctx.reply('👋 Welcome back! Your session has been restored.');
      await showMainMenu(ctx);
      return;
    } else {
      // Token expired or invalid, delete the session
      await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
    }
  }
  
  // No existing session, show auth options
  await ctx.reply(
    '👋 Welcome to Solana Paper Trading Bot!\n\n' +
    'Create a new account or login to existing one:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📝 Register', 'register_start')],
      [Markup.button.callback('🔐 Login', 'login_start')]
    ])
  );
});

// Register command/action
bot.command('register', async (ctx) => {
  await ctx.answerCbQuery?.();
  userStates.set(ctx.from.id, { state: 'register_email', lastActivity: Date.now() });
  await ctx.reply('📝 *Registration*\n\nEnter your email address:', { parse_mode: 'Markdown' });
});

bot.action('register_start', async (ctx) => {
  await ctx.answerCbQuery();
  userStates.set(ctx.from.id, { state: 'register_email', lastActivity: Date.now() });
  await ctx.reply('📝 *Registration*\n\nEnter your email address:', { parse_mode: 'Markdown' });
});

// Login command/action - supports both email AND username
bot.command('login', async (ctx) => {
  await ctx.answerCbQuery?.();
  userStates.set(ctx.from.id, { state: 'login_identifier', lastActivity: Date.now() });
  await ctx.reply(
    '🔐 *Login*\n\n' +
    'Enter your *email* or *username*:',
    { parse_mode: 'Markdown' }
  );
});

bot.action('login_start', async (ctx) => {
  await ctx.answerCbQuery();
  userStates.set(ctx.from.id, { state: 'login_identifier', lastActivity: Date.now() });
  await ctx.reply(
    '🔐 *Login*\n\n' +
    'Enter your *email* or *username*:',
    { parse_mode: 'Markdown' }
  );
});

bot.command('logout', async (ctx) => {
  const telegramUserId = ctx.from.id.toString();
  
  // Delete session from database
  await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
  
  // Delete from memory
  userSessions.delete(ctx.from.id);
  userStates.delete(ctx.from.id);
  
  await ctx.reply('✅ Logged out successfully. Use /start to login again.');
});

// Buy command
bot.command('buy', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  
  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }
  
  userStates.set(ctx.from.id, { state: 'awaiting_buy_token', lastActivity: Date.now() });
  await ctx.reply(
    '🔍 Enter the token contract address you want to buy:',
    Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'main_menu')]
    ])
  );
});

// Sell command
bot.command('sell', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);
  if (!result.success) {
    return ctx.reply('❌ Error fetching positions: ' + result.error);
  }

  const positions = result.data.positions || [];
  if (positions.length === 0) {
    return ctx.reply(
      '📉 You have no open positions to sell.',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  const buttons = positions.map(pos => [
    Markup.button.callback(
      `${pos.tokenSymbol} (${formatTokenAmount(pos.amount, pos.decimals || 6)})`,
      `sell_token:${pos.tokenAddress}`
    )
  ]);
  buttons.push([Markup.button.callback('⬅️ Back', 'main_menu')]);

  await ctx.reply(
    '📉 Select a position to sell:',
    Markup.inlineKeyboard(buttons)
  );
});

// Positions command
bot.command('positions', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
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
      '📊 You have no open positions.',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  const buttons = positions.map(pos => [
    Markup.button.callback(
      `${pos.tokenSymbol} (${formatTokenAmount(pos.amount, pos.decimals || 6)})`,
      `view_position:${pos.id}`
    )
  ]);
  buttons.push([Markup.button.callback('⬅️ Back', 'main_menu')]);

  await ctx.reply(
    '📊 *Your Positions:*\n\nSelect a position to view details:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
});

// Leaderboard command
bot.command('leaderboard', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  const result = await apiRequest('/api/leaderboard', 'GET', null, session.token);
  if (!result.success) {
    return ctx.reply('❌ Error fetching leaderboard: ' + result.error);
  }

  const leaders = result.data.leaders || [];
  if (leaders.length === 0) {
    return ctx.reply(
      '🏆 No leaderboard data available yet. Try again later.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'leaderboard_refresh')],
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  const medals = ['🥇', '🥈', '🥉'];
  const leaderboardText = leaders
    .map((leader, idx) => {
      const medal = medals[idx] || `${idx + 1}.`;
      return `${medal} ${leader.username} - +${formatSol(leader.totalProfit)} SOL`;
    })
    .join('\n');

  await ctx.reply(
    `🏆 *Leaderboard (6-Hour Period)*\n\n${leaderboardText}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'leaderboard_refresh')],
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    }
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.action('buy', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }
  
  userStates.set(ctx.from.id, { state: 'awaiting_buy_token', lastActivity: Date.now() });
  await ctx.reply(
    '🔍 Enter the token contract address you want to buy:',
    Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'main_menu')]
    ])
  );
});

bot.action('sell', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);
  if (!result.success) {
    return ctx.reply('❌ Error fetching positions: ' + result.error);
  }

  const positions = result.data.positions || [];
  if (positions.length === 0) {
    return ctx.reply(
      'You have no open positions to sell.',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  const buttons = positions.map(pos => [
    Markup.button.callback(
      `${pos.tokenSymbol} (${formatTokenAmount(pos.amount, pos.decimals || 6)})`,
      `sell_token:${pos.tokenAddress}`
    )
  ]);
  buttons.push([Markup.button.callback('⬅️ Back', 'main_menu')]);

  await ctx.reply(
    '📉 Select a position to sell:',
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/^sell_token:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tokenAddress = ctx.match[1];
  const session = userSessions.get(ctx.from.id);
  
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }
  
  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);
  
  if (!result.success) {
    userSessions.delete(ctx.from.id);
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }
  
  const positions = result.data.positions || [];
  const position = positions.find(p => p.tokenAddress === tokenAddress);
  
  if (!position) {
    return ctx.reply('❌ Position not found.');
  }

  userStates.set(ctx.from.id, { 
    state: 'awaiting_sell_percentage',
    tokenAddress,
    position,
    lastActivity: Date.now()
  });

  // Get current SOL price for USD conversion
  const solPrice = await getSolPrice(session.token);
  const entryPriceSol = formatSol(position.entryPrice);
  const entryPriceUsd = formatSolToUsd(position.entryPrice, solPrice);

  await ctx.reply(
    `📉 *Selling ${position.tokenSymbol}*\n\n` +
    `You hold: *${formatTokenAmount(position.amount, position.decimals || 6)} ${position.tokenSymbol}*\n` +
    `Entry Price: *${entryPriceSol} SOL* (${entryPriceUsd})\n\n` +
    `Select how much to sell:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('25%', 'sell_pct:25'),
          Markup.button.callback('50%', 'sell_pct:50'),
          Markup.button.callback('75%', 'sell_pct:75'),
        ],
        [Markup.button.callback('100% (All)', 'sell_pct:100')],
        [Markup.button.callback('⬅️ Back', 'sell')]
      ])
    }
  );
});

bot.action(/^sell_pct:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const percentage = parseInt(ctx.match[1]);
  const session = userSessions.get(userId);
  const state = userStates.get(userId);
  
  // Prevent concurrent sell operations
  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ Please wait for the current operation to complete.');
  }
  
  if (!session) {
    userStates.delete(userId);
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }
  
  if (!state || !state.position) {
    return ctx.reply('❌ Session expired. Please try again.');
  }

  try {
    // Mark operation as pending
    pendingOperations.set(userId, true);
    
    // Calculate sell amount as percentage of position (position.amount is already in lamports)
    const sellAmountLamports = (BigInt(state.position.amount) * BigInt(percentage)) / BigInt(100);
    
    // Fetch current token price for exit price
    const tokenResult = await apiRequest(`/api/tokens/${state.tokenAddress}`, 'GET', null, session.token);
    if (!tokenResult.success) {
      return ctx.reply('❌ Error fetching token price: ' + tokenResult.error);
    }
    
    // token.price is already in lamports, don't convert again!
    const currentPriceLamports = BigInt(Math.floor(tokenResult.data.token.price));

    const result = await apiRequest('/api/trades/sell', 'POST', {
      positionId: state.position.id,
      amountLamports: sellAmountLamports.toString(),  // Already in lamports from position.amount
      exitPriceLamports: currentPriceLamports.toString()
    }, session.token);

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    userStates.delete(userId);
    const decimals = state.position.decimals || 6;
    await ctx.reply(
      `✅ Successfully sold ${percentage}% of ${state.position.tokenSymbol}!\n\n` +
      `Amount: *${formatTokenAmount(sellAmountLamports, decimals)} ${state.position.tokenSymbol}*\n` +
      `Received: *${formatSol(result.data.trade?.solReceived || result.data.solReceived)} SOL*\n` +
      `Profit/Loss: *${formatSol(result.data.trade?.profitLoss || result.data.profitLoss)} SOL*`,
      { parse_mode: 'Markdown' }
    );
    
    await showMainMenu(ctx);
  } finally {
    // Always clear pending operation
    pendingOperations.delete(userId);
  }
});

// Helper function to display positions list with refresh button
const showPositionsList = async (ctx, isRefresh = false) => {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);
  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const positions = result.data.positions || [];
  if (positions.length === 0) {
    const message = '📊 You have no open positions.';
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'main_menu')]
    ]);

    if (isRefresh) {
      await ctx.editMessageText(message, { ...keyboard });
    } else {
      await ctx.reply(message, keyboard);
    }
    return;
  }

  const buttons = positions.map(pos => [
    Markup.button.callback(
      `${pos.tokenSymbol} (${formatTokenAmount(pos.amount, pos.decimals || 6)})`,
      `view_position:${pos.id}`
    )
  ]);
  buttons.push([Markup.button.callback('🔄 Refresh', 'refresh_positions_list')]);
  buttons.push([Markup.button.callback('⬅️ Back', 'main_menu')]);

  const message = 
    `📊 *Your Positions${isRefresh ? ' (Refreshed)' : ''}:*\n\n` +
    `Select a position to view details:`;

  const keyboard = Markup.inlineKeyboard(buttons);

  if (isRefresh) {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } else {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  }
};

bot.action('positions', async (ctx) => {
  await ctx.answerCbQuery();
  await showPositionsList(ctx, false);
});

bot.action('refresh_positions_list', async (ctx) => {
  await ctx.answerCbQuery('🔄 Refreshing...');
  await showPositionsList(ctx, true);
});

// Helper function to display position details with refresh button
const showPositionDetails = async (ctx, positionId, isRefresh = false) => {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  try {
    // PARALLEL API CALLS - Fetch all data at the same time for MASSIVE speed boost
    const [positionsResult, profileResult] = await Promise.all([
      apiRequest('/api/trades/positions', 'GET', null, session.token),
      apiRequest('/api/auth/profile', 'GET', null, session.token)
    ]);

    // Check position fetch
    if (!positionsResult.success) {
      return ctx.reply('❌ Error fetching positions: ' + positionsResult.error);
    }

    // Check profile fetch
    if (!profileResult.success) {
      return ctx.reply('❌ Error fetching profile: ' + profileResult.error);
    }

    const position = positionsResult.data.positions?.find(p => p.id === positionId);
    if (!position) {
      return ctx.reply('❌ Position not found.');
    }

    const user = profileResult.data;

    // NOW fetch token price (need position.tokenAddress from above)
    const tokenResult = await apiRequest(`/api/tokens/${position.tokenAddress}`, 'GET', null, session.token);
    if (!tokenResult.success) {
      return ctx.reply('❌ Error fetching token price: ' + tokenResult.error);
    }

    // Get SOL price for USD conversion (cached for speed)
    const solPrice = await getSolPrice(session.token);

    const currentPrice = BigInt(tokenResult.data.token.price);
    const positionAmount = BigInt(position.amount);
    const entryPrice = BigInt(position.entryPrice);
    const solSpent = BigInt(position.solSpent);
    const decimals = position.decimals || 6;

    // Calculate current value: (amount * currentPrice) / 10^decimals
    const decimalDivisor = BigInt(10 ** decimals);
    const currentValue = (positionAmount * currentPrice) / decimalDivisor;
    
    // Calculate P&L: currentValue - solSpent
    const profitLoss = currentValue - solSpent;
    const profitLossPercent = solSpent > 0n 
      ? (Number(profitLoss) / Number(solSpent)) * 100 
      : 0;

    // Format all values in BOTH SOL and USD
    const entryPriceSol = formatSol(position.entryPrice);
    const entryPriceUsd = formatSolToUsd(position.entryPrice, solPrice);
    const currentPriceSol = formatSol(currentPrice.toString());
    const currentPriceUsd = formatSolToUsd(currentPrice.toString(), solPrice);
    const spentSol = formatSol(position.solSpent);
    const spentUsd = formatSolToUsd(position.solSpent, solPrice);
    const valueSol = formatSol(currentValue.toString());
    const valueUsd = formatSolToUsd(currentValue.toString(), solPrice);
    const plSol = formatSol(profitLoss.toString());
    const plUsd = formatSolToUsd(profitLoss.toString(), solPrice);

    const message = 
      `📊 *Position Details${isRefresh ? ' (Refreshed)' : ''}*\n\n` +
      `🪙 *${position.tokenSymbol}* (${position.tokenName})\n\n` +
      `💼 Amount: *${formatTokenAmount(position.amount, decimals)}*\n` +
      `💰 Balance: *${formatSol(user.balance)} SOL* ${formatSolToUsd(user.balance, solPrice)}\n\n` +
      `📈 Entry Price: *${entryPriceSol} SOL* (${entryPriceUsd})\n` +
      `📊 Current Price: *${currentPriceSol} SOL* (${currentPriceUsd})\n\n` +
      `💸 Spent: *${spentSol} SOL* (${spentUsd})\n` +
      `💎 Current Value: *${valueSol} SOL* (${valueUsd})\n\n` +
      `${profitLoss >= 0n ? '📈' : '📉'} P&L: *${plSol} SOL* (${plUsd}) • ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh', `refresh_position:${positionId}`)],
      [Markup.button.callback('⬅️ Back to Positions', 'positions')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    if (isRefresh) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (error) {
    console.error('❌ Error in showPositionDetails:', error.message);
    return ctx.reply('❌ An error occurred while fetching position details. Please try again.');
  }
};

bot.action(/^view_position:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionId = ctx.match[1]; // Keep as string (UUID)
  await showPositionDetails(ctx, positionId, false);
});

bot.action(/^refresh_position:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('🔄 Refreshing...');
  const positionId = ctx.match[1]; // Keep as string (UUID)
  await showPositionDetails(ctx, positionId, true);
});

bot.action('leaderboard', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  const result = await apiRequest('/api/leaderboard/current', 'GET', null, session.token);
  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const rankings = result.data.rankings || [];
  if (rankings.length === 0) {
    return ctx.reply(
      '🏆 No leaderboard data yet.',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  let message = '🏆 *Leaderboard (Top 5):*\n\n';
  rankings.slice(0, 5).forEach((entry, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    // Validate username exists (Bug #22)
    const username = entry.username || 'Unknown';
    message += `${medal} *${username}*\n`;
    message += `   Profit: ${formatSol(entry.totalProfit)} SOL\n\n`;
  });

  await ctx.reply(
    message,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    }
  );
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  userStates.delete(ctx.from.id);
  await showMainMenu(ctx);
});

// Logout action handler (command handler exists above)
bot.action('logout', async (ctx) => {
  await ctx.answerCbQuery();
  
  const telegramUserId = ctx.from.id.toString();
  
  // Delete session from database
  await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
  
  // Delete from memory
  userSessions.delete(ctx.from.id);
  userStates.delete(ctx.from.id);
  
  await ctx.reply('✅ Logged out successfully. Use /start to login again.');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);
  const text = ctx.message.text;
  const session = userSessions.get(userId);

  // Auth flow states - updated to use 'login_identifier' instead of 'login_email'
  const isAuthState = state && (
    state.state === 'register_email' || state.state === 'register_username' || 
    state.state === 'register_password' || state.state === 'register_wallet' ||
    state.state === 'login_identifier' || state.state === 'login_password'
  );
  
  // Auto-detect Solana token addresses (but not during auth flow)
  if (!isAuthState && isSolanaAddress(text)) {
    if (!session) {
      return ctx.reply('Please /start to login first.');
    }
    
    // User sent a token address - automatically show buy menu
    await ctx.reply('🔍 Fetching token information...');
    await showBuyMenu(ctx, text.trim(), session);
    return;
  }

  if (!state) {
    return ctx.reply('Please use /start to begin.');
  }

  // REGISTRATION FLOW
  if (state.state === 'register_email') {
    // Don't lowercase email - preserve original case (Bug #8)
    const email = text.trim();
    if (!email.includes('@') || !email.includes('.')) {
      return ctx.reply(
        '❌ Invalid email format. Please enter a valid email address:\n' +
        '(e.g., user@example.com)'
      );
    }
    // Validate state exists before spreading (Bug #27)
    const currentState = state || {};
    userStates.set(userId, { ...currentState, state: 'register_username', email, lastActivity: Date.now() });
    return ctx.reply(
      '✅ Email saved!\n\n' +
      'Choose a *username* (3-20 characters, letters/numbers/_/-):\n' +
      '(e.g., john_doe, player-123)',
      { parse_mode: 'Markdown' }
    );
  }

  if (state.state === 'register_username') {
    const username = text.trim();
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      return ctx.reply(
        '❌ Invalid username! Must be 3-20 characters with letters, numbers, dash, or underscore.\n' +
        'Please try again:'
      );
    }
    // Validate state exists before spreading (Bug #27)
    const currentState = state || {};
    userStates.set(userId, { ...currentState, username, state: 'register_password', lastActivity: Date.now() });
    return ctx.reply(
      '✅ Username saved!\n\n' +
      'Create a *password* (minimum 6 characters):',
      { parse_mode: 'Markdown' }
    );
  }

  if (state.state === 'register_password') {
    const password = text.trim();
    if (password.length < 6) {
      return ctx.reply(
        '❌ Password too short! Must be at least 6 characters.\n' +
        'Please try again:'
      );
    }
    // Validate state exists before spreading (Bug #27)
    const currentState = state || {};
    userStates.set(userId, { ...currentState, password, state: 'register_wallet', lastActivity: Date.now() });
    return ctx.reply(
      '✅ Password saved!\n\n' +
      'Enter your *Solana wallet address*:\n' +
      '(or type `/skip` to use default wallet)',
      { parse_mode: 'Markdown' }
    );
  }

  if (state.state === 'register_wallet') {
    let walletAddress = 'So11111111111111111111111111111111111111112'; // Default WSOL
    
    if (text !== '/skip' && text.toLowerCase() !== 'skip') {
      const trimmedWallet = text.trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedWallet)) {
        return ctx.reply(
          '❌ Invalid Solana wallet address!\n' +
          'Wallet must be 32-44 characters.\n\n' +
          'Try again or type `/skip` to use default:'
        );
      }
      walletAddress = trimmedWallet;
    }

    try {
      const loadingMsg = await ctx.reply('⏳ Creating your account...');
      
      console.log(`📝 Bot registration attempt:`, { email: state.email, username: state.username });
      
      const result = await apiRequest('/api/telegram/auth/register', 'POST', {
        email: state.email,
        username: state.username,
        password: state.password,
        walletAddress: walletAddress
      }, null, true);

      console.log(`📝 Bot registration result:`, { success: result.success, error: result.error });

      if (!result.success) {
        userStates.delete(userId);
        const errorMsg = result.error || 'Unknown error';
        
        // Provide specific error messages
        if (errorMsg.includes('already registered') || errorMsg.includes('Email already')) {
          return ctx.reply(
            `❌ Registration failed: This email is already registered!\n\n` +
            `💡 Use /login if you already have an account.`
          );
        }
        if (errorMsg.includes('already taken') || errorMsg.includes('Username already')) {
          return ctx.reply(
            `❌ Registration failed: This username is already taken!\n\n` +
            `💡 Try a different username or use /login if this is your account.`
          );
        }
        
        return ctx.reply(
          `❌ Registration failed: ${errorMsg}\n\n` +
          `💡 Please check your information and try again, or use /start to restart.`
        );
      }

      // Validate API response structure (Bug #28)
      if (!result.data || !result.data.user || !result.data.token) {
        console.error('❌ Invalid registration response structure:', result.data);
        userStates.delete(userId);
        return ctx.reply(
          '❌ Unexpected server response. Please try again or contact support.'
        );
      }

      const user = result.data.user;
      const token = result.data.token;

      console.log(`✅ Bot user registered:`, user.username);

      // Safe BigInt conversion - check type first (Bug #7)
      let balanceValue;
      if (typeof user.balance === 'bigint') {
        balanceValue = user.balance;
      } else if (typeof user.balance === 'string' || typeof user.balance === 'number') {
        balanceValue = BigInt(user.balance);
      } else {
        balanceValue = BigInt(0);
      }

      userSessions.set(userId, {
        username: user.username,
        token,
        balance: balanceValue
      });

      // Save session to database
      const telegramUserId = userId.toString();
      const sessionResult = await apiRequest('/api/telegram/session', 'POST', {
        telegramUserId,
        userId: user.id,
        token,
        balance: user.balance.toString()
      }, null, true);

      if (!sessionResult.success) {
        console.warn('⚠️ Warning: Could not save telegram session:', sessionResult.error);
        // Continue anyway - user is logged in locally even if database save failed
      }

      userStates.delete(userId);
      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e) {
        // Log deletion errors for debugging (Bug #24)
        console.log('ℹ️ Could not delete loading message (registration):', e.message);
      }
      
      await ctx.reply(
        `✅ *Account created successfully!*\n\n` +
        `👤 Username: ${user.username}\n` +
        `📧 Email: ${user.email || 'N/A'}\n` +
        `💰 Starting Balance: 10 SOL\n\n` +
        `Welcome to SimFi! 🎉`,
        { parse_mode: 'Markdown' }
      );
      await showMainMenu(ctx);
    } catch (error) {
      userStates.delete(userId);
      console.error('❌ Bot registration exception:', error);
      await ctx.reply(
        '❌ An unexpected error occurred during registration.\n\n' +
        '💡 Please use /start to try again, or contact support if the problem persists.'
      );
    }
  }

  // LOGIN FLOW - supports both email AND username
  if (state.state === 'login_identifier') {
    // Don't lowercase - preserve case for backend matching (Bug #8)
    const identifier = text.trim();
    
    // Validate identifier (email or username)
    if (!identifier || identifier.length < 3) {
      return ctx.reply(
        '❌ Invalid input! Email or username must be at least 3 characters.\n\n' +
        'Please try again:'
      );
    }
    
    // Validate state exists before spreading (Bug #27)
    const currentState = state || {};
    userStates.set(userId, { ...currentState, state: 'login_password', identifier, lastActivity: Date.now() });
    return ctx.reply(
      '✅ Got it!\n\n' +
      'Now enter your *password*:',
      { parse_mode: 'Markdown' }
    );
  }

  if (state.state === 'login_password') {
    try {
      const loadingMsg = await ctx.reply('⏳ Logging in...');
      
      console.log(`🔐 Bot login attempt for: ${state.identifier}`);
      
      // Validate password length (Bug #26)
      const password = text.trim();
      if (password.length < 1) {
        return ctx.reply('❌ Password cannot be empty. Please try again:');
      }
      
      // Clean login data construction (Bug #9)
      // Send identifier as 'email' - backend will handle both email and username
      const loginData = {
        email: state.identifier,
        password: password
      };
      
      const result = await apiRequest('/api/telegram/auth/login', 'POST', loginData, null, true);

      console.log(`📊 Bot login result:`, { success: result.success, error: result.error });

      if (!result.success) {
        userStates.delete(userId);
        const errorMsg = result.error || 'Unknown error';
        
        // Provide specific error messages
        if (errorMsg.includes('Invalid credentials') || errorMsg.includes('not found')) {
          return ctx.reply(
            `❌ Login failed: Email/username or password is incorrect.\n\n` +
            `💡 Please check:\n` +
            `• Email or username is correct\n` +
            `• Password is correct (case-sensitive)\n` +
            `• You registered on this bot (use /register if you haven't)\n\n` +
            `Try again or use /start to restart.`
          );
        }
        if (errorMsg.includes('Invalid bot secret') || errorMsg.includes('Forbidden')) {
          return ctx.reply('❌ Bot authentication failed. Please contact support.');
        }
        if (errorMsg.includes('Server error') || errorMsg.includes('500')) {
          return ctx.reply('❌ Server error. Please try again in a moment.');
        }
        
        return ctx.reply(
          `❌ Login failed: ${errorMsg}\n\n` +
          `Use /start to try again.`
        );
      }

      // Validate API response structure (Bug #28)
      if (!result.data || !result.data.user || !result.data.token) {
        console.error('❌ Invalid login response structure:', result.data);
        userStates.delete(userId);
        return ctx.reply(
          '❌ Unexpected server response. Please try again or contact support.'
        );
      }

      const user = result.data.user;
      const token = result.data.token;

      console.log(`✅ Bot user ${user.username} logged in successfully`);

      // Safe BigInt conversion - check type first (Bug #7)
      let balanceValue;
      if (typeof user.balance === 'bigint') {
        balanceValue = user.balance;
      } else if (typeof user.balance === 'string' || typeof user.balance === 'number') {
        balanceValue = BigInt(user.balance);
      } else {
        balanceValue = BigInt(0);
      }

      userSessions.set(userId, {
        username: user.username,
        token,
        balance: balanceValue
      });

      // Save session to database
      const telegramUserId = userId.toString();
      const sessionResult = await apiRequest('/api/telegram/session', 'POST', {
        telegramUserId,
        userId: user.id,
        token,
        balance: user.balance.toString()
      }, null, true);

      if (!sessionResult.success) {
        console.warn('⚠️ Warning: Could not save telegram session:', sessionResult.error);
      }

      userStates.delete(userId);
      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e) {
        // Log deletion errors for debugging (Bug #24)
        console.log('ℹ️ Could not delete loading message (login):', e.message);
      }
      
      await ctx.reply(
        `✅ *Welcome back, ${user.username}!*\n\n` +
        `💰 Balance: ${formatSol(user.balance)} SOL`,
        { parse_mode: 'Markdown' }
      );
      await showMainMenu(ctx);
    } catch (error) {
      userStates.delete(userId);
      console.error('❌ Bot login exception:', error);
      await ctx.reply(
        '❌ An unexpected error occurred during login.\n\n' +
        '💡 Please use /start to try again, or contact support if the problem persists.'
      );
    }
  }

  if (state.state === 'awaiting_buy_token') {
    if (!session) {
      userStates.delete(userId);
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }
    
    const tokenAddress = text.trim();
    await showBuyMenu(ctx, tokenAddress, session);
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
    
    // Send SOL amount as-is - API will convert to lamports internally
    // token.price is already in lamports, don't convert again!
    const priceLamports = BigInt(Math.floor(state.token.price));

    const result = await apiRequest('/api/trades/buy', 'POST', {
      tokenAddress: state.tokenAddress,
      tokenName: state.token.name,
      tokenSymbol: state.token.symbol,
      solAmount: amount,  // Send as SOL number, not lamports
      price: priceLamports.toString(),
      decimals: 6  // Most pump.fun tokens use 6 decimals
    }, session.token);

    if (!result.success) {
      userStates.delete(userId);
      return ctx.reply('❌ Error: ' + result.error);
    }

    userStates.delete(userId);
    const tokenAmount = result.data.tokensReceived || 0;
    const decimals = 6; // pump.fun tokens use 6 decimals
    
    await ctx.reply(
      `✅ Successfully bought *${state.token.symbol}*!\n\n` +
      `Amount: *${formatTokenAmount(tokenAmount, decimals)} ${state.token.symbol}*\n` +
      `Spent: *${amount} SOL*`,
      { parse_mode: 'Markdown' }
    );
    
    await showMainMenu(ctx);
  }
});

bot.action(/^buy_amt:(.+)$/, async (ctx) => {
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

  // Send SOL amount as-is - API will convert to lamports internally  
  // token.price is already in lamports, don't convert again!
  const priceLamports = BigInt(Math.floor(state.token.price));

  const result = await apiRequest('/api/trades/buy', 'POST', {
    tokenAddress: state.tokenAddress,
    tokenName: state.token.name,
    tokenSymbol: state.token.symbol,
    solAmount: amount,  // Send as SOL number, not lamports
    price: priceLamports.toString(),
    decimals: 6  // Most pump.fun tokens use 6 decimals
  }, session.token);

  if (!result.success) {
    userStates.delete(userId);
    return ctx.reply('❌ Error: ' + result.error);
  }

  userStates.delete(userId);
  const tokenAmount = result.data.tokensReceived || 0;
  const decimals = 6; // pump.fun tokens use 6 decimals
  
  await ctx.reply(
    `✅ Successfully bought *${state.token.symbol}*!\n\n` +
    `Amount: *${formatTokenAmount(tokenAmount, decimals)} ${state.token.symbol}*\n` +
    `Spent: *${amount} SOL*`,
    { parse_mode: 'Markdown' }
  );
  
  await showMainMenu(ctx);
});

// Use Telegraf built-in polling - the most reliable method
console.log('🚀 Starting Telegram bot with polling...');

(async () => {
  try {
    // Test token
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ Bot token valid: @${botInfo.username} (${botInfo.first_name})`);
    
    // CRITICAL: Fully disable webhooks before polling
    try {
      await bot.telegram.deleteWebhook();
      console.log('📡 Webhook deleted successfully');
    } catch (err) {
      console.log('📡 No active webhook');
    }
    
    // Start polling - non-blocking with proper error handling
    console.log('📡 Starting polling...');
    bot.startPolling();
    
    console.log('✅ Telegram bot polling started!');
    console.log('🎯 Bot is now listening for messages');
    console.log(`📱 Try sending /start to @${botInfo.username}`);
    
    // Log when first update is received
    bot.on('message', async (ctx) => {
      if (!ctx.message) return;
      console.log(`📩 Message received from user ${ctx.from.id}: "${ctx.message.text}"`);
    });
    
    bot.on('callback_query', async (ctx) => {
      console.log(`📩 Callback received from user ${ctx.from.id}: "${ctx.callbackQuery.data}"`);
    });
    
  } catch (err) {
    console.error('❌ Failed to start bot:');
    console.error('Error:', err.message);
    if (err.code) console.error('Code:', err.code);
    process.exit(1);
  }
})();

// Enable graceful shutdown
process.once('SIGINT', () => {
  console.log('📴 Stopping bot...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('📴 Stopping bot...');
  bot.stop('SIGTERM');
});
