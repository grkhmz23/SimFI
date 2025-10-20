import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TokenCard } from '@/components/TokenCard';
import { useTokens } from '@/lib/websocket';
import { Search, Sparkles, GraduationCap, CheckCircle2 } from 'lucide-react';

export default function Trade() {
  const tokens = useTokens();
  const [searchQuery, setSearchQuery] = useState('');

  const filterTokens = (tokenList: any[]) => {
    if (!searchQuery) return tokenList;
    const query = searchQuery.toLowerCase();
    return tokenList.filter(t => 
      t.symbol.toLowerCase().includes(query) ||
      t.name.toLowerCase().includes(query) ||
      t.tokenAddress.toLowerCase().includes(query)
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Live Token Trading</h1>
        <p className="text-muted-foreground">
          Real-time pump.fun tokens with paper trading
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by symbol, name, or address..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>
      </div>

      <Tabs defaultValue="new" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="new" className="gap-2" data-testid="tab-new">
            <Sparkles className="h-4 w-4" />
            New ({tokens.new.length})
          </TabsTrigger>
          <TabsTrigger value="graduating" className="gap-2" data-testid="tab-graduating">
            <GraduationCap className="h-4 w-4" />
            Migrating ({tokens.graduating.length})
          </TabsTrigger>
          <TabsTrigger value="graduated" className="gap-2" data-testid="tab-graduated">
            <CheckCircle2 className="h-4 w-4" />
            Live on Raydium ({tokens.graduated.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          {filterTokens(tokens.new).length === 0 ? (
            <div className="text-center py-20">
              <Sparkles className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground">
                {searchQuery ? 'No matching tokens found' : 'Waiting for new tokens...'}
              </p>
              {!searchQuery && (
                <p className="text-sm text-muted-foreground mt-2">
                  Connected to pump.fun WebSocket
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filterTokens(tokens.new).map((token) => (
                <TokenCard key={token.tokenAddress} token={token} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="graduating" className="space-y-4">
          {filterTokens(tokens.graduating).length === 0 ? (
            <div className="text-center py-20">
              <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground">
                {searchQuery ? 'No matching tokens found' : 'No tokens migrating to Raydium'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filterTokens(tokens.graduating).map((token) => (
                <TokenCard key={token.tokenAddress} token={token} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="graduated" className="space-y-4">
          {filterTokens(tokens.graduated).length === 0 ? (
            <div className="text-center py-20">
              <CheckCircle2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground">
                {searchQuery ? 'No matching tokens found' : 'No graduated tokens yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filterTokens(tokens.graduated).map((token) => (
                <TokenCard key={token.tokenAddress} token={token} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
