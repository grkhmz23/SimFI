-- Alpha Desk redesign: support dual idea types (meme_launch + dev_build)

ALTER TABLE "alpha_desk_ideas" 
ADD COLUMN IF NOT EXISTS "idea_type" varchar(32) NOT NULL DEFAULT 'meme_launch';

ALTER TABLE "alpha_desk_ideas" 
ADD COLUMN IF NOT EXISTS "title" varchar(256);

-- Backfill existing rows with a title from symbol/name
UPDATE "alpha_desk_ideas" SET "title" = COALESCE("symbol", 'Untitled') || ' — ' || COALESCE("name", 'Unknown') WHERE "title" IS NULL;

ALTER TABLE "alpha_desk_ideas" 
ALTER COLUMN "title" SET NOT NULL;

-- Make token fields nullable (launch ideas don't have deployed tokens yet)
ALTER TABLE "alpha_desk_ideas" 
ALTER COLUMN "token_address" DROP NOT NULL;

ALTER TABLE "alpha_desk_ideas" 
ALTER COLUMN "symbol" DROP NOT NULL;

ALTER TABLE "alpha_desk_ideas" 
ALTER COLUMN "name" DROP NOT NULL;

-- Add index for fast filtering by idea type
CREATE INDEX IF NOT EXISTS "alpha_desk_ideas_type_idx" ON "alpha_desk_ideas" USING btree ("idea_type");
