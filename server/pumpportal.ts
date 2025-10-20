import { WebSocket, WebSocketServer } from 'ws';
import type { Server as HTTPServer } from 'http';
import axios from 'axios';
import type { Token } from '@shared/schema';
import { solToLamports } from '@shared/schema';

let newTokens: Token[] = [];
let graduatingTokens: Token[] = [];
let graduatedTokens: Token[] = [];
const MAX_TOKENS = 100;

let wss: WebSocketServer | null = null;

// DexScreener API cache
let dexScreenerCache: any[] = [];
let lastDexScreenerFetch = 0;
const DEXSCREENER_CACHE_TTL = 60000; // 1 minute

// Fetch token profiles from DexScreener
async function fetchDexScreenerProfiles(): Promise<any[]> {
  const now = Date.now();
  if (now - lastDexScreenerFetch < DEXSCREENER_CACHE_TTL && dexScreenerCache.length > 0) {
    return dexScreenerCache;
  }

  try {
    const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', {
      headers: { 'Accept': '*/*' },
      timeout: 5000,
    });
    
    if (response.data && Array.isArray(response.data)) {
      dexScreenerCache = response.data;
      lastDexScreenerFetch = now;
      console.log(`📊 Fetched ${dexScreenerCache.length} token profiles from DexScreener`);
      return dexScreenerCache;
    }
  } catch (err: any) {
    console.warn(`⚠️  DexScreener API error: ${err.message}`);
  }
  
  return dexScreenerCache;
}

// Get token metadata from DexScreener by address
async function getTokenMetadataFromDexScreener(tokenAddress: string): Promise<{ name: string; symbol: string } | null> {
  const profiles = await fetchDexScreenerProfiles();
  
  // Find Solana token matching the address
  const profile = profiles.find(
    p => p.chainId === 'solana' && p.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
  );
  
  if (profile) {
    // Extract name from description or URL
    const name = profile.description?.split('\n')[0]?.trim() || profile.url?.split('/').pop() || 'Unknown';
    const symbol = tokenAddress.slice(0, 4).toUpperCase();
    return { name, symbol };
  }
  
  return null;
}

export function initializePumpPortal(server: HTTPServer) {
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('🔌 Frontend client connected to WebSocket');
    
    // Send initial token data
    ws.send(JSON.stringify({ type: 'init', payload: { new: newTokens, graduating: graduatingTokens, graduated: graduatedTokens } }));
    
    ws.on('close', () => console.log('👋 Frontend client disconnected'));
  });

  connectToPumpPortal();
  console.log('✅ WebSocket server initialized');
}

function connectToPumpPortal() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');

  ws.on('open', () => {
    console.log('✅ Connected to PumpPortal WebSocket');
    
    // Send subscriptions separately as recommended by PumpPortal docs
    const subscribeNewToken = { method: "subscribeNewToken" };
    const subscribeMigration = { method: "subscribeMigration" };
    
    ws.send(JSON.stringify(subscribeNewToken));
    console.log('📡 Sent subscription: subscribeNewToken');
    
    ws.send(JSON.stringify(subscribeMigration));
    console.log('📡 Sent subscription: subscribeMigration');
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Ignore subscription confirmation messages
      if (message.message) {
        console.log('✅', message.message);
        return;
      }
      
      // Ignore trade events (skip if it has traderPublicKey but txType is NOT create or migrate)
      if (message.traderPublicKey && message.txType !== 'create' && message.txType !== 'migrate') {
        return;
      }
      
      let token: Token;

      // Detect newToken events by txType === "create"
      if (message.txType === 'create' && message.mint) {
        // Fetch token metadata from DexScreener
        const shortMint = `${message.mint.slice(0, 4)}...${message.mint.slice(-4)}`;
        let name = shortMint;
        let symbol = shortMint;
        
        const metadata = await getTokenMetadataFromDexScreener(message.mint);
        if (metadata) {
          name = metadata.name;
          symbol = metadata.symbol;
          console.log(`📋 DexScreener: ${symbol} (${name})`);
        }
        // Market cap from PumpPortal is in SOL
        const marketCapSOL = message.marketCapSol || message.vSolInBondingCurve || 0;
        const marketCapUSD = marketCapSOL * 150; // Approximate conversion to USD
        const pricePerToken = marketCapSOL / 1e9; // 1B token supply
        const priceLamports = solToLamports(pricePerToken);
        
        token = {
          tokenAddress: message.mint,
          name,
          symbol,
          marketCap: marketCapUSD,
          creator: message.traderPublicKey || 'N/A',
          price: priceLamports,
          timestamp: new Date().toISOString()
        };
        newTokens.unshift(token);
        if (newTokens.length > MAX_TOKENS) newTokens.pop();
        console.log(`✨ New token: ${symbol} (${name}) - MC: $${marketCapUSD.toFixed(2)}`);
        broadcast({ type: 'new', payload: token });

      // Detect migration events by txType === "migrate"
      } else if (message.txType === 'migrate' && message.mint) {
        // Fetch token metadata from DexScreener
        const shortMint = `${message.mint.slice(0, 4)}...${message.mint.slice(-4)}`;
        let name = shortMint;
        let symbol = shortMint;
        
        const metadata = await getTokenMetadataFromDexScreener(message.mint);
        if (metadata) {
          name = metadata.name;
          symbol = metadata.symbol;
          console.log(`📋 DexScreener: ${symbol} (${name})`);
        }
        // Estimate market cap (migration happens around $69k-$90k typically)
        const marketCapUSD = 75000; // Typical graduation market cap
        const marketCapSOL = marketCapUSD / 150;
        const pricePerToken = marketCapSOL / 1e9;
        const priceLamports = solToLamports(pricePerToken);
        
        token = {
          tokenAddress: message.mint,
          name,
          symbol,
          price: priceLamports,
          marketCap: marketCapUSD,
          creator: 'N/A',
          timestamp: new Date().toISOString()
        };
        
        newTokens = newTokens.filter(t => t.tokenAddress !== message.mint);
        graduatingTokens.unshift(token);
        if (graduatingTokens.length > MAX_TOKENS) graduatingTokens.pop();
        console.log(`🎓 Token graduating: ${symbol} (${name}) - MC: $${marketCapUSD.toFixed(2)}`);
        broadcast({ type: 'graduating', payload: token });

        setTimeout(() => {
          graduatingTokens = graduatingTokens.filter(t => t.tokenAddress !== message.mint);
          graduatedTokens.unshift(token);
          if (graduatedTokens.length > MAX_TOKENS) graduatedTokens.pop();
          console.log(`✅ Token graduated: ${symbol} (${name})`);
          broadcast({ type: 'graduated', payload: token });
        }, 60000);
      } else if (message.signature) {
        // Likely a trade event, skip silently
        return;
      } else {
        // Log first 200 chars of unknown messages to help debug
        console.log('⚠️  Unknown message structure:', JSON.stringify(message).substring(0, 200));
      }
    } catch (e) {
      console.error('❌ Error processing PumpPortal message:', e);
    }
  });

  ws.on('close', () => {
    console.error('❌ PumpPortal WebSocket closed. Reconnecting in 5 seconds...');
    setTimeout(connectToPumpPortal, 5000);
  });

  ws.on('error', (err) => console.error('❌ PumpPortal WebSocket error:', err.message));
}

function broadcast(data: any) {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

export function getTokens() {
  return {
    new: newTokens,
    graduating: graduatingTokens,
    graduated: graduatedTokens,
  };
}

export { fetchDexScreenerProfiles };
