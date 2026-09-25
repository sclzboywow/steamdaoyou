CREATE UNIQUE INDEX IF NOT EXISTS "account_steam_account_key"
ON "better_auth"."account" USING btree ("providerId", "accountId")
WHERE "providerId" = 'steam';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_steam_user_key"
ON "better_auth"."account" USING btree ("providerId", "userId")
WHERE "providerId" = 'steam';
