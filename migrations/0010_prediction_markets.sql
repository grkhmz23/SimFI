CREATE TABLE "prediction_markets" (
	"condition_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"question" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"end_date" timestamp,
	"closed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"yes_token_id" text NOT NULL,
	"no_token_id" text NOT NULL,
	"winning_outcome" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_markets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prediction_paper_balances" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"balance_micro_usd" numeric(38, 0) NOT NULL,
	"realized_pnl_micro_usd" numeric(38, 0) DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"condition_id" text NOT NULL,
	"token_id" text NOT NULL,
	"outcome" text NOT NULL,
	"shares_micro" numeric(38, 0) NOT NULL,
	"avg_price" numeric(38, 18) NOT NULL,
	"cost_basis_micro_usd" numeric(38, 0) NOT NULL,
	"realized_pnl_micro_usd" numeric(38, 0) DEFAULT 0 NOT NULL,
	"resolution_state" text,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"condition_id" text NOT NULL,
	"token_id" text NOT NULL,
	"outcome" text NOT NULL,
	"side" text NOT NULL,
	"shares_micro" numeric(38, 0) NOT NULL,
	"avg_price" numeric(38, 18) NOT NULL,
	"slippage_bps" integer DEFAULT 0 NOT NULL,
	"fee_micro_usd" numeric(38, 0) DEFAULT 0 NOT NULL,
	"total_micro_usd" numeric(38, 0) NOT NULL,
	"book_snapshot" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prediction_paper_balances" ADD CONSTRAINT "prediction_paper_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD CONSTRAINT "prediction_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD CONSTRAINT "prediction_positions_condition_id_prediction_markets_condition_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."prediction_markets"("condition_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prediction_trades" ADD CONSTRAINT "prediction_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_prediction_markets_active_closed" ON "prediction_markets" USING btree ("active","closed");
--> statement-breakpoint
CREATE INDEX "idx_prediction_markets_end_date" ON "prediction_markets" USING btree ("end_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_prediction_markets_yes_token" ON "prediction_markets" USING btree ("yes_token_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_prediction_markets_no_token" ON "prediction_markets" USING btree ("no_token_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_prediction_pos_user_token" ON "prediction_positions" USING btree ("user_id","token_id");
--> statement-breakpoint
CREATE INDEX "idx_prediction_pos_user" ON "prediction_positions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_prediction_pos_condition" ON "prediction_positions" USING btree ("condition_id");
--> statement-breakpoint
CREATE INDEX "idx_prediction_trades_user_created" ON "prediction_trades" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_prediction_trades_condition" ON "prediction_trades" USING btree ("condition_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_prediction_trades_user_idempotency" ON "prediction_trades" USING btree ("user_id","idempotency_key") WHERE "prediction_trades"."idempotency_key" IS NOT NULL;
