ALTER TABLE "wanjiedaoyou_reputation_shop_items"
  ADD COLUMN "min_realm" varchar(20) DEFAULT '炼气' NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_reputation_shop_items"
  ADD COLUMN "max_realm" varchar(20);--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_items"
  ADD COLUMN "min_realm" varchar(20) DEFAULT '炼气' NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_items"
  ADD COLUMN "max_realm" varchar(20);--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_reputation_shop_items"
  ADD CONSTRAINT "reputation_shop_realm_range_valid" CHECK (
    "min_realm" IN ('炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫')
    AND ("max_realm" IS NULL OR "max_realm" IN ('炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'))
    AND (
      "max_realm" IS NULL
      OR array_position(ARRAY['炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'], "min_realm"::text)
         <= array_position(ARRAY['炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'], "max_realm"::text)
    )
  );--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_items"
  ADD CONSTRAINT "sect_shop_realm_range_valid" CHECK (
    "min_realm" IN ('炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫')
    AND ("max_realm" IS NULL OR "max_realm" IN ('炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'))
    AND (
      "max_realm" IS NULL
      OR array_position(ARRAY['炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'], "min_realm"::text)
         <= array_position(ARRAY['炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'], "max_realm"::text)
    )
  );
