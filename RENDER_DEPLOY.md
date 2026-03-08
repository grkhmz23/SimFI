# 🚀 SimFi Deployment Guide for Render

This guide walks you through deploying SimFi to Render.com

## 📋 Prerequisites

1. [Render](https://render.com) account
2. [GitHub](https://github.com) account with this repo
3. Telegram Bot Token (from [@BotFather](https://t.me/BotFather)) - optional

## 🚀 Quick Deploy (One-Click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Or manually:

## 🔧 Manual Deployment Steps

### Step 1: Create PostgreSQL Database

1. Go to Render Dashboard → **New** → **PostgreSQL**
2. Name: `simfi-db`
3. Plan: **Free** (or paid for production)
4. Region: **Oregon** (or your preferred region)
5. Click **Create Database**
6. Copy the **Internal Database URL** for later

### Step 2: Deploy Web Service

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:

| Setting | Value |
|---------|-------|
| Name | `simfi-web` |
| Region | Same as database |
| Branch | `main` or your branch |
| Runtime | **Node** |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Plan | **Standard** ($7/month minimum for background workers) |

4. Add Environment Variables:

```bash
NODE_ENV=production
PORT=5000
DATABASE_URL=<from step 1>
JWT_SECRET=<generate strong secret>
BOT_API_SECRET=<generate strong secret>
```

5. Click **Create Web Service**

### Step 3: Run Database Migrations

1. Go to your web service → **Shell** tab
2. Run: `npm run db:push`
3. This creates all database tables

### Step 4: (Optional) Deploy Telegram Bot Worker

If you want the Telegram bot:

1. Go to Render Dashboard → **New** → **Background Worker**
2. Connect same repository
3. Configure:

| Setting | Value |
|---------|-------|
| Name | `simfi-bot` |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `node bot.js` |
| Plan | **Starter** |

4. Add Environment Variables:

```bash
NODE_ENV=production
API_BASE_URL=https://<your-web-service>.onrender.com
DATABASE_URL=<same as web service>
TELEGRAM_BOT_TOKEN=<from @BotFather>
BOT_API_SECRET=<same as web service>
```

## ⚙️ Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for JWT tokens (min 32 chars) |
| `BOT_API_SECRET` | ✅ | Secret for bot API auth (min 20 chars in prod) |
| `TELEGRAM_BOT_TOKEN` | ❌ | For Telegram bot functionality |
| `AUTO_START_BOT` | ❌ | Auto-start bot with web server (default: false) |
| `REDIS_URL` | ❌ | For shared rate limiting |

### Rewards Engine (Optional)

| Variable | Description |
|----------|-------------|
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `REWARDS_VAULT_PRIVATE_KEY` | Vault wallet private key (base58) |
| `REWARDS_TOKEN_MINT` | Token mint for claiming fees |
| `BAGS_API_KEY` | Bags SDK API key |
| `REWARDS_POOL_BPS` | % of fees to rewards (5000 = 50%) |

## 🔍 Post-Deployment Checklist

- [ ] App loads at `https://your-app.onrender.com`
- [ ] `/api/health` returns `{"status":"healthy"}`
- [ ] Can register new account
- [ ] Can search and view tokens
- [ ] Can execute paper trades

## 🐛 Troubleshooting

### Build Fails
```bash
# Check Node version (should be 20+)
node --version

# Clear build cache and retry in Render dashboard
```

### Database Connection Error
```bash
# Verify DATABASE_URL format
postgresql://user:password@host:port/database

# Test connection from shell
npm run db:push
```

### Telegram Bot Not Responding
- Check `TELEGRAM_BOT_TOKEN` is valid
- Verify `BOT_API_SECRET` matches between web and worker
- Check logs in Render dashboard

## 📊 Scaling

| Traffic Level | Recommended Plan |
|--------------|------------------|
| < 100 users | Free/Starter |
| 100-1000 users | Standard ($7) |
| 1000+ users | Pro ($25+) + Redis |

## 🔄 Updates

Render auto-deploys on push to your branch. To disable:
1. Go to service → **Settings**
2. Turn off **Auto-Deploy**

---

Need help? Check the main [README](./replit.md) for app documentation.
