import { Telegraf } from 'telegraf';

const BOT_TOKEN = process.env.NODE_ENV === 'development' 
  ? process.env.TELEGRAM_BOT_TOKEN_DEV 
  : process.env.TELEGRAM_BOT_TOKEN;

console.log('🧪 Testing minimal bot...');
console.log('Token present:', !!BOT_TOKEN);
console.log('Token length:', BOT_TOKEN?.length);

if (!BOT_TOKEN) {
  console.error('❌ No bot token found');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => ctx.reply('Bot is working!'));

console.log('🚀 Launching minimal bot...');
bot.launch().then(() => {
  console.log('✅ Minimal bot started successfully!');
}).catch((err) => {
  console.error('❌ Failed:', err.message);
  console.error('Code:', err.code);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏰ 10 second timeout - bot should have started by now');
  process.exit(1);
}, 10000);
