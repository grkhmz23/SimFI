import { storage } from "./storage";

// Use standard pg Pool for Render PostgreSQL (not Neon)
import pg from "pg";
const { Pool } = pg;

const PERIOD_DURATION_MS = 6 * 60 * 60 * 1000;
const LEADER_LOCK_ID = 123456789;
const LOCK_CHECK_INTERVAL_MS = 30 * 1000;

class LeaderboardService {
  private timer: NodeJS.Timeout | null = null;
  private leaderCheckTimer: NodeJS.Timeout | null = null;
  private isLeader = false;
  private dedicatedPool: Pool | null = null;
  private dedicatedClient: any = null;
  private isStarted = false;
  private isStopped = false;

  async start() {
    if (this.isStarted) return;
    this.isStarted = true;
    this.isStopped = false;

    this.dedicatedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
    });

    await this.tryAcquireLock();

    if (this.leaderCheckTimer) clearInterval(this.leaderCheckTimer);
    if (this.timer) clearInterval(this.timer);

    this.leaderCheckTimer = setInterval(() => {
      if (!this.isStopped) void this.checkAndMaintainLeadership();
    }, LOCK_CHECK_INTERVAL_MS);

    this.timer = setInterval(() => {
      if (this.isLeader && !this.isStopped) void this.checkAndManagePeriods();
    }, 60 * 1000);
  }

  private async checkAndMaintainLeadership() {
    if (this.isStopped) return;

    try {
      if (this.isLeader && this.dedicatedClient) {
        try {
          await this.dedicatedClient.query("SELECT 1");
          return;
        } catch {
          this.releaseLeadership();
        }
      }

      if (!this.isLeader && !this.isStopped) {
        await this.tryAcquireLock();
      }
    } catch (error) {
      console.error("Leadership check error:", error);
    }
  }

  private async tryAcquireLock() {
    if (!this.dedicatedPool) return;

    try {
      const client = await this.dedicatedPool.connect();
      const result = await client.query(
        "SELECT pg_try_advisory_lock($1) as acquired",
        [LEADER_LOCK_ID],
      );

      if (result.rows[0]?.acquired === true) {
        this.dedicatedClient = client;
        this.isLeader = true;
        console.log("👑 This instance is now the leader");
        await this.checkAndManagePeriods();
      } else {
        client.release();
        this.isLeader = false;
      }
    } catch (error) {
      console.error("Lock acquisition failed:", error);
      this.releaseLeadership();
    }
  }

  private releaseLeadership() {
    if (this.dedicatedClient) {
      try {
        this.dedicatedClient.release();
      } catch {}
      this.dedicatedClient = null;
    }
    this.isLeader = false;
  }

  async checkAndManagePeriods() {
    if (!this.isLeader) return;

    try {
      const currentPeriod = await storage.getCurrentLeaderboardPeriod();
      const now = new Date();

      if (currentPeriod && new Date(currentPeriod.endTime) <= now && !currentPeriod.winnerId) {
        await this.closePeriod(currentPeriod.id, currentPeriod.startTime, currentPeriod.endTime);
      }

      if (!currentPeriod || new Date(currentPeriod.endTime) <= now) {
        const startTime = now;
        const endTime = new Date(now.getTime() + PERIOD_DURATION_MS);
        await storage.createLeaderboardPeriod(startTime, endTime);
        console.log(`🎯 New period: ${startTime.toISOString()} - ${endTime.toISOString()}`);
      }
    } catch (error) {
      console.error("Period management error:", error);
    }
  }

  async closePeriod(periodId: string, startTime: Date, endTime: Date) {
    try {
      const leaders = await storage.getTopUsersByPeriodProfit(startTime, endTime, 1);

      if (leaders.length > 0) {
        const winner = leaders[0];
        await storage.updateLeaderboardPeriodWinner(periodId, winner.id, winner.periodProfit || 0);
        console.log(`🏅 Winner: ${winner.username}`);
      }
    } catch (error) {
      console.error("Period close error:", error);
    }
  }

  stop() {
    this.isStopped = true;
    this.isStarted = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.leaderCheckTimer) {
      clearInterval(this.leaderCheckTimer);
      this.leaderCheckTimer = null;
    }

    this.releaseLeadership();

    if (this.dedicatedPool) {
      void this.dedicatedPool.end();
      this.dedicatedPool = null;
    }

    console.log("🛑 Leaderboard service stopped");
  }
}

export const leaderboardService = new LeaderboardService();
