import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Medal, Award, Copy, Check } from 'lucide-react';
import type { LeaderboardEntry } from '@shared/schema';
import { formatSol } from '@/lib/lamports';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function Leaderboard() {
  const { toast } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const { data: overallData } = useQuery<{ leaders: LeaderboardEntry[] }>({
    queryKey: ['/api/leaderboard/overall'],
  });

  const { data: periodData } = useQuery<{ leaders: LeaderboardEntry[]; periodStart: string }>({
    queryKey: ['/api/leaderboard/current-period'],
  });

  const { data: winnersData } = useQuery<{ winners: LeaderboardEntry[] }>({
    queryKey: ['/api/leaderboard/winners'],
  });

  const overall = (overallData?.leaders || []);
  const currentPeriod = (periodData?.leaders || []);
  const pastWinners = (winnersData?.winners || []);

  const copyWalletAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast({
        title: "Copied!",
        description: "Wallet address copied to clipboard",
      });
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy wallet address",
        variant: "destructive",
      });
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return '🥇';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return `#${index + 1}`;
    }
  };

  const renderLeaderboardList = (leaders: LeaderboardEntry[], profitKey: 'totalProfit' | 'periodProfit' = 'totalProfit', showPeriodDates = false) => {
    if (leaders.length === 0) {
      return (
        <div className="text-center py-12">
          <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-xl text-muted-foreground">No data yet</p>
          <p className="text-sm text-muted-foreground mt-2">Start trading to appear on the leaderboard</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {leaders.map((entry: any, index) => {
          const profit = entry[profitKey] || 0;
          const isTopThree = index < 3;

          return (
            <div
              key={entry.id || index}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                isTopThree 
                  ? 'bg-primary/5 border-primary/20 hover-elevate' 
                  : 'bg-card hover-elevate border-card-border'
              }`}
              data-testid={`leaderboard-entry-${index}`}
            >
              <div className="text-2xl font-bold w-12 text-center">
                {isTopThree ? getRankIcon(index) : <span className="text-muted-foreground">#{index + 1}</span>}
              </div>

              <div className="flex-1">
                <p className="font-semibold text-foreground text-lg">{entry.username}</p>
                {showPeriodDates && entry.periodStart && entry.periodEnd && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(entry.periodStart).toLocaleDateString()} {new Date(entry.periodStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(entry.periodEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {entry.walletAddress && (
                  <button
                    onClick={() => copyWalletAddress(entry.walletAddress!)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 group"
                    data-testid={`button-copy-wallet-${index}`}
                  >
                    <span className="font-mono">{truncateAddress(entry.walletAddress)}</span>
                    {copiedAddress === entry.walletAddress ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                )}
                {entry.balance !== undefined && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Balance: {formatSol(entry.balance)} SOL
                  </p>
                )}
              </div>

              <div className="text-right">
                <p 
                  className={`text-xl font-bold font-mono ${profit >= 0 ? 'text-success' : 'text-destructive'}`}
                  data-testid={`text-profit-${index}`}
                >
                  {profit >= 0 ? '+' : ''}{formatSol(profit)} SOL
                </p>
                <Badge variant={profit >= 0 ? 'default' : 'destructive'} className="mt-1">
                  {profit >= 0 ? 'Profit' : 'Loss'}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <Trophy className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold text-foreground">Leaderboard</h1>
        </div>
        <p className="text-muted-foreground">Top traders on the platform</p>
      </div>

      <Tabs defaultValue="overall" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="overall" className="gap-2" data-testid="tab-overall">
            <Trophy className="h-4 w-4" />
            All Time
          </TabsTrigger>
          <TabsTrigger value="period" className="gap-2" data-testid="tab-period">
            <Medal className="h-4 w-4" />
            Current 6h
          </TabsTrigger>
          <TabsTrigger value="winners" className="gap-2" data-testid="tab-winners">
            <Award className="h-4 w-4" />
            Past Winners
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overall">
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">Overall Leaders</h2>
            {renderLeaderboardList(overall, 'totalProfit')}
          </Card>
        </TabsContent>

        <TabsContent value="period">
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">Current 6-Hour Period</h2>
            {periodData?.periodStart && (
              <p className="text-sm text-muted-foreground mb-4">
                Period started: {new Date(periodData.periodStart).toLocaleString()}
              </p>
            )}
            {renderLeaderboardList(currentPeriod, 'periodProfit')}
          </Card>
        </TabsContent>

        <TabsContent value="winners">
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">Past Period Winners</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Historical winners from past 6-hour trading periods
            </p>
            {renderLeaderboardList(pastWinners, 'periodProfit', true)}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
