import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Medal, Award, Copy, Check, Sparkles, Crown, Flame, ChevronDown } from 'lucide-react';
import type { LeaderboardEntry } from '@shared/schema';
import { formatSol } from '@/lib/lamports';
import { useState, memo, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// =============================================================================
// GLOWING EFFECT COMPONENT (Inline for self-contained file)
// =============================================================================
const GlowingEffect = memo(({
  spread = 20,
  glow = false,
  disabled = true,
  proximity = 0,
  inactiveZone = 0.7,
  borderWidth = 1,
}: {
  spread?: number;
  glow?: boolean;
  disabled?: boolean;
  proximity?: number;
  inactiveZone?: number;
  borderWidth?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosition = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>(0);
  const currentAngleRef = useRef(0);

  const handleMove = useCallback((e?: MouseEvent | { x: number; y: number }) => {
    if (!containerRef.current) return;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    animationFrameRef.current = requestAnimationFrame(() => {
      const element = containerRef.current;
      if (!element) return;

      const { left, top, width, height } = element.getBoundingClientRect();
      const mouseX = e?.x ?? lastPosition.current.x;
      const mouseY = e?.y ?? lastPosition.current.y;
      if (e) lastPosition.current = { x: mouseX, y: mouseY };

      const center = [left + width * 0.5, top + height * 0.5];
      const distanceFromCenter = Math.hypot(mouseX - center[0], mouseY - center[1]);
      const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

      if (distanceFromCenter < inactiveRadius) {
        element.style.setProperty("--active", "0");
        return;
      }

      const isActive = mouseX > left - proximity && mouseX < left + width + proximity &&
                       mouseY > top - proximity && mouseY < top + height + proximity;
      element.style.setProperty("--active", isActive ? "1" : "0");
      if (!isActive) return;

      let targetAngle = (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) / Math.PI + 90;
      const angleDiff = ((targetAngle - currentAngleRef.current + 180) % 360) - 180;
      const newAngle = currentAngleRef.current + angleDiff;
      
      const startAngle = currentAngleRef.current;
      const startTime = performance.now();
      
      const animateAngle = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / 2000, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = startAngle + (newAngle - startAngle) * eased;
        element.style.setProperty("--start", String(value));
        currentAngleRef.current = value;
        if (progress < 1) requestAnimationFrame(animateAngle);
      };
      requestAnimationFrame(animateAngle);
    });
  }, [inactiveZone, proximity]);

  useEffect(() => {
    if (disabled) return;
    const handleScroll = () => handleMove();
    const handlePointerMove = (e: PointerEvent) => handleMove(e);
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.body.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("scroll", handleScroll);
      document.body.removeEventListener("pointermove", handlePointerMove);
    };
  }, [handleMove, disabled]);

  return (
    <>
      <div className={cn("pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity", glow && "opacity-100", disabled && "!block")} />
      <div
        ref={containerRef}
        style={{
          "--spread": spread, "--start": "0", "--active": "0",
          "--glowingeffect-border-width": `${borderWidth}px`,
          "--repeating-conic-gradient-times": "5",
          "--gradient": `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%),
             radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%),
             radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%), 
             radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%),
             repeating-conic-gradient(from 236.84deg at 50% 50%, #dd7bbb 0%, #d79f1e calc(25% / var(--repeating-conic-gradient-times)), #5a922c calc(50% / var(--repeating-conic-gradient-times)), #4c7894 calc(75% / var(--repeating-conic-gradient-times)), #dd7bbb calc(100% / var(--repeating-conic-gradient-times)))`,
        } as React.CSSProperties}
        className={cn("pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity", glow && "opacity-100", disabled && "!hidden")}
      >
        <div className={cn(
          "glow rounded-[inherit]",
          'after:content-[""] after:rounded-[inherit] after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))]',
          "after:[border:var(--glowingeffect-border-width)_solid_transparent]",
          "after:[background:var(--gradient)] after:[background-attachment:fixed]",
          "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
          "after:[mask-clip:padding-box,border-box] after:[mask-composite:intersect]",
          "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]"
        )} />
      </div>
    </>
  );
});

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
};

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

  const groupedWinners = pastWinners.reduce((acc: any, winner: any) => {
    const key = `${winner.periodStart}-${winner.periodEnd}`;
    if (!acc[key]) {
      acc[key] = { periodStart: winner.periodStart, periodEnd: winner.periodEnd, winners: [] };
    }
    acc[key].winners.push(winner);
    return acc;
  }, {});
  
  const periodGroups = Object.values(groupedWinners);

  const copyWalletAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast({ title: "Copied!", description: "Wallet address copied to clipboard" });
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      toast({ title: "Failed to copy", description: "Could not copy wallet address", variant: "destructive" });
    }
  };

  const truncateAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

  const getRankDisplay = (index: number) => {
    switch (index) {
      case 0: return { icon: '🥇', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' };
      case 1: return { icon: '🥈', color: 'text-gray-300', bg: 'bg-gray-300/10', border: 'border-gray-300/30' };
      case 2: return { icon: '🥉', color: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/30' };
      default: return { icon: `#${index + 1}`, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border' };
    }
  };

  const renderPeriodGroups = (groups: any[]) => {
    if (groups.length === 0) {
      return (
        <motion.div 
          className="text-center py-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Trophy className="h-10 w-10 text-primary" />
          </div>
          <p className="text-xl font-semibold text-foreground mb-2">No past winners yet</p>
          <p className="text-muted-foreground">Trade to become a winner in the next period</p>
        </motion.div>
      );
    }

    return (
      <div className="space-y-8">
        {groups.map((group: any, groupIndex: number) => (
          <motion.div 
            key={groupIndex} 
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.1 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <Award className="h-5 w-5 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Period {groups.length - groupIndex}</h3>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {new Date(group.periodStart).toLocaleDateString()} {new Date(group.periodStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Badge>
            </div>
            {renderLeaderboardList(group.winners, 'periodProfit', false, true)}
          </motion.div>
        ))}
      </div>
    );
  };

  const renderLeaderboardList = (
    leaders: LeaderboardEntry[], 
    profitKey: 'totalProfit' | 'periodProfit' = 'totalProfit', 
    showPeriodDates = false,
    compact = false
  ) => {
    if (leaders.length === 0) {
      return (
        <motion.div 
          className="text-center py-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Flame className="h-10 w-10 text-primary" />
          </div>
          <p className="text-xl font-semibold text-foreground mb-2">No traders yet</p>
          <p className="text-muted-foreground">Start trading to appear on the leaderboard</p>
        </motion.div>
      );
    }

    return (
      <motion.div 
        className="space-y-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {leaders.map((entry: any, index) => {
          const profit = entry[profitKey] || 0;
          const isTopThree = index < 3;
          const rankDisplay = getRankDisplay(index);

          return (
            <motion.div
              key={`${entry.id}-${index}`}
              variants={itemVariants}
              className="relative"
            >
              {/* Glowing effect for top 3 */}
              {isTopThree && !compact && (
                <div className={cn(
                  "absolute -inset-0.5 rounded-xl blur-sm opacity-50",
                  index === 0 && "bg-gradient-to-r from-yellow-400/50 to-amber-400/50",
                  index === 1 && "bg-gradient-to-r from-gray-300/50 to-gray-400/50",
                  index === 2 && "bg-gradient-to-r from-amber-600/50 to-orange-600/50",
                )} />
              )}
              
              <div className={cn(
                "relative flex items-center gap-4 p-4 rounded-xl border transition-all",
                isTopThree ? `${rankDisplay.bg} ${rankDisplay.border}` : "bg-card border-border hover:border-primary/30",
                !compact && "hover:scale-[1.01]"
              )}>
                {/* Rank */}
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold shrink-0",
                  isTopThree ? rankDisplay.bg : "bg-muted"
                )}>
                  {isTopThree ? rankDisplay.icon : <span className="text-sm text-muted-foreground">#{index + 1}</span>}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("font-semibold truncate", isTopThree && index === 0 && "text-yellow-400")}>
                      {entry.username}
                    </p>
                    {isTopThree && (
                      <Crown className={cn("h-4 w-4 shrink-0", rankDisplay.color)} />
                    )}
                  </div>
                  
                  {showPeriodDates && entry.periodStart && entry.periodEnd && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(entry.periodStart).toLocaleDateString()} {new Date(entry.periodStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  
                  {entry.walletAddress && (
                    <button
                      onClick={() => copyWalletAddress(entry.walletAddress!)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 group"
                    >
                      <span className="font-mono">{truncateAddress(entry.walletAddress)}</span>
                      {copiedAddress === entry.walletAddress ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  )}
                </div>

                {/* Profit */}
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-xl font-bold font-mono",
                    profit >= 0 ? 'text-green-500' : 'text-red-500'
                  )}>
                    {profit >= 0 ? '+' : ''}{formatSol(profit)} SOL
                  </p>
                  {entry.balance !== undefined && !compact && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Balance: {formatSol(entry.balance)} SOL
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-b from-primary/10 to-accent/5 blur-3xl" />
        
        <div className="container mx-auto px-4 py-12 relative">
          <motion.div 
            className="max-w-4xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Badge className="mb-4 bg-primary/10 border-primary/30">
              <Sparkles className="h-3 w-3 mr-1" />
              Live Rankings
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-primary via-accent to-chart-3 bg-clip-text text-transparent">
                Leaderboard
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Top traders compete for real SOL rewards every 6 hours
            </p>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Tabs defaultValue="period" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-card border border-border">
            <TabsTrigger value="period" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Flame className="h-4 w-4" />
              <span className="hidden sm:inline">Current</span> 6h
            </TabsTrigger>
            <TabsTrigger value="overall" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Trophy className="h-4 w-4" />
              All Time
            </TabsTrigger>
            <TabsTrigger value="winners" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Past</span> Winners
            </TabsTrigger>
          </TabsList>

          <TabsContent value="period">
            <div className="relative rounded-2xl border border-border p-2">
              <GlowingEffect spread={30} glow={true} disabled={false} proximity={50} inactiveZone={0.2} borderWidth={2} />
              <Card className="p-6 border-0">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">Current 6-Hour Period</h2>
                    {periodData?.periodStart && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Started: {new Date(periodData.periodStart).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                    Live
                  </Badge>
                </div>
                {renderLeaderboardList(currentPeriod, 'periodProfit')}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="overall">
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-foreground mb-6">All-Time Leaders</h2>
              {renderLeaderboardList(overall, 'totalProfit')}
            </Card>
          </TabsContent>

          <TabsContent value="winners">
            <Card className="p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Past Period Winners</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Top 3 traders from each 6-hour trading period win real SOL
                </p>
              </div>
              {renderPeriodGroups(periodGroups)}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Prize Info Card */}
        <motion.div 
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Win Real SOL Rewards</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Top 3 traders in each 6-hour period share 50% of creator fees:
                </p>
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-yellow-400/10 text-yellow-400 border-yellow-400/30">🥇 1st: 50%</Badge>
                  <Badge className="bg-gray-300/10 text-gray-300 border-gray-300/30">🥈 2nd: 30%</Badge>
                  <Badge className="bg-amber-600/10 text-amber-600 border-amber-600/30">🥉 3rd: 20%</Badge>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
