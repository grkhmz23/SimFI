import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Clock, Gift, History, ExternalLink, Info } from 'lucide-react';
import { formatSol } from '@/lib/lamports';
import { useState, useEffect } from 'react';

interface RewardsStatus {
  currentEpoch: number | null;
  epochStart: string | null;
  epochEnd: string | null;
  status: string;
  countdown: number;
  carryOver: string;
  vaultBalance: string;
  lastPayout: {
    epoch: number;
    totalPaid: string;
    winners: Array<{
      rank: number;
      username: string;
      wallet: string;
      amount: string;
      txSignature?: string;
    }>;
    txSignature?: string;
    paidAt?: string;
  } | null;
}

interface RewardsRules {
  epochDurationHours: number;
  payoutPercentages: Array<{
    rank: number;
    percentage: number;
    description: string;
  }>;
  eligibility: {
    minTrades: number;
    description: string;
  };
  minPayoutSol: string;
}

interface EpochHistory {
  epoch: number;
  startTime: string;
  endTime: string;
  status: string;
  totalPaid: string;
  winners: Array<{
    rank: number;
    username: string;
    wallet: string;
    amount: string;
    profit: string;
  }>;
  txSignature?: string;
}

export default function Rewards() {
  const [countdown, setCountdown] = useState<number>(0);

  const { data: statusData, isLoading: statusLoading } = useQuery<RewardsStatus>({
    queryKey: ['/api/rewards/status'],
    refetchInterval: 30000,
  });

  const { data: rulesData } = useQuery<RewardsRules>({
    queryKey: ['/api/rewards/rules'],
  });

  const { data: historyData } = useQuery<{ history: EpochHistory[] }>({
    queryKey: ['/api/rewards/history'],
  });

  useEffect(() => {
    if (statusData?.countdown) {
      setCountdown(statusData.countdown);
    }
  }, [statusData?.countdown]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  let rewardChain = 'solana' as 'solana' | 'base';
  const rewardSymbol = rewardChain === 'base' ? 'ETH' : 'SOL';
  const rewardExplorerUrl = (signature: string) =>
    rewardChain === 'base' ? `https://basescan.org/tx/${signature}` : `https://solscan.io/tx/${signature}`;

  const status = statusData;
  const rules = rulesData;
  const history = historyData?.history || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <Gift className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold text-foreground">Rewards</h1>
        </div>
        <p className="text-muted-foreground">
          Earn real rewards by trading! Top 3 traders every {rules?.epochDurationHours || 6} hours win prizes.
        </p>
      </div>

      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="current" className="gap-2">
            <Clock className="h-4 w-4" />
            Current Epoch
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Past Rewards
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Info className="h-4 w-4" />
            Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current">
          <div className="space-y-6">
            {/* Countdown Card */}
            <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Next Payout In</p>
                <div className="text-5xl font-bold font-mono text-primary mb-4">
                  {formatCountdown(countdown)}
                </div>
                <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                  <span>Epoch #{status?.currentEpoch || '-'}</span>
                  <span>•</span>
                  <Badge variant={status?.status === 'active' ? 'default' : 'secondary'}>
                    {status?.status || 'Loading...'}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Pot Info */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Current Pot</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Carry Over</p>
                  <p className="text-2xl font-bold text-foreground">
                    {status?.carryOver ? formatSol(BigInt(status.carryOver)) : '0'} {rewardSymbol}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vault Balance</p>
                  <p className="text-2xl font-bold text-success">
                    {status?.vaultBalance ? formatSol(BigInt(status.vaultBalance)) : '0'} {rewardSymbol}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                * Final pot includes fees claimed at epoch end
              </p>
            </Card>

            {/* Last Payout */}
            {status?.lastPayout && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Last Payout (Epoch #{status.lastPayout.epoch})</h3>
                  {status.lastPayout.txSignature && (
                    <a
                      href={rewardExplorerUrl(status.lastPayout.txSignature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View TX <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="space-y-3">
                  {status.lastPayout.winners.map((winner) => (
                    <div
                      key={`${winner.rank}-${winner.wallet}`}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                    >
                      <div className="text-2xl w-12 text-center">{getRankEmoji(winner.rank)}</div>
                      <div className="flex-1">
                        <p className="font-semibold">{winner.username}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {truncateAddress(winner.wallet)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-success">
                          +{formatSol(BigInt(winner.amount))} {rewardSymbol}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Paid</span>
                    <span className="font-bold">{formatSol(BigInt(status.lastPayout.totalPaid))} {rewardSymbol}</span>
                  </div>
                </div>
              </Card>
            )}

            {!status?.lastPayout && (
              <Card className="p-6">
                <div className="text-center py-8">
                  <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-xl text-muted-foreground">No payouts yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Be the first to win rewards!
                  </p>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">Payout History</h2>
            
            {history.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">No payout history yet</p>
              </div>
            ) : (
              <div className="space-y-6">
                {history.map((epoch) => (
                  <div key={epoch.epoch} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold">Epoch #{epoch.epoch}</h3>
                        <p className="text-xs text-muted-foreground">
                          {new Date(epoch.startTime).toLocaleString()} - {new Date(epoch.endTime).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="default">Completed</Badge>
                        {epoch.txSignature && (
                          <a
                            href={rewardExplorerUrl(epoch.txSignature)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            TX <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {epoch.winners.map((winner) => (
                        <div
                          key={`${epoch.epoch}-${winner.rank}`}
                          className="flex items-center gap-3 p-2 rounded bg-muted/30"
                        >
                          <span className="text-xl">{getRankEmoji(winner.rank)}</span>
                          <div className="flex-1">
                            <span className="font-medium">{winner.username}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              (Profit: {formatSol(BigInt(winner.profit))} {rewardSymbol})
                            </span>
                          </div>
                          <span className="font-bold text-success">
                            +{formatSol(BigInt(winner.amount))} {rewardSymbol}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t text-sm">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-bold ml-2">{formatSol(BigInt(epoch.totalPaid))} {rewardSymbol}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">How Rewards Work</h2>
            
            <div className="space-y-6">
              {/* Prize Distribution */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Prize Distribution
                </h3>
                <p className="text-muted-foreground mb-4">
                  Every {rules?.epochDurationHours || 6} hours, the top 3 profitable traders receive real {rewardSymbol} rewards:
                </p>
                <div className="grid gap-3">
                  {(rules?.payoutPercentages || [
                    { rank: 1, percentage: 50, description: '1st place - 50% of pot' },
                    { rank: 2, percentage: 30, description: '2nd place - 30% of pot' },
                    { rank: 3, percentage: 20, description: '3rd place - 20% of pot' },
                  ]).map((payout) => (
                    <div
                      key={payout.rank}
                      className="flex items-center gap-4 p-3 rounded-lg border"
                    >
                      <span className="text-2xl">{getRankEmoji(payout.rank)}</span>
                      <div className="flex-1">
                        <p className="font-semibold">{payout.description}</p>
                      </div>
                      <Badge variant="secondary">{payout.percentage}%</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Eligibility */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  Eligibility Requirements
                </h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>
                    <strong>Minimum trades:</strong> Complete at least {rules?.eligibility?.minTrades || 3} trades during the epoch
                  </li>
                  <li>
                    <strong>Positive profit:</strong> Must have net positive profit in the epoch
                  </li>
                  <li>
                    <strong>Connected wallet:</strong> Must have a {rewardSymbol === 'ETH' ? 'Base' : 'Solana'} wallet connected to your account
                  </li>
                </ul>
              </div>

              {/* How It Works */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Epoch Cycle
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Epoch runs for {rules?.epochDurationHours || 6} hours</li>
                  <li>At epoch end, fees are claimed from Bags.fm</li>
                  <li>Top 3 eligible traders are determined by epoch profit</li>
                  <li>{rewardSymbol} is distributed directly to winners' wallets</li>
                  <li>If pot is below {rules?.minPayoutSol || '0.1'} {rewardSymbol}, it carries over to next epoch</li>
                </ol>
              </div>

              {/* Important Notes */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">⚠️ Important Notes</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Rewards are paid in real {rewardSymbol} to your connected wallet</li>
                  <li>• Profit is calculated from closed trades only</li>
                  <li>• Ranking is determined by total epoch profit, not percentage gains</li>
                  <li>• Anti-farming measures are in place to ensure fair competition</li>
                </ul>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
