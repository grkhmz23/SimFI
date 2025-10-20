import { WebSocket, WebSocketServer } from 'ws';
import type { Server as HTTPServer } from 'http';
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
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    ws.send(JSON.stringify({ method: "subscribeMigration" }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      let token: Token;

      if (message.type === 'newToken') {
        // Convert USD market cap to approximate Lamports price per token
        // Assume token supply of 1B tokens, calculate price in SOL, then convert to Lamports
        const marketCapUSD = message.market_cap || message.usd_market_cap || 0;
        const solPrice = 150; // Approximate SOL price in USD
        const marketCapSOL = marketCapUSD / solPrice;
        const pricePerToken = marketCapSOL / 1e9; // 1B token supply
        const priceLamports = solToLamports(pricePerToken);
        
        token = {
          tokenAddress: message.mint,
          name: message.name || 'Unknown',
          symbol: message.symbol || '???',
          marketCap: message.market_cap || message.usd_market_cap || 0,
          creator: message.creator || 'N/A',
          price: priceLamports,
          timestamp: new Date().toISOString()
        };
        newTokens.unshift(token);
        if (newTokens.length > MAX_TOKENS) newTokens.pop();
        broadcast({ type: 'new', payload: token });

      } else if (message.type === 'migration') {
        const marketCapUSD = message.usd_market_cap || 0;
        const solPrice = 150;
        const marketCapSOL = marketCapUSD / solPrice;
        const pricePerToken = marketCapSOL / 1e9;
        const priceLamports = solToLamports(pricePerToken);
        
        token = {
          tokenAddress: message.mint,
          name: message.name || 'Unknown',
          symbol: message.symbol || '???',
          price: priceLamports,
          marketCap: message.usd_market_cap || 0,
          creator: message.creator || 'N/A',
          timestamp: new Date().toISOString()
        };
        
        newTokens = newTokens.filter(t => t.tokenAddress !== message.mint);
        graduatingTokens.unshift(token);
        if (graduatingTokens.length > MAX_TOKENS) graduatingTokens.pop();
        broadcast({ type: 'graduating', payload: token });

        setTimeout(() => {
          graduatingTokens = graduatingTokens.filter(t => t.tokenAddress !== message.mint);
          graduatedTokens.unshift(token);
          if (graduatedTokens.length > MAX_TOKENS) graduatedTokens.pop();
          broadcast({ type: 'graduated', payload: token });
        }, 60000);
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
