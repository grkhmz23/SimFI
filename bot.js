import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required in environment variables');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const userSessions = new Map();
const userStates = new Map();

const formatSol = (lamports) => {
  const sol = Number(lamports) / 1_000_000_000;
  return sol.toFixed(4);
};

const formatTokenAmount = (lamports, decimals = 6) => {
  const tokens = Number(lamports) / (10 ** decimals);
  return tokens.toFixed(2);
};

const apiRequest = async (endpoint, method = 'GET', data = null, token = null, isBotRequest = false) => {
  try {
    const headers = {};
    
    if (token) {
      headers['Cookie'] = `token=${token}`;
    }
    
    // Add bot secret for telegram session endpoints
    if (isBotRequest) {
      headers['x-bot-secret'] = BOT_TOKEN;
    }
    
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers,
      withCredentials: true
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { 
      success: true, 
      data: response.data,
      headers: response.headers 
    };
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.error || error.message 
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

  const result = await apiRequest('/auth/profile', 'GET', null, session.token);
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

bot.start(async (ctx) => {
  const telegramUserId = ctx.from.id.toString();
  
  // Check if user has an existing session
  const sessionResult = await apiRequest(`/telegram/session/${telegramUserId}`, 'GET', null, null, true);
  
  if (sessionResult.success && sessionResult.data.session) {
    const session = sessionResult.data.session;
    userSessions.set(ctx.from.id, {
      username: session.username,
      token: session.token,
      balance: BigInt(session.balance)
    });
    
    await ctx.reply('👋 Welcome back! Your session has been restored.');
    await showMainMenu(ctx);
    return;
  }
  
  // No existing session, start login flow
  userStates.set(ctx.from.id, { state: 'awaiting_username' });
  await ctx.reply(
    '👋 Welcome to Solana Paper Trading Bot!\n\n' +
    'Please enter your *username*:',
    { parse_mode: 'Markdown' }
  );
});

bot.command('logout', async (ctx) => {
  const telegramUserId = ctx.from.id.toString();
  
  // Delete session from database
  await apiRequest(`/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
  
  // Delete from memory
  userSessions.delete(ctx.from.id);
  userStates.delete(ctx.from.id);
  
  await ctx.reply('✅ Logged out successfully. Use /start to login again.');
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.action('buy', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }
  
  userStates.set(ctx.from.id, { state: 'awaiting_buy_token' });
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

  const result = await apiRequest('/trades/positions', 'GET', null, session.token);
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
  
  const result = await apiRequest('/trades/positions', 'GET', null, session.token);
  
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
    position
  });

  await ctx.reply(
    `📉 *Selling ${position.tokenSymbol}*\n\n` +
    `You hold: *${formatTokenAmount(position.amount, position.decimals || 6)} ${position.tokenSymbol}*\n` +
    `Entry Price: *${formatSol(position.entryPrice)} SOL*\n\n` +
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
  const percentage = parseInt(ctx.match[1]);
  const session = userSessions.get(ctx.from.id);
  const state = userStates.get(ctx.from.id);
  
  if (!session) {
    userStates.delete(ctx.from.id);
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }
  
  if (!state || !state.position) {
    return ctx.reply('❌ Session expired. Please try again.');
  }

  // Calculate sell amount as percentage of position (position.amount is already in lamports)
  const sellAmountLamports = (BigInt(state.position.amount) * BigInt(percentage)) / BigInt(100);
  
  // Fetch current token price for exit price
  const tokenResult = await apiRequest(`/tokens/${state.tokenAddress}`, 'GET', null, session.token);
  if (!tokenResult.success) {
    return ctx.reply('❌ Error fetching token price: ' + tokenResult.error);
  }
  
  // token.price is already in lamports, don't convert again!
  const currentPriceLamports = BigInt(Math.floor(tokenResult.data.token.price));

  const result = await apiRequest('/trades/sell', 'POST', {
    positionId: state.position.id,
    amountLamports: sellAmountLamports.toString(),  // Already in lamports from position.amount
    exitPriceLamports: currentPriceLamports.toString()
  }, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  userStates.delete(ctx.from.id);
  const decimals = state.position.decimals || 6;
  await ctx.reply(
    `✅ Successfully sold ${percentage}% of ${state.position.tokenSymbol}!\n\n` +
    `Amount: *${formatTokenAmount(sellAmountLamports, decimals)} ${state.position.tokenSymbol}*\n` +
    `Received: *${formatSol(result.data.trade?.solReceived || result.data.solReceived)} SOL*\n` +
    `Profit/Loss: *${formatSol(result.data.trade?.profitLoss || result.data.profitLoss)} SOL*`,
    { parse_mode: 'Markdown' }
  );
  
  await showMainMenu(ctx);
});

bot.action('positions', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  const result = await apiRequest('/trades/positions', 'GET', null, session.token);
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

// Helper function to display position details with refresh button
const showPositionDetails = async (ctx, positionId, isRefresh = false) => {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    return ctx.reply('Please /start to login first.');
  }

  // Fetch all positions to find the one we want
  const positionsResult = await apiRequest('/trades/positions', 'GET', null, session.token);
  if (!positionsResult.success) {
    return ctx.reply('❌ Error fetching positions: ' + positionsResult.error);
  }

  const position = positionsResult.data.positions?.find(p => p.id === positionId);
  if (!position) {
    return ctx.reply('❌ Position not found.');
  }

  // Fetch current user balance
  const profileResult = await apiRequest('/auth/profile', 'GET', null, session.token);
  if (!profileResult.success) {
    return ctx.reply('❌ Error fetching profile: ' + profileResult.error);
  }

  const user = profileResult.data;

  // Fetch current token price
  const tokenResult = await apiRequest(`/tokens/${position.tokenAddress}`, 'GET', null, session.token);
  if (!tokenResult.success) {
    return ctx.reply('❌ Error fetching token price: ' + tokenResult.error);
  }

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

  const message = 
    `📊 *Position Details${isRefresh ? ' (Refreshed)' : ''}*\n\n` +
    `🪙 *${position.tokenSymbol}* (${position.tokenName})\n\n` +
    `💼 Amount: *${formatTokenAmount(position.amount, decimals)}*\n` +
    `💰 Balance: *${formatSol(user.balance)} SOL*\n\n` +
    `📈 Entry Price: *${formatSol(position.entryPrice)} SOL*\n` +
    `📊 Current Price: *${formatSol(currentPrice.toString())} SOL*\n\n` +
    `💸 Spent: *${formatSol(position.solSpent)} SOL*\n` +
    `💎 Current Value: *${formatSol(currentValue.toString())} SOL*\n\n` +
    `${profitLoss >= 0n ? '📈' : '📉'} P&L: *${formatSol(profitLoss.toString())} SOL* (${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%)`;

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

  const result = await apiRequest('/leaderboard/current', 'GET', null, session.token);
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
    message += `${medal} *${entry.username}*\n`;
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

bot.action('logout', async (ctx) => {
  await ctx.answerCbQuery();
  
  const telegramUserId = ctx.from.id.toString();
  
  // Delete session from database
  await apiRequest(`/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
  
  // Delete from memory
  userSessions.delete(ctx.from.id);
  userStates.delete(ctx.from.id);
  
  await ctx.reply('✅ Logged out successfully. Use /start to login again.');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);
  const text = ctx.message.text;

  if (!state) {
    return ctx.reply('Please use /start to begin.');
  }

  if (state.state === 'awaiting_username') {
    userStates.set(userId, { state: 'awaiting_password', username: text });
    return ctx.reply('🔐 Please enter your *password*:', { parse_mode: 'Markdown' });
  }

  if (state.state === 'awaiting_password') {
    const result = await apiRequest('/auth/login', 'POST', {
      username: state.username,
      password: text
    });

    if (!result.success) {
      userStates.delete(userId);
      return ctx.reply('❌ Login failed: ' + result.error + '\n\nPlease /start again.');
    }

    // Extract token from Set-Cookie header
    const cookies = result.headers?.['set-cookie'];
    let token = null;
    
    if (cookies && Array.isArray(cookies)) {
      const tokenCookie = cookies.find(c => c.startsWith('token='));
      if (tokenCookie) {
        token = tokenCookie.split(';')[0].split('=')[1];
      }
    } else if (typeof cookies === 'string' && cookies.startsWith('token=')) {
      token = cookies.split(';')[0].split('=')[1];
    }

    if (!token) {
      console.error('Failed to extract token from cookies');
      console.error('Set-Cookie header:', result.headers?.['set-cookie']);
      console.error('All headers:', JSON.stringify(result.headers, null, 2));
      return ctx.reply('❌ Authentication token not received. Please try again.');
    }

    const balance = result.data.user?.balance || 0;
    
    userSessions.set(userId, {
      username: state.username,
      token,
      balance
    });

    // Save session to database for persistence
    const telegramUserId = userId.toString();
    await apiRequest('/telegram/session', 'POST', {
      telegramUserId,
      userId: result.data.user?.id,
      token,
      balance: balance.toString()
    }, null, true);

    userStates.delete(userId);
    await ctx.reply(`✅ Welcome, *${state.username}*!`, { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
  }

  if (state.state === 'awaiting_buy_token') {
    const session = userSessions.get(userId);
    
    if (!session) {
      userStates.delete(userId);
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }
    
    const tokenAddress = text.trim();

    const result = await apiRequest(`/tokens/${tokenAddress}`, 'GET', null, session.token);
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
      token
    });

    await ctx.reply(
      `📈 *${token.name} (${token.symbol})*\n\n` +
      `Price: *${formatSol(token.price)} SOL*\n` +
      `Market Cap: *$${token.marketCap.toLocaleString()}*\n\n` +
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

    const result = await apiRequest('/trades/buy', 'POST', {
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

  const result = await apiRequest('/trades/buy', 'POST', {
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

bot.launch().then(() => {
  console.log('✅ Telegram bot is running!');
  console.log(`📡 API Base URL: ${API_BASE_URL}`);
}).catch((err) => {
  console.error('❌ Failed to start bot:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
