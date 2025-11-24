# SimFi Telegram Bot - Complete Command Reference

Bot Username: **@SimFiDev_Bot**

## Table of Contents
1. [Authentication Commands](#authentication-commands)
2. [Trading Commands](#trading-commands)
3. [Portfolio Management](#portfolio-management)
4. [Interactive Flows](#interactive-flows)

---

## Authentication Commands

### /start
**Description**: Initialize the bot and login flow  
**Usage**: `/start`  
**Flow**:
- If user has existing session → Restores session automatically
- If no session → Shows authentication options: "📝 Register" or "🔐 Login"
- Validates stored tokens before restoring sessions

**Example Response**:
```
👋 Welcome to Solana Paper Trading Bot!

Create a new account or login to existing one:
```

---

### /register
**Description**: Create a new account  
**Usage**: `/register` or tap "📝 Register" button  
**Interactive Flow**:
1. **Email Entry**: Enter your email address
2. **Username Entry**: Enter desired username
3. **Password Entry**: Enter password (minimum 8 characters recommended)
4. **Confirmation**: Account created successfully, automatic login

**Example Flow**:
```
📝 Registration
Enter your email address:
> user@example.com

✅ Got it!
Now enter your username:
> username123

✅ Got it!
Now enter your password:
> mypassword123

✅ Account created! You are now logged in.
```

---

### /login
**Description**: Login to existing account  
**Usage**: `/login` or tap "🔐 Login" button  
**Supports**: Email address OR username  
**Interactive Flow**:
1. **Identifier Entry**: Enter email or username
2. **Password Entry**: Enter password
3. **Validation**: Credentials verified, session restored

**Example Flow**:
```
🔐 Login
Enter your email or username:
> user@example.com

✅ Got it!
Now enter your password:
> mypassword123

✅ Welcome back, username!
💰 Balance: 1000.0000 SOL
```

**Error Handling**:
- ❌ Invalid credentials → "Email/username or password is incorrect"
- ❌ Session expired → "Session has expired, please login again"
- ❌ Network error → "Network error - cannot reach server"

---

### /logout
**Description**: Logout from current session  
**Usage**: `/logout` or tap "🚪 Logout" button  
**Effect**:
- Clears local session from memory
- Deletes session from database
- Bot resets to initial /start state
- Next action requires re-authentication

**Response**:
```
✅ Logged out successfully. Use /start to login again.
```

---

## Trading Commands

### Buy Token (📈 Buy)
**Description**: Purchase a token with SOL  
**Access**: Main menu (after login)  
**Entry Points**: 
- Tap "📈 Buy" button on main menu
- Bot prompts for token contract address

**Step-by-Step Flow**:

#### Step 1: Token Address Entry
```
🔍 Enter the token contract address you want to buy:
> DubwWfeqwuBxs1XtArzt04ihoxQDug4g9x5L12C5qAF
```

#### Step 2: Token Verification & Price Display
```
📈 Token Name (SYMBOL)

Price: 0.0001 SOL
Market Cap: $1,234,567

How much SOL do you want to spend?

[0.1 SOL] [0.5 SOL]
[1 SOL]   [5 SOL]
[⬅️ Back]
```

#### Step 3: Amount Selection or Custom Entry
- **Preset Amounts**: 0.1 SOL, 0.5 SOL, 1 SOL, 5 SOL
- **Custom Amount**: Reply with custom SOL amount
  ```
  💰 Enter custom SOL amount:
  > 2.5
  ```

#### Step 4: Buy Confirmation
```
✅ Successfully bought TOKEN!

Amount: 50000.00 TOKEN
Spent: 2.5 SOL
```

**Auto-Detection Feature**: 
- If you send a token contract address directly as a message, the bot automatically starts the buy flow
- Example: Send `DubwWfeqwuBxs1XtArzt04ihoxQDug4g9x5L12C5qAF` → Bot shows token info and buy options

---

### Sell Token (📉 Sell)
**Description**: Sell all or part of a token position  
**Access**: Main menu (after login)  
**Entry Points**: Tap "📉 Sell" button on main menu

**Step-by-Step Flow**:

#### Step 1: Position Selection
```
📉 Select a position to sell:
[TROLL (125000.50)]
[Baby (500000.25)]
[SCF (1000000.00)]
[⬅️ Back]
```

#### Step 2: Sell Percentage Selection
```
📉 Selling TROLL

You hold: 125000.50 TROLL
Entry Price: 0.0003 SOL

Select how much to sell:
[25%] [50%] [75%]
[100% (All)]
[⬅️ Back]
```

#### Step 3: Sell Execution
```
✅ Successfully sold 50% of TROLL!

Amount: 62500.25 TROLL
Received: 18.75 SOL
Profit/Loss: +2.50 SOL
```

**Features**:
- Calculates P&L automatically
- Shows profit/loss in SOL and percentage
- 25%, 50%, 75%, 100% quick options
- Back button to cancel operation

---

## Portfolio Management

### View Positions (📊 Positions)
**Description**: View all open token positions with details  
**Access**: Main menu (after login)  
**Entry Points**: Tap "📊 Positions" button on main menu

**Empty Portfolio Response**:
```
📊 You have no open positions.
[⬅️ Back]
```

**Portfolio with Positions**:
```
📊 Your Positions:

Select a position to view details:
[TROLL (125000.50)]
[Baby (500000.25)]
[SCF (1000000.00)]
[⬅️ Back]
```

---

### View Position Details
**Description**: See detailed analytics for a single position  
**Triggered By**: Tapping on a position from the positions list  
**Actions Available**: 
- 🔄 Refresh → Updates current price and P&L
- ⬅️ Back to Positions → Returns to positions list
- 🏠 Main Menu → Goes to main menu

**Detailed View**:
```
📊 Position Details

🪙 TOKEN (Token Name)

💼 Amount: 125000.50
💰 Balance: 500.0000 SOL

📈 Entry Price: 0.0003 SOL
📊 Current Price: 0.0004 SOL

💸 Spent: 37.50 SOL
💎 Current Value: 50.00 SOL

📈 P&L: +12.50 SOL (+33.33%)
```

**Refresh Button** (🔄 Refresh):
- Updates current token price from DexScreener
- Recalculates P&L in real-time
- Auto-refresh shows "(Refreshed)" tag

---

### Leaderboard (🏆 Leaderboard)
**Description**: View top 10 trading performers in current 6-hour period  
**Access**: Main menu (after login)  
**Entry Points**: Tap "🏆 Leaderboard" button on main menu

**Leaderboard Format**:
```
🏆 Leaderboard (6-Hour Period)
Period: 2:00 PM - 8:00 PM

1. 🥇 user123 - +250.50 SOL
2. 🥈 trader99 - +189.25 SOL
3. 🥉 degen_ape - +145.75 SOL
4. user456 - +120.00 SOL
5. profitable_bob - +98.50 SOL
...

[🔄 Refresh] [⬅️ Back to Main Menu]
```

**Features**:
- Shows top 10 traders by profit
- Updates every 6 hours automatically
- Refresh button for live updates
- Shows current period time range

---

## Interactive Flows

### Main Menu
**Display**: Available after successful authentication  
**Shows**:
- User's current SOL balance
- Username
- Total profit
- Trading buttons

**Main Menu Layout**:
```
🎮 Solana Paper Trading Bot

Welcome back, username!
Balance: 500.0000 SOL
Total Profit: +150.25 SOL

[💰 Balance: 500.0000 SOL]
[📈 Buy] [📉 Sell]
[📊 Positions] [🏆 Leaderboard]
[🚪 Logout]
```

**Button Actions**:
- 💰 Balance (Info only - shows current balance)
- 📈 Buy → Start buying flow
- 📉 Sell → Start selling flow
- 📊 Positions → View all positions
- 🏆 Leaderboard → View rankings
- 🚪 Logout → Exit and clear session

---

### Session Persistence

**Auto-Session Restoration**:
- Each user's session is stored in PostgreSQL database
- Sessions expire after 30 days of inactivity
- Sending `/start` automatically restores previous session if valid

**Session Data Stored**:
- Telegram User ID
- JWT authentication token
- Username
- Current balance (SOL in lamports)
- Telegram session creation timestamp

---

## Error Handling & Messages

### Authentication Errors
```
❌ Session expired. Please /start to login again.
❌ Invalid credentials. Email/username or password is incorrect.
❌ Bot authentication failed. Please contact support.
```

### Trading Errors
```
❌ Token not found. Please check the address and try again.
❌ Error fetching positions: {error_message}
❌ Insufficient balance to execute trade
❌ Position not found.
```

### Network Errors
```
❌ Network error - cannot reach server. Please try again.
❌ Request timeout - server took too long to respond.
```

### Operation Status
```
⏳ Please wait for the current operation to complete.
⏳ Processing your request...
```

---

## Advanced Features

### Token Address Auto-Detection
- Bot automatically detects valid Solana contract addresses
- Valid addresses: Base58 encoded, 32-44 characters
- Example: `DubwWfeqwuBxs1XtArzt04ihoxQDug4g9x5L12C5qAF`
- Sending address directly → Bot starts buy flow automatically

### Real-Time Price Updates
- All prices fetched from DexScreener API in real-time
- Buy prices verified at transaction time
- Sell prices calculated at execution time
- Position P&L updates on demand via refresh button

### Concurrent Operation Prevention
- Bot prevents multiple simultaneous trades by same user
- Message: "⏳ Please wait for the current operation to complete."
- Ensures data integrity and prevents race conditions

### Session Cleanup
- Inactive user states cleaned every 30 minutes
- Sessions expire after 30 days of inactivity
- Graceful logout on session expiration

---

## Connection Status Indicators

### Bot Status Indicators
```
✅ Operation successful
❌ Error or failure
⏳ Processing/Loading
📩 Message received
📊 Data fetched
🔄 Refreshing
📡 Network operation
🔐 Authentication
💰 Balance/Payment
```

---

## Usage Tips

1. **Login Once, Stay Logged In**: After login, your session persists even after closing Telegram
2. **Token Address Shortcuts**: Send token address directly to start buying without menu navigation
3. **Refresh Positions**: Always tap 🔄 Refresh before making sell decisions to get latest prices
4. **Percentage Sells**: Use preset 25%/50%/75%/100% buttons for quick partial sells
5. **Custom Amounts**: Most flows accept custom input (amount, token address, etc.)
6. **Back Buttons**: Every flow has a back button (⬅️) to cancel or navigate

---

## Bot Limitations

- Maximum buy/sell amount: Limited by account balance
- Price updates: ~2.5 second refresh interval
- Position tracking: Supports multiple concurrent positions
- Leaderboard: Shows top 10 traders per 6-hour period
- Session duration: 30 days of inactivity before auto-logout

---

## Support & Troubleshooting

**Common Issues**:
1. "Session expired" → Use `/start` to re-authenticate
2. "Token not found" → Verify token address is valid
3. "Network error" → Check internet connection, try again
4. "Insufficient balance" → You need more SOL to execute trade

**Contact**: For issues, restart with `/start` or contact support through the web app

