#!/usr/bin/env python3
"""
Get trending tokens from axiom.trade
Called by Node.js backend to fetch trending data
"""

from axiomtradeapi import AxiomTradeClient
import json
import sys
import os
from datetime import datetime

def load_stored_tokens():
    """Load stored authentication tokens"""
    token_file = 'server/.axiom_tokens.json'
    if os.path.exists(token_file):
        try:
            with open(token_file, 'r') as f:
                return json.load(f)
        except:
            return None
    return None

def get_trending_tokens(timeframe='1h'):
    """Fetch trending tokens from axiom.trade"""
    try:
        # Load stored tokens
        stored_tokens = load_stored_tokens()
        
        if not stored_tokens or not stored_tokens.get('auth_token'):
            return {
                "success": False,
                "error": "Not authenticated. Run: python3 server/axiom_auth.py",
                "tokens": [],
                "needsAuth": True
            }
        
        # Initialize client with stored tokens
        try:
            client = AxiomTradeClient(
                auth_token=stored_tokens['auth_token'],
                refresh_token=stored_tokens.get('refresh_token', '')
            )
            
            # Fetch trending tokens
            response = client.get_trending_tokens(timeframe)
            tokens = response.get('tokens', [])
            
        except Exception as e:
            # If the API call fails (likely expired tokens)
            error_msg = str(e)
            if 'auth' in error_msg.lower() or 'token' in error_msg.lower() or 'unauthorized' in error_msg.lower():
                return {
                    "success": False,
                    "error": "Authentication expired. Run: python3 server/axiom_auth.py",
                    "tokens": [],
                    "needsAuth": True
                }
            return {
                "success": False,
                "error": f"Failed to fetch trending tokens: {error_msg}",
                "tokens": []
            }
        
        # Transform to our expected format (prices in lamports)
        formatted_tokens = []
        for token in tokens[:50]:  # Limit to top 50
            # Convert SOL price to lamports (1 SOL = 1,000,000,000 lamports)
            price_sol = token.get('priceSol', 0)
            price_lamports = int(float(price_sol) * 1_000_000_000) if price_sol else 0
            
            formatted_tokens.append({
                'tokenAddress': token.get('tokenAddress', ''),
                'name': token.get('tokenName', 'Unknown'),
                'symbol': token.get('tokenTicker', 'UNKNOWN'),
                'price': price_lamports,  # In lamports
                'marketCap': float(token.get('marketCapSol', 0)) * 175,  # Convert SOL to USD approximation
                'volume24h': float(token.get('volumeSol', 0)) * 175,  # Convert SOL to USD
                'priceChange24h': float(token.get('priceChange24h', 0)),
                'creator': None,
                'timestamp': datetime.now().isoformat(),
                'icon': None,
            })
        
        return {
            "success": True,
            "tokens": formatted_tokens,
            "source": "axiom.trade",
            "timeframe": timeframe
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "tokens": []
        }

if __name__ == '__main__':
    # Get timeframe from command line args (default: 1h)
    timeframe = sys.argv[1] if len(sys.argv) > 1 else '1h'
    
    # Get trending tokens
    result = get_trending_tokens(timeframe)
    
    # Output JSON to stdout for Node.js to parse
    print(json.dumps(result))
