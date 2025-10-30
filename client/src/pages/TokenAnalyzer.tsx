// client/src/pages/TokenAnalyzer.tsx
// Main Study Section Page with 4 tabs

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import TokenAnalysis from '@/components/TokenAnalysis';
import WalletExplorer from '@/components/WalletExplorer';
import TransactionHistory from '@/components/TransactionHistory';
import RealtimeData from '@/components/RealtimeData';
import { Search, TrendingUp, Wallet, History, Activity } from 'lucide-react';

export default function TokenAnalyzer() {
  const [activeTab, setActiveTab] = useState('token-analysis');

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

      {/* Main Content */}
      <Card className="border-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 h-auto p-2 gap-2">
            <TabsTrigger 
              value="token-analysis" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Token Analysis</span>
              <span className="sm:hidden">Token</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="wallet-explorer"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Wallet Explorer</span>
              <span className="sm:hidden">Wallet</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="transaction-history"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Transactions</span>
              <span className="sm:hidden">TX</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="realtime-data"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Real-time Data</span>
              <span className="sm:hidden">Live</span>
            </TabsTrigger>
          </TabsList>

          <div className="p-6">
            <TabsContent value="token-analysis" className="mt-0">
              <TokenAnalysis />
            </TabsContent>

            <TabsContent value="wallet-explorer" className="mt-0">
              <WalletExplorer />
            </TabsContent>

            <TabsContent value="transaction-history" className="mt-0">
              <TransactionHistory />
            </TabsContent>

            <TabsContent value="realtime-data" className="mt-0">
              <RealtimeData />
            </TabsContent>
          </div>
        </Tabs>
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
