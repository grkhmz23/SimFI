# Axiom.trade Integration Setup

This guide will help you set up the axiom.trade integration for trending tokens.

## Prerequisites

- An account on [axiom.trade](https://axiom.trade)
- Access to the email associated with your account (for OTP codes)
- Python 3.11+ installed (already installed in this Repl)

## Setup Instructions

### Step 1: Run the Authentication Script

In the Shell, run:

```bash
python3 server/axiom_auth.py
```

### Step 2: Enter Your Credentials

The script will prompt you for:

1. **Email**: Your axiom.trade email address
2. **Password**: Your axiom.trade password
3. **OTP Code**: Check your email for the one-time password

### Step 3: Save Your Secrets (Optional)

After successful authentication, the script will display your base64-encoded password. 

You can save these to Replit Secrets for easier re-authentication:

1. Open the Secrets tab (lock icon in left sidebar)
2. Add these secrets:
   - `AXIOM_EMAIL`: your_email@example.com
   - `AXIOM_PASSWORD`: <the base64 password shown by the script>

### Step 4: Verify It's Working

1. Restart your application
2. Visit the Trending page
3. You should now see trending tokens from axiom.trade!

## How It Works

1. The authentication script (`axiom_auth.py`) logs you in and saves authentication tokens to `server/.axiom_tokens.json`
2. When the trending endpoint is called, it runs `get_axiom_trending.py` which uses the stored tokens
3. Tokens are valid for ~24 hours, after which you'll need to re-authenticate

## Token Expiration

If tokens expire, you'll see an "Authentication Required" message on the Trending page. 

Simply run the auth script again:

```bash
python3 server/axiom_auth.py
```

## Troubleshooting

### "Module not found: axiomtradeapi"

The Python package should already be installed. If not, run:

```bash
pip install axiomtradeapi
```

### "Authentication failed"

- Double-check your email and password
- Make sure you entered the OTP code quickly (they expire after a few minutes)
- Check that your axiom.trade account is active

### "No trending tokens found"

- Make sure you've run the authentication script
- Check that `server/.axiom_tokens.json` exists and contains valid tokens
- Try re-authenticating with the auth script

## Security Notes

- Never commit `.axiom_tokens.json` to version control (it's in `.gitignore`)
- Your password is base64-encoded for transmission, not for security
- Tokens are stored locally and automatically refreshed when possible
- Always use Replit Secrets for sensitive credentials in production

## Data Source

Trending tokens are fetched from axiom.trade's API which provides:
- Real-time trending Solana tokens
- 24h volume and price change data
- Market cap information
- Multiple timeframe options (1h, 5m, 24h, etc.)

Enjoy risk-free trading with live trending data! 🚀
