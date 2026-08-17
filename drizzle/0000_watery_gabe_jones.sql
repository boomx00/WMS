CREATE TYPE "public"."location_stock_event_type" AS ENUM('PICKING', 'DEFAULT_PICKING', 'SHIP');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('RACK', 'FLOOR', 'DESTROY', 'LEFTOVER', 'OUTBOUND_WH');--> statement-breakpoint
CREATE TYPE "public"."pallet_event_type" AS ENUM('INBOUND', 'MOVED', 'SPLIT', 'CONFIRMED', 'OUTBOUND', 'DEFAULT_OUTBOUND', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."pallet_status" AS ENUM('ACTIVE', 'PENDING', 'OUTBOUND');--> statement-breakpoint
CREATE TABLE "app_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_code" integer NOT NULL,
	"version_name" text NOT NULL,
	"apk_url" text NOT NULL,
	"release_notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"legacy_sku" text,
	"carton_barcode" text,
	"name" text NOT NULL,
	"default_code" text NOT NULL,
	"carton_bag_qty" integer NOT NULL,
	"pallet_carton_qty" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_stock_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "location_stock_event_type" NOT NULL,
	"item_id" integer NOT NULL,
	"source_location_id" integer,
	"destination_location_id" integer,
	"sales_order_id" integer,
	"quantity" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "location_type" NOT NULL,
	"area" text,
	"x" integer,
	"y" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pallet_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"pallet_id" integer NOT NULL,
	"type" "pallet_event_type" NOT NULL,
	"location_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sales_order_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"item_id" integer NOT NULL,
	"work_order_number" text NOT NULL,
	"quantity" integer NOT NULL,
	"location_id" integer NOT NULL,
	"status" "pallet_status" DEFAULT 'ACTIVE' NOT NULL,
	"split_from_pallet_id" integer,
	"inbound_user_id" integer NOT NULL,
	"in_forklift_user_id" integer,
	"out_forklift_user_id" integer,
	"inbound_at" timestamp DEFAULT now() NOT NULL,
	"first_racked_at" timestamp,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_order_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"so_number" text NOT NULL,
	"order_date" timestamp NOT NULL,
	"assigned_checker_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"allow_default_code_transactions" boolean DEFAULT true NOT NULL,
	"automatic_inbound" boolean DEFAULT false NOT NULL,
	"automatic_inbound_from_rack" boolean DEFAULT false NOT NULL,
	"allow_untracked_outbound" boolean DEFAULT false NOT NULL,
	"allow_default_picking" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_opname" (
	"opname_number" varchar(50) PRIMARY KEY NOT NULL,
	"created_by" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "stock_opname_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"opname_number" varchar(50) NOT NULL,
	"location_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"pallet_id" integer,
	"system_qty" integer NOT NULL,
	"counted_qty" integer,
	"difference" integer
);
--> statement-breakpoint
ALTER TABLE "location_stock" ADD CONSTRAINT "location_stock_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock" ADD CONSTRAINT "location_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock_events" ADD CONSTRAINT "location_stock_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock_events" ADD CONSTRAINT "location_stock_events_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock_events" ADD CONSTRAINT "location_stock_events_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock_events" ADD CONSTRAINT "location_stock_events_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock_events" ADD CONSTRAINT "location_stock_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_pallet_id_pallets_id_fk" FOREIGN KEY ("pallet_id") REFERENCES "public"."pallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_inbound_user_id_users_id_fk" FOREIGN KEY ("inbound_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_in_forklift_user_id_users_id_fk" FOREIGN KEY ("in_forklift_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_out_forklift_user_id_users_id_fk" FOREIGN KEY ("out_forklift_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_assigned_checker_id_users_id_fk" FOREIGN KEY ("assigned_checker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_opname_number_stock_opname_opname_number_fk" FOREIGN KEY ("opname_number") REFERENCES "public"."stock_opname"("opname_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_sku_idx" ON "items" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "items_legacy_sku_idx" ON "items" USING btree ("legacy_sku");--> statement-breakpoint
CREATE UNIQUE INDEX "location_stock_location_item_idx" ON "location_stock" USING btree ("location_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code_idx" ON "locations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "pallets_label_location_idx" ON "pallets" USING btree ("label","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_idx" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_so_number_idx" ON "sales_orders" USING btree ("so_number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");