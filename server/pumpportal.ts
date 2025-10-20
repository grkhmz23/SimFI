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
        // Fetch token metadata from pumpapi.fun
        let name = 'Unknown';
        let symbol = '???';
        
        try {
          const metadataResponse = await axios.get(`https://pumpapi.fun/api/get_metadata/${message.mint}`);
          if (metadataResponse.status === 200 && metadataResponse.data) {
            name = metadataResponse.data.name || 'Unknown';
            symbol = metadataResponse.data.symbol || '???';
            console.log(`📋 Fetched metadata: ${symbol} (${name})`);
          } else {
            console.warn(`⚠️  Metadata response empty for ${message.mint}`);
          }
        } catch (err: any) {
          console.warn(`⚠️  Failed to fetch metadata for ${message.mint}: ${err.message}`);
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
        // Fetch token metadata
        let name = 'Unknown';
        let symbol = '???';
        
        try {
          const metadataResponse = await axios.get(`https://pumpapi.fun/api/get_metadata/${message.mint}`);
          if (metadataResponse.status === 200 && metadataResponse.data) {
            name = metadataResponse.data.name || 'Unknown';
            symbol = metadataResponse.data.symbol || '???';
            console.log(`📋 Fetched metadata: ${symbol} (${name})`);
          } else {
            console.warn(`⚠️  Metadata response empty for ${message.mint}`);
          }
        } catch (err: any) {
          console.warn(`⚠️  Failed to fetch metadata for ${message.mint}: ${err.message}`);
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
