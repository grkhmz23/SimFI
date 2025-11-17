// client/src/pages/TokenAnalyzer.tsx
// Study Section - Coming Soon

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';

export default function TokenAnalyzer() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Search className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Study
          </h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Comprehensive Solana blockchain explorer powered by Helius
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card className="border-2">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-4xl font-bold">Coming Soon</CardTitle>
          <CardDescription className="text-lg mt-2">
            Advanced blockchain analytics and exploration tools are under development
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-8">
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Features in development:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-semibold mb-1">Token Analysis</h3>
                <p className="text-sm text-muted-foreground">Deep dive into token metrics and security</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-semibold mb-1">Wallet Explorer</h3>
                <p className="text-sm text-muted-foreground">Comprehensive portfolio analytics</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-semibold mb-1">Transaction History</h3>
                <p className="text-sm text-muted-foreground">Detailed transaction parsing</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-semibold mb-1">Real-time Data</h3>
                <p className="text-sm text-muted-foreground">Live blockchain monitoring</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Footer */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          Powered by{' '}
          <a 
            href="https://helius.dev" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Helius API
          </a>
          {' '}• Real-time Solana blockchain data
        </p>
      </div>
    </div>
  );
}
