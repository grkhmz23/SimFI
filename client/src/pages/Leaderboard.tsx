import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Trophy, Medal, Award, Copy, Check, HelpCircle, Coins, Wallet, Clock, TrendingUp } from 'lucide-react';
import type { LeaderboardEntry } from '@shared/schema';
import { formatSol } from '@/lib/lamports';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

// Rewards status type
interface RewardsStatus {
  ok: boolean;
  enabled: boolean;
  isLeader: boolean;
  isDryRun: boolean;
  vaultReady: boolean;
  vaultPubkey?: string;
  vaultBalance?: string;
  rewardsPoolBps: number;
  carryRewardsLamports: string;
  treasuryAccruedLamports: string;
  activePeriod?: {
    id: string;
    startTime: string;
    endTime: string;
    countdownSeconds: number;
  };
  lastProcessed?: {
    periodId: string | null;
    periodEnd: string | null;
  };
  lastEpoch?: {
    id: string;
    periodId: string;
    status: string;
    totalPaid: string;
    txSignature?: string;
  };
}

function RewardsInfoDialog() {
  const { data: rewardsStatus } = useQuery<RewardsStatus>({
    queryKey: ['/api/rewards/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const poolPercent = rewardsStatus?.rewardsPoolBps ? rewardsStatus.rewardsPoolBps / 100 : 50;
  const carryLamports = BigInt(rewardsStatus?.carryRewardsLamports || '0');
  const carrySol = Number(carryLamports) / 1_000_000_000;
  const countdown = rewardsStatus?.activePeriod?.countdownSeconds || 0;
  const hours = Math.floor(countdown / 3600);
  const minutes = Math.floor((countdown % 3600) / 60);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          How Rewards Work
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Coins className="h-6 w-6 text-primary" />
            SimFi Rewards System
          </DialogTitle>
          <DialogDescription>
            Earn real SOL rewards by trading on SimFi
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Live Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-primary/10 rounded-lg p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">Next Payout In</p>
              <p className="text-xl font-bold text-foreground">
                {hours}h {minutes}m
              </p>
            </div>
            <div className="bg-primary/10 rounded-lg p-4 text-center">
              <Wallet className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">Current Pot</p>
              <p className="text-xl font-bold text-foreground">
                {carrySol.toFixed(4)} SOL
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              How It Works
            </h3>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">1</div>
                <div>
                  <p className="font-medium">Trade & Compete</p>
                  <p className="text-sm text-muted-foreground">Trade tokens on SimFi during each 6-hour period. Your profit determines your rank.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">2</div>
                <div>
                  <p className="font-medium">Fees Fund the Prize Pool</p>
                  <p className="text-sm text-muted-foreground">{poolPercent}% of all platform trading fees are automatically added to the rewards pot.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">3</div>
                <div>
                  <p className="font-medium">Top 3 Win Real SOL</p>
                  <p className="text-sm text-muted-foreground">At the end of each period, the top 3 traders by profit receive SOL directly to their wallets.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Prize Split */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Prize Distribution</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-center">
                <p className="text-2xl mb-1">🥇</p>
                <p className="font-bold text-xl">50%</p>
                <p className="text-sm text-muted-foreground">1st Place</p>
              </div>
              <div className="bg-gray-400/10 border border-gray-400/20 rounded-lg p-4 text-center">
                <p className="text-2xl mb-1">🥈</p>
                <p className="font-bold text-xl">30%</p>
                <p className="text-sm text-muted-foreground">2nd Place</p>
              </div>
              <div className="bg-orange-600/10 border border-orange-600/20 rounded-lg p-4 text-center">
                <p className="text-2xl mb-1">🥉</p>
                <p className="font-bold text-xl">20%</p>
                <p className="text-sm text-muted-foreground">3rd Place</p>
              </div>
            </div>
          </div>

          {/* Eligibility */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Eligibility Requirements</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Complete at least <strong>3 trades</strong> during the period
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                End the period with <strong>positive profit</strong>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Have a valid <strong>Solana wallet address</strong> in your profile
              </li>
            </ul>
          </div>

          {/* Technical Details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Technical Details</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Rewards are funded by creator fees claimed via <strong>Bags.fm SDK</strong></li>
              <li>• Payouts are sent automatically at the end of each 6-hour period</li>
              <li>• If the pot is too small, it carries over to the next period</li>
              <li>• All transactions are on-chain and verifiable on Solana</li>
              <li>• {100 - poolPercent}% of fees go to platform treasury for development</li>
            </ul>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2">
            <Badge variant={rewardsStatus?.enabled ? "default" : "secondary"}>
              {rewardsStatus?.enabled ? "Rewards Active" : "Rewards Coming Soon"}
            </Badge>
            {rewardsStatus?.isDryRun && (
              <Badge variant="outline">Test Mode</Badge>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

  // Group past winners by period
  const groupedWinners = pastWinners.reduce((acc: any, winner: any) => {
    const key = `${winner.periodStart}-${winner.periodEnd}`;
    if (!acc[key]) {
      acc[key] = {
        periodStart: winner.periodStart,
        periodEnd: winner.periodEnd,
        winners: []
      };
    }
    acc[key].winners.push(winner);
    return acc;
  }, {});

  const periodGroups = Object.values(groupedWinners);

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

  const renderPeriodGroups = (groups: any[]) => {
    if (groups.length === 0) {
      return (
        <div className="text-center py-12">
          <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-xl text-muted-foreground">No past winners yet</p>
          <p className="text-sm text-muted-foreground mt-2">Trade to become a winner in the next period</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {groups.map((group: any, groupIndex: number) => (
          <div key={groupIndex} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Period {groups.length - groupIndex}
              </h3>
              <p className="text-sm text-muted-foreground">
                {new Date(group.periodStart).toLocaleDateString()} {new Date(group.periodStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(group.periodEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {renderLeaderboardList(group.winners, 'periodProfit', false)}
          </div>
        ))}
      </div>
    );
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
              key={`${entry.id}-${index}`}
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <Trophy className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Leaderboard</h1>
          </div>
          <RewardsInfoDialog />
        </div>
        <p className="text-muted-foreground">Top traders compete for real SOL rewards every 6 hours</p>
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
              Top 3 traders from each 6-hour trading period receive real SOL rewards
            </p>
            {renderPeriodGroups(periodGroups)}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}