#!/usr/bin/env node

/**
 * Solana Token History Analyzer
 * 
 * A CLI tool to analyze the on-chain history of Solana SPL tokens
 * using Helius API or fallback RPC endpoints.
 * 
 * Usage:
 *   node run.js
 * 
 * Then follow the prompts to enter:
 *   - Token mint address
 *   - Optional start date/time (YYYY-MM-DD HH:MM)
 * 
 * Requirements:
 *   - HELIUS_API_KEY environment variable (optional, enhances data quality)
 *   - RPC_URL environment variable (optional, defaults to public endpoint)
 * 
 * Outputs:
 *   - summary.json - Overview of token (supply, price, mcap)
 *   - price_series.csv - Price and volume over time
 *   - buyers.csv - Early buyer metrics
 *   - transfers.csv - All transfers/swaps
 *   - raw_events.json - Full parsed events
 */

const fetch = require('node-fetch');
const { Connection, PublicKey } = require('@solana/web3.js');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const prompt = require('prompt-sync')({ sigint: true });
const fs = require('fs');
const path = require('path');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const DEFAULT_TIMEZONE = 'Europe/Paris';

// Helper: Convert date string to UNIX timestamp
function dateToTimestamp(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  try {
    // Parse YYYY-MM-DD HH:MM format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('⚠️  Invalid date format. Using full history.');
      return null;
    }
    return Math.floor(date.getTime() / 1000);
  } catch (error) {
    console.warn('⚠️  Error parsing date:', error.message);
    return null;
  }
}

// Helper: Format timestamp to ISO date
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString();
}

// Helper: Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Fetch token metadata from Helius
 */
async function fetchTokenMetadata(mint) {
  if (!HELIUS_API_KEY) {
    console.log('ℹ️  No Helius API key found, skipping metadata fetch');
    return null;
  }

  try {
    const url = `https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [mint] }),
    });

    if (!response.ok) {
      console.warn(`⚠️  Helius metadata fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data[0] || null;
  } catch (error) {
    console.warn('⚠️  Error fetching token metadata:', error.message);
    return null;
  }
}

/**
 * Fetch token transactions via Helius enhanced transactions API
 */
async function fetchTokenTransactionsViaHelius(mint, limit = 1000) {
  if (!HELIUS_API_KEY) {
    console.log('ℹ️  No Helius API key, using fallback RPC method');
    return await fetchTokenTransactionsViaRPC(mint, limit);
  }

  console.log('🔍 Fetching transactions from Helius...');
  const transactions = [];
  
  try {
    // Fetch transactions involving this mint address
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${HELIUS_API_KEY}&limit=${Math.min(limit, 100)}`;
    const response = await fetchWithTimeout(url, {}, 15000);

    if (!response.ok) {
      console.warn(`⚠️  Helius transactions fetch failed: ${response.status}`);
      return await fetchTokenTransactionsViaRPC(mint, limit);
    }

    const data = await response.json();
    transactions.push(...(data || []));
    
    console.log(`✅ Fetched ${transactions.length} transactions from Helius`);
    return transactions;
  } catch (error) {
    console.warn('⚠️  Helius fetch error:', error.message);
    return await fetchTokenTransactionsViaRPC(mint, limit);
  }
}

/**
 * Fallback: Fetch transactions via standard RPC
 */
async function fetchTokenTransactionsViaRPC(mint, limit = 100) {
  console.log('🔍 Fetching transactions via RPC fallback...');
  
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const pubkey = new PublicKey(mint);
    
    const signatures = await connection.getSignaturesForAddress(pubkey, {
      limit: Math.min(limit, 1000),
    });

    console.log(`✅ Found ${signatures.length} signatures via RPC`);
    
    // Fetch transaction details in batches
    const transactions = [];
    const batchSize = 10;
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      const txPromises = batch.map(sig =>
        connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })
      );
      
      const txs = await Promise.all(txPromises);
      transactions.push(...txs.filter(tx => tx !== null));
      
      // Progress indicator
      if (i > 0 && i % 50 === 0) {
        console.log(`  Fetched ${i}/${signatures.length} transactions...`);
      }
    }
    
    console.log(`✅ Fetched ${transactions.length} transaction details`);
    return transactions;
  } catch (error) {
    console.error('❌ RPC fetch error:', error.message);
    return [];
  }
}

/**
 * Parse Helius transactions into structured events
 */
function parseHeliusTxsToEvents(rawTxs, mint) {
  const events = [];

  for (const tx of rawTxs) {
    try {
      // Handle both Helius enhanced format and standard RPC format
      const timestamp = tx.timestamp || tx.blockTime || 0;
      const signature = tx.signature || '';
      
      // Extract transfer/swap events from transaction
      if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.mint === mint) {
            events.push({
              type: 'transfer',
              timestamp,
              signature,
              from: transfer.fromUserAccount || '',
              to: transfer.toUserAccount || '',
              amount: transfer.tokenAmount || 0,
              mint,
            });
          }
        }
      }

      // Extract swap events
      if (tx.type === 'SWAP' && tx.events && tx.events.swap) {
        const swap = tx.events.swap;
        if (swap.tokenInputs?.[0]?.mint === mint || swap.tokenOutputs?.[0]?.mint === mint) {
          events.push({
            type: 'swap',
            timestamp,
            signature,
            tokenIn: swap.tokenInputs?.[0]?.mint || '',
            tokenOut: swap.tokenOutputs?.[0]?.mint || '',
            amountIn: swap.tokenInputs?.[0]?.tokenAmount || 0,
            amountOut: swap.tokenOutputs?.[0]?.tokenAmount || 0,
            nativeInput: swap.nativeInput || 0,
            nativeOutput: swap.nativeOutput || 0,
          });
        }
      }

      // Detect liquidity pool creation
      if (tx.type === 'CREATE_POOL' || (tx.instructions && tx.instructions.some(i => i.programId === 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'))) {
        events.push({
          type: 'pool_created',
          timestamp,
          signature,
          mint,
        });
      }
    } catch (error) {
      console.warn('⚠️  Error parsing transaction:', error.message);
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Compute initial pool data and price from events
 */
function basicComputeInitialPool(events, mint) {
  // Find earliest swap or pool creation event
  const swapEvents = events.filter(e => e.type === 'swap');
  
  if (swapEvents.length === 0) {
    return {
      initialPrice: 0,
      initialLiquidity: 0,
      poolCreated: null,
    };
  }

  const firstSwap = swapEvents[0];
  const initialPrice = firstSwap.nativeInput && firstSwap.amountOut 
    ? (firstSwap.nativeInput / 1e9) / firstSwap.amountOut 
    : 0;

  return {
    initialPrice,
    initialLiquidity: firstSwap.nativeInput || 0,
    poolCreated: formatTimestamp(firstSwap.timestamp),
  };
}

/**
 * Extract price time-series from swap events
 */
function extractPriceSeries(events, mint) {
  const priceSeries = [];
  const swaps = events.filter(e => e.type === 'swap');

  for (const swap of swaps) {
    const price = swap.nativeInput && swap.amountOut
      ? (swap.nativeInput / 1e9) / swap.amountOut
      : 0;

    if (price > 0) {
      priceSeries.push({
        timestamp: formatTimestamp(swap.timestamp),
        price_sol: price,
        volume_sol: swap.nativeInput / 1e9,
        signature: swap.signature,
      });
    }
  }

  return priceSeries;
}

/**
 * Extract early buyers from transfer/swap events
 */
function extractBuyersFromEvents(events, mint, limit = 50) {
  const buyers = new Map();
  
  // Track buys (transfers to wallets or swaps)
  for (const event of events) {
    if (event.type === 'swap' && event.tokenOut === mint) {
      const buyer = event.signature.slice(0, 10); // Simplified - use wallet address in real implementation
      const amountSol = event.nativeInput / 1e9;
      const tokensReceived = event.amountOut;
      
      if (!buyers.has(buyer)) {
        buyers.set(buyer, {
          wallet: buyer,
          first_buy_time: formatTimestamp(event.timestamp),
          total_sol_invested: 0,
          total_tokens_bought: 0,
          has_sold: false,
          time_to_first_sell: null,
        });
      }
      
      const buyerData = buyers.get(buyer);
      buyerData.total_sol_invested += amountSol;
      buyerData.total_tokens_bought += tokensReceived;
    }
    
    // Track sells
    if (event.type === 'swap' && event.tokenIn === mint) {
      const seller = event.signature.slice(0, 10);
      if (buyers.has(seller) && !buyers.get(seller).has_sold) {
        const buyerData = buyers.get(seller);
        buyerData.has_sold = true;
        const buyTime = new Date(buyerData.first_buy_time).getTime() / 1000;
        buyerData.time_to_first_sell = event.timestamp - buyTime;
      }
    }
  }

  return Array.from(buyers.values())
    .sort((a, b) => new Date(a.first_buy_time) - new Date(b.first_buy_time))
    .slice(0, limit);
}

/**
 * Export data to CSV files
 */
async function exportToCSV(filename, records, headers) {
  const csvWriter = createCsvWriter({
    path: filename,
    header: headers,
  });

  await csvWriter.writeRecords(records);
  console.log(`✅ Exported ${filename}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🔍 Solana Token History Analyzer\n');
  console.log('═'.repeat(50));
  
  // Get user input
  const mintAddress = prompt('Enter token mint address: ').trim();
  if (!mintAddress) {
    console.error('❌ No mint address provided');
    process.exit(1);
  }

  const startDateStr = prompt('Enter start date/time (YYYY-MM-DD HH:MM) or leave blank for full history: ').trim();
  const startTimestamp = dateToTimestamp(startDateStr);

  if (startTimestamp) {
    console.log(`📅 Filtering events after: ${formatTimestamp(startTimestamp)}`);
  } else {
    console.log('📅 Analyzing full token history');
  }

  console.log('═'.repeat(50) + '\n');

  // Fetch token metadata
  console.log('🔍 Step 1/5: Fetching token metadata...');
  const metadata = await fetchTokenMetadata(mintAddress);
  const tokenName = metadata?.account?.data?.name || 'Unknown Token';
  const tokenSymbol = metadata?.account?.data?.symbol || 'UNKNOWN';
  const supply = metadata?.account?.data?.tokenAmount?.uiAmount || 0;
  
  console.log(`📊 Token: ${tokenName} (${tokenSymbol})`);
  console.log(`📊 Supply: ${supply.toLocaleString()}\n`);

  // Fetch transactions
  console.log('🔍 Step 2/5: Fetching transactions...');
  const rawTxs = await fetchTokenTransactionsViaHelius(mintAddress, 1000);
  
  if (rawTxs.length === 0) {
    console.error('❌ No transactions found for this token');
    process.exit(1);
  }

  // Parse events
  console.log('🔍 Step 3/5: Parsing events...');
  let events = parseHeliusTxsToEvents(rawTxs, mintAddress);
  
  // Filter by start timestamp
  if (startTimestamp) {
    events = events.filter(e => e.timestamp >= startTimestamp);
    console.log(`✅ Filtered to ${events.length} events after ${formatTimestamp(startTimestamp)}`);
  } else {
    console.log(`✅ Parsed ${events.length} events`);
  }

  // Analyze data
  console.log('\n🔍 Step 4/5: Analyzing data...');
  const poolData = basicComputeInitialPool(events, mintAddress);
  const priceSeries = extractPriceSeries(events, mintAddress);
  const earlyBuyers = extractBuyersFromEvents(events, mintAddress, 50);

  // Calculate market cap
  const initialMarketCap = poolData.initialPrice * supply;

  // Create summary
  const summary = {
    token: {
      mint: mintAddress,
      name: tokenName,
      symbol: tokenSymbol,
      supply,
    },
    analysis: {
      initial_price_sol: poolData.initialPrice,
      initial_market_cap_sol: initialMarketCap,
      pool_created: poolData.poolCreated,
      total_events: events.length,
      total_swaps: priceSeries.length,
      early_buyers_count: earlyBuyers.length,
    },
    filters: {
      start_timestamp: startTimestamp ? formatTimestamp(startTimestamp) : null,
    },
    generated_at: new Date().toISOString(),
  };

  // Export files
  console.log('\n🔍 Step 5/5: Exporting results...\n');

  // Export summary.json
  fs.writeFileSync(
    path.join(process.cwd(), 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('✅ Exported summary.json');

  // Export price_series.csv
  if (priceSeries.length > 0) {
    await exportToCSV(
      path.join(process.cwd(), 'price_series.csv'),
      priceSeries,
      [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'price_sol', title: 'Price (SOL)' },
        { id: 'volume_sol', title: 'Volume (SOL)' },
        { id: 'signature', title: 'Transaction' },
      ]
    );
  }

  // Export buyers.csv
  if (earlyBuyers.length > 0) {
    await exportToCSV(
      path.join(process.cwd(), 'buyers.csv'),
      earlyBuyers,
      [
        { id: 'wallet', title: 'Wallet' },
        { id: 'first_buy_time', title: 'First Buy Time' },
        { id: 'total_sol_invested', title: 'Total SOL Invested' },
        { id: 'total_tokens_bought', title: 'Total Tokens Bought' },
        { id: 'has_sold', title: 'Has Sold' },
        { id: 'time_to_first_sell', title: 'Time to First Sell (seconds)' },
      ]
    );
  }

  // Export transfers.csv
  const transfers = events.filter(e => e.type === 'transfer' || e.type === 'swap');
  if (transfers.length > 0) {
    await exportToCSV(
      path.join(process.cwd(), 'transfers.csv'),
      transfers.map(t => ({
        timestamp: formatTimestamp(t.timestamp),
        type: t.type,
        signature: t.signature,
        details: JSON.stringify(t),
      })),
      [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'type', title: 'Type' },
        { id: 'signature', title: 'Signature' },
        { id: 'details', title: 'Details' },
      ]
    );
  }

  // Export raw_events.json
  fs.writeFileSync(
    path.join(process.cwd(), 'raw_events.json'),
    JSON.stringify(events, null, 2)
  );
  console.log('✅ Exported raw_events.json');

  // Print console summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 ANALYSIS SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Token: ${tokenName} (${tokenSymbol})`);
  console.log(`Mint: ${mintAddress}`);
  console.log(`Supply: ${supply.toLocaleString()} tokens`);
  console.log(`\nInitial Price: ${poolData.initialPrice.toFixed(10)} SOL`);
  console.log(`Initial Market Cap: ${initialMarketCap.toFixed(2)} SOL`);
  console.log(`Pool Created: ${poolData.poolCreated || 'N/A'}`);
  console.log(`\nTotal Events: ${events.length}`);
  console.log(`Total Swaps: ${priceSeries.length}`);
  console.log(`Early Buyers: ${earlyBuyers.length}`);
  
  if (earlyBuyers.length > 0) {
    console.log(`\nTop 3 Early Buyers:`);
    earlyBuyers.slice(0, 3).forEach((buyer, idx) => {
      console.log(`  ${idx + 1}. ${buyer.wallet}`);
      console.log(`     Bought: ${buyer.total_tokens_bought.toLocaleString()} tokens for ${buyer.total_sol_invested.toFixed(4)} SOL`);
      console.log(`     Time: ${buyer.first_buy_time}`);
      console.log(`     Sold: ${buyer.has_sold ? 'Yes' : 'No'}`);
    });
  }

  console.log('\n📁 Output Files:');
  console.log('  - summary.json');
  console.log('  - price_series.csv');
  console.log('  - buyers.csv');
  console.log('  - transfers.csv');
  console.log('  - raw_events.json');
  console.log('\n✅ Analysis complete!\n');
}

// Run the analyzer
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
