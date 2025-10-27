#!/usr/bin/env python3
"""
Axiom.trade API Service
Provides trending tokens data from axiom.trade
"""

from axiomtradeapi import AxiomTradeClient
import json
import os
import sys
from flask import Flask, jsonify, request
from datetime import datetime, timedelta

app = Flask(__name__)

# Global client instance
client = None
auth_token = None
token_expiry = None

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

def initialize_client():
    """Initialize axiom.trade client with authentication"""
    global client, auth_token, token_expiry
    
    try:
        client = AxiomTradeClient()
        
        # Try to load stored tokens first
        stored_tokens = load_stored_tokens()
        
        if stored_tokens and stored_tokens.get('auth_token'):
            print("🔑 Using stored authentication tokens...")
            auth_token = stored_tokens['auth_token']
            token_expiry = datetime.now() + timedelta(hours=24)
            print("✅ Authenticated with stored tokens")
            return True
        
        # Fallback to environment variables
        email = os.getenv('AXIOM_EMAIL')
        password = os.getenv('AXIOM_PASSWORD')  # Should be base64 encoded
        
        if not email or not password:
            print("⚠️ No authentication found")
            print("Please run: python3 server/axiom_auth.py")
            print("Or set AXIOM_EMAIL and AXIOM_PASSWORD secrets")
            return False
        
        print("⚠️ No stored tokens found")
        print("Please run: python3 server/axiom_auth.py to authenticate")
        return False
        
    except Exception as e:
        print(f"❌ Authentication failed: {e}")
        return False

def get_trending_tokens_data(timeframe='1h'):
    """Fetch trending tokens from axiom.trade"""
    global client, auth_token, token_expiry
    
    # Check if we need to re-authenticate
    if not client or not auth_token or (token_expiry and datetime.now() >= token_expiry):
        if not initialize_client():
            return {"error": "Authentication required", "tokens": []}
    
    try:
        # Fetch trending tokens
        response = client.get_trending_tokens(timeframe)
        tokens = response.get('tokens', [])
        
        # Transform to our expected format
        formatted_tokens = []
        for token in tokens:
            formatted_tokens.append({
                'tokenAddress': token.get('tokenAddress', ''),
                'name': token.get('tokenName', 'Unknown'),
                'symbol': token.get('tokenTicker', 'UNKNOWN'),
                'price': 0,  # axiom provides price, we'll convert it
                'marketCap': float(token.get('marketCapSol', 0)) * 175,  # Convert SOL to USD approximation
                'volume24h': float(token.get('volumeSol', 0)) * 175,  # Convert SOL to USD
                'priceChange24h': float(token.get('priceChange24h', 0)),
                'creator': None,
                'timestamp': datetime.now().isoformat(),
                'icon': None,
                # Additional axiom.trade specific data
                'volumeSol': float(token.get('volumeSol', 0)),
                'marketCapSol': float(token.get('marketCapSol', 0)),
            })
        
        return {"tokens": formatted_tokens, "source": "axiom.trade"}
        
    except Exception as e:
        print(f"❌ Error fetching trending tokens: {e}")
        return {"error": str(e), "tokens": []}

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "axiom-trade-api"})

@app.route('/trending')
def trending():
    """Get trending tokens"""
    timeframe = request.args.get('timeframe', '1h')
    data = get_trending_tokens_data(timeframe)
    return jsonify(data)

@app.route('/trending/<timeframe>')
def trending_timeframe(timeframe):
    """Get trending tokens by timeframe"""
    data = get_trending_tokens_data(timeframe)
    return jsonify(data)

if __name__ == '__main__':
    print("🚀 Starting Axiom.trade API Service...")
    
    # Try to initialize on startup
    initialize_client()
    
    # Run Flask server
    port = int(os.getenv('AXIOM_SERVICE_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
