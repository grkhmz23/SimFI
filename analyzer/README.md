# Solana Token History Analyzer

A powerful CLI tool to analyze the complete on-chain history of Solana SPL tokens, with support for Pump.fun tokens and other memecoins.

## Features

- 📊 Comprehensive token analysis (supply, price, market cap)
- 🔍 Transaction history parsing (transfers, swaps, pool creation)
- 📈 Price time-series extraction from swap events
- 👥 Early buyer identification and tracking
- 📁 Multiple export formats (JSON, CSV)
- ⚡ Helius API integration with RPC fallback
- 🕐 Time-filtered analysis (analyze from specific date/time)

## Setup

### 1. Environment Variables

Set these in your Replit Secrets or `.env` file:

```bash
# Recommended: Get a free API key from https://helius.xyz
HELIUS_API_KEY=your_helius_api_key_here

# Optional: Use custom RPC endpoint
RPC_URL=https://api.mainnet-beta.solana.com
```

### 2. Installation

Dependencies are already installed if you're in the main project. Otherwise:

```bash
npm install node-fetch@2 @solana/web3.js csv-writer prompt-sync
```

## Usage

### Run the Analyzer

```bash
cd analyzer
node run.js
```

### Example Session

```
🔍 Solana Token History Analyzer

══════════════════════════════════════════════════
Enter token mint address: 9XzQn...abcd
Enter start date/time (YYYY-MM-DD HH:MM) or leave blank for full history: 2025-10-27 17:00
══════════════════════════════════════════════════

🔍 Step 1/5: Fetching token metadata...
📊 Token: MyToken (MTK)
📊 Supply: 1,000,000,000

🔍 Step 2/5: Fetching transactions...
✅ Fetched 450 transactions from Helius

🔍 Step 3/5: Parsing events...
✅ Filtered to 230 events after 2025-10-27T17:00:00.000Z

🔍 Step 4/5: Analyzing data...

🔍 Step 5/5: Exporting results...

✅ Exported summary.json
✅ Exported price_series.csv
✅ Exported buyers.csv
✅ Exported transfers.csv
✅ Exported raw_events.json

══════════════════════════════════════════════════
📊 ANALYSIS SUMMARY
══════════════════════════════════════════════════
Token: MyToken (MTK)
Mint: 9XzQn...abcd
Supply: 1,000,000,000 tokens

Initial Price: 0.0000001234 SOL
Initial Market Cap: 123.40 SOL
Pool Created: 2025-10-27T17:05:32.000Z

Total Events: 230
Total Swaps: 156
Early Buyers: 45

Top 3 Early Buyers:
  1. 5vK8a2...
     Bought: 15,000,000 tokens for 1.5000 SOL
     Time: 2025-10-27T17:06:00.000Z
     Sold: No
  2. 8xP3m1...
     Bought: 12,500,000 tokens for 1.2500 SOL
     Time: 2025-10-27T17:07:15.000Z
     Sold: Yes
  3. 3nL9c4...
     Bought: 10,000,000 tokens for 1.0000 SOL
     Time: 2025-10-27T17:08:30.000Z
     Sold: No

📁 Output Files:
  - summary.json
  - price_series.csv
  - buyers.csv
  - transfers.csv
  - raw_events.json

✅ Analysis complete!
```

## Output Files

### 1. `summary.json`

Overview of the token analysis:

```json
{
  "token": {
    "mint": "9XzQn...",
    "name": "MyToken",
    "symbol": "MTK",
    "supply": 1000000000
  },
  "analysis": {
    "initial_price_sol": 0.0000001234,
    "initial_market_cap_sol": 123.4,
    "pool_created": "2025-10-27T17:05:32.000Z",
    "total_events": 230,
    "total_swaps": 156,
    "early_buyers_count": 45
  },
  "filters": {
    "start_timestamp": "2025-10-27T17:00:00.000Z"
  },
  "generated_at": "2025-10-27T18:30:00.000Z"
}
```

### 2. `price_series.csv`

Price and volume over time:

| Timestamp | Price (SOL) | Volume (SOL) | Transaction |
|-----------|-------------|--------------|-------------|
| 2025-10-27T17:05:32Z | 0.0000001234 | 1.5 | 3kL9m... |
| 2025-10-27T17:07:15Z | 0.0000001456 | 2.3 | 8xP3m... |

### 3. `buyers.csv`

Early buyer metrics:

| Wallet | First Buy Time | Total SOL Invested | Total Tokens Bought | Has Sold | Time to First Sell |
|--------|----------------|-------------------|---------------------|----------|-------------------|
| 5vK8a2... | 2025-10-27T17:06:00Z | 1.5 | 15000000 | false | null |

### 4. `transfers.csv`

All transfer and swap events:

| Timestamp | Type | Signature | Details |
|-----------|------|-----------|---------|
| 2025-10-27T17:05:32Z | swap | 3kL9m... | {...} |

### 5. `raw_events.json`

Complete parsed event data for custom analysis.

## API Information

### Helius API (Recommended)

The tool uses Helius free tier endpoints:

- Token metadata: `https://api.helius.xyz/v0/token-metadata`
- Transactions: `https://api.helius.xyz/v0/addresses/{mint}/transactions`

**Limits**: Free tier provides sufficient data for most token analyses.

**Get API Key**: https://helius.xyz (free signup)

### Fallback RPC

If no Helius API key is provided, the tool falls back to standard Solana RPC:

- Endpoint: `https://api.mainnet-beta.solana.com`
- Note: May have rate limits and less detailed transaction data

## Use Cases

1. **Research Pump.fun Tokens**: Analyze newly launched memecoins
2. **Track Early Buyers**: Identify profitable wallets and strategies
3. **Price History**: Understand token price movement from launch
4. **Due Diligence**: Investigate token before investing
5. **Academic Research**: Study on-chain token economics

## Limitations

- Free Helius tier has rate limits (sufficient for most analyses)
- RPC fallback may be slower and have less detailed data
- Very high-volume tokens may require pagination (coming soon)
- Wallet addresses simplified in current implementation

## Roadmap

- [ ] Pagination support for high-volume tokens
- [ ] Wallet balance tracking over time
- [ ] Liquidity pool depth analysis
- [ ] Holder distribution charts
- [ ] Export to additional formats (Excel, charts)

## Support

For issues or questions, open an issue in the main repository.

## License

MIT
