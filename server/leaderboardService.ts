import { storage } from './storage';

const PERIOD_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

class LeaderboardService {
  private timer: NodeJS.Timeout | null = null;

  async start() {
    console.log('🏆 Starting leaderboard service...');
    
    // Check if we need to create initial period or close current period
    await this.checkAndManagePeriods();
    
    // Schedule checks every minute
    this.timer = setInterval(() => {
      this.checkAndManagePeriods();
    }, 60 * 1000);
    
    console.log('✅ Leaderboard service started');
  }

  async checkAndManagePeriods() {
    try {
      const currentPeriod = await storage.getCurrentLeaderboardPeriod();
      const now = new Date();

      // If no current period or current period has ended, close it and create new one
      if (!currentPeriod || new Date(currentPeriod.endTime) <= now) {
        // Close the previous period and record winner if it exists
        if (currentPeriod && !currentPeriod.winnerId) {
          await this.closePeriod(currentPeriod.id, currentPeriod.startTime, currentPeriod.endTime);
        }

        // Create new period
        const startTime = now;
        const endTime = new Date(now.getTime() + PERIOD_DURATION_MS);
        await storage.createLeaderboardPeriod(startTime, endTime);
        console.log(`🎯 New leaderboard period created: ${startTime.toISOString()} - ${endTime.toISOString()}`);
      }
    } catch (error) {
      console.error('Error managing leaderboard periods:', error);
    }
  }

  async closePeriod(periodId: string, startTime: Date, endTime: Date) {
    try {
      // Get top trader for this period (with proper time boundaries)
      const leaders = await storage.getTopUsersByPeriodProfit(startTime, endTime, 1);
      
      if (leaders.length > 0) {
        const winner = leaders[0];
        // Update the period with winner info
        await storage.updateLeaderboardPeriodWinner(periodId, winner.id, winner.periodProfit || 0);
        console.log(`🏅 Period winner recorded: ${winner.username} with ${winner.periodProfit} Lamports profit`);
      } else {
        console.log(`🏅 No trades in period ${periodId}, no winner recorded`);
      }
    } catch (error) {
      console.error('Error closing leaderboard period:', error);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 Leaderboard service stopped');
    }
  }
}

export const leaderboardService = new LeaderboardService();
