-- Phase 2: Achievement Badges
CREATE TABLE IF NOT EXISTS user_achievements (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id VARCHAR NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- Phase 4: Referral System
CREATE TABLE IF NOT EXISTS referrals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  reward_claimed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(referee_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

-- Phase 5: Social Follows
CREATE TABLE IF NOT EXISTS follows (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Phase 8: Daily Streaks
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_date DATE;
