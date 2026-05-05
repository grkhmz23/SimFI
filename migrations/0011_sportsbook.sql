CREATE TABLE "sb_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"league" text NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"commence_time" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"completed_at" timestamp,
	"voided_reason" text,
	"raw_scores" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sb_events_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "sb_markets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"market_type" text DEFAULT 'h2h' NOT NULL,
	"bookmaker_key" text NOT NULL,
	"home_odds" numeric(10, 4) NOT NULL,
	"away_odds" numeric(10, 4) NOT NULL,
	"draw_odds" numeric(10, 4),
	"fetched_at" timestamp NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sb_bets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chain" text NOT NULL,
	"event_id" varchar NOT NULL,
	"market_id" varchar NOT NULL,
	"selection" text NOT NULL,
	"stake" numeric(38, 0) NOT NULL,
	"odds_at_placement" numeric(10, 4) NOT NULL,
	"potential_payout" numeric(38, 0) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"placed_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	"payout_amount" numeric(38, 0),
	"bookmaker_key" text NOT NULL,
	"notes" text,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "sb_league_activity" (
	"league" text PRIMARY KEY NOT NULL,
	"last_user_view_at" timestamp,
	"last_ingest_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sb_markets" ADD CONSTRAINT "sb_markets_event_id_sb_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sb_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sb_bets" ADD CONSTRAINT "sb_bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sb_bets" ADD CONSTRAINT "sb_bets_event_id_sb_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sb_events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sb_bets" ADD CONSTRAINT "sb_bets_market_id_sb_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."sb_markets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_sb_events_league_commence" ON "sb_events" USING btree ("league","commence_time");
--> statement-breakpoint
CREATE INDEX "idx_sb_events_status" ON "sb_events" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_sb_markets_event_market_latest" ON "sb_markets" USING btree ("event_id","market_type","is_latest");
--> statement-breakpoint
CREATE INDEX "idx_sb_markets_fetched_at" ON "sb_markets" USING btree ("fetched_at");
--> statement-breakpoint
CREATE INDEX "idx_sb_bets_user_status" ON "sb_bets" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "idx_sb_bets_event_status" ON "sb_bets" USING btree ("event_id","status");
--> statement-breakpoint
CREATE INDEX "idx_sb_bets_status" ON "sb_bets" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_sb_bets_user_idempotency" ON "sb_bets" USING btree ("user_id","idempotency_key") WHERE "sb_bets"."idempotency_key" IS NOT NULL;
