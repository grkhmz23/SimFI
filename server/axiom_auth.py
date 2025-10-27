#!/usr/bin/env python3
"""
Axiom.trade Authentication Helper
Run this script manually to authenticate and store tokens
"""

from axiomtradeapi import AxiomTradeClient
import json
import os
import base64

def authenticate():
    """Manually authenticate with axiom.trade and store tokens"""
    print("🔐 Axiom.trade Authentication Setup")
    print("=" * 50)
    
    # Get credentials
    email = os.getenv('AXIOM_EMAIL')
    password = os.getenv('AXIOM_PASSWORD')
    
    if not email:
        email = input("Enter your axiom.trade email: ")
    
    if not password:
        raw_password = input("Enter your axiom.trade password: ")
        password = base64.b64encode(raw_password.encode()).decode()
        print(f"\n💡 Your base64 password (save this): {password}\n")
    
    # Initialize client
    client = AxiomTradeClient()
    
    # Get OTP
    print("📧 Check your email for the OTP code")
    otp_code = input("Enter OTP code: ")
    
    try:
        # Login
        print("\n🔑 Logging in...")
        tokens = client.login(
            email=email,
            b64_password=password,
            otp_code=otp_code
        )
        
        # Save tokens
        token_file = 'server/.axiom_tokens.json'
        with open(token_file, 'w') as f:
            json.dump({
                'auth_token': tokens.get('auth_token'),
                'refresh_token': tokens.get('refresh_token'),
                'email': email,
                'password': password
            }, f)
        
        print(f"\n✅ Authentication successful!")
        print(f"📁 Tokens saved to {token_file}")
        print("\n🔒 Add these to your Replit Secrets:")
        print(f"   AXIOM_EMAIL={email}")
        print(f"   AXIOM_PASSWORD={password}")
        
    except Exception as e:
        print(f"\n❌ Authentication failed: {e}")
        return False
    
    return True

if __name__ == '__main__':
    authenticate()
