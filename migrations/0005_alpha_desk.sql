-- Alpha Desk tables

CREATE TABLE IF NOT EXISTS "alpha_desk_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_date" date NOT NULL,
	"chain" varchar(16) NOT NULL,
	"status" varchar(32) NOT NULL DEFAULT 'pending',
	"sources_used" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"llm_provider" varchar(32),
	"llm_model" varchar(64),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "alpha_desk_runs_date_chain_uidx" ON "alpha_desk_runs" USING btree ("run_date","chain");

CREATE TABLE IF NOT EXISTS "alpha_desk_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"chain" varchar(16) NOT NULL,
	"token_address" varchar(64) NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"pair_address" varchar(64),
	"narrative_thesis" text NOT NULL,
	"why_now" text NOT NULL,
	"confidence_score" numeric(5, 2) NOT NULL,
	"risk_flags" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"price_at_publish_usd" numeric(38, 18),
	"price_at_publish_native" numeric(38, 18),
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "alpha_desk_ideas" ADD CONSTRAINT "alpha_desk_ideas_run_id_alpha_desk_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."alpha_desk_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "alpha_desk_idea_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"idea_id" integer NOT NULL,
	"horizon" varchar(16) NOT NULL,
	"price_usd" numeric(38, 18),
	"pct_change" numeric(10, 4),
	"measured_at" timestamp with time zone NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "alpha_desk_idea_outcomes" ADD CONSTRAINT "alpha_desk_idea_outcomes_idea_id_alpha_desk_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."alpha_desk_ideas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "alpha_desk_outcomes_idea_horizon_uidx" ON "alpha_desk_idea_outcomes" USING btree ("idea_id","horizon");
