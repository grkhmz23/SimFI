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

const formatTokenAmount = (lamports) => {
  const tokens = Number(lamports) / 1_000_000_000;
  return tokens.toFixed(2);
};

const apiRequest = async (endpoint, method = 'GET', data = null, token = null) => {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: token ? { Cookie: `token=${token}` } : {},
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
  userStates.set(ctx.from.id, { state: 'awaiting_username' });
  await ctx.reply(
    '👋 Welcome to Solana Paper Trading Bot!\n\n' +
    'Please enter your *username*:',
    { parse_mode: 'Markdown' }
  );
});

bot.command('logout', async (ctx) => {
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
      `${pos.tokenSymbol} (${formatTokenAmount(pos.amount)})`,
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
    `You hold: *${formatTokenAmount(position.amount)} ${position.tokenSymbol}*\n` +
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

  const sellAmount = (BigInt(state.position.amount) * BigInt(percentage)) / BigInt(100);

  const result = await apiRequest('/trades/sell', 'POST', {
    tokenAddress: state.tokenAddress,
    amount: sellAmount.toString()
  }, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  userStates.delete(ctx.from.id);
  await ctx.reply(
    `✅ Successfully sold ${percentage}% of ${state.position.tokenSymbol}!\n\n` +
    `Amount: *${formatTokenAmount(sellAmount)} ${state.position.tokenSymbol}*\n` +
    `Received: *${formatSol(result.data.trade.solReceived)} SOL*\n` +
    `Profit/Loss: *${formatSol(result.data.trade.profitLoss)} SOL*`,
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

  let message = '📊 *Your Positions:*\n\n';
  positions.forEach((pos, i) => {
    message += `${i + 1}. *${pos.tokenSymbol}*\n`;
    message += `   Amount: ${formatTokenAmount(pos.amount)}\n`;
    message += `   Entry: ${formatSol(pos.entryPrice)} SOL\n`;
    message += `   Spent: ${formatSol(pos.solSpent)} SOL\n\n`;
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

    userSessions.set(userId, {
      username: state.username,
      token,
      balance: result.data.user?.balance || 0
    });

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
    
    const amountLamports = BigInt(Math.floor(amount * 1_000_000_000));

    const result = await apiRequest('/trades/buy', 'POST', {
      tokenAddress: state.tokenAddress,
      solAmount: amountLamports.toString()
    }, session.token);

    if (!result.success) {
      userStates.delete(userId);
      return ctx.reply('❌ Error: ' + result.error);
    }

    userStates.delete(userId);
    const tokenAmount = result.data.trade?.amount || 0;
    
    await ctx.reply(
      `✅ Successfully bought *${state.token.symbol}*!\n\n` +
      `Amount: *${formatTokenAmount(tokenAmount)} ${state.token.symbol}*\n` +
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

  const amountLamports = BigInt(Math.floor(amount * 1_000_000_000));

  const result = await apiRequest('/trades/buy', 'POST', {
    tokenAddress: state.tokenAddress,
    solAmount: amountLamports.toString()
  }, session.token);

  if (!result.success) {
    userStates.delete(userId);
    return ctx.reply('❌ Error: ' + result.error);
  }

  userStates.delete(userId);
  const tokenAmount = result.data.trade?.amount || 0;
  
  await ctx.reply(
    `✅ Successfully bought *${state.token.symbol}*!\n\n` +
    `Amount: *${formatTokenAmount(tokenAmount)} ${state.token.symbol}*\n` +
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
