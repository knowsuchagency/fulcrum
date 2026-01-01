CREATE TABLE `tunnels` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`tunnel_id` text NOT NULL,
	`tunnel_name` text NOT NULL,
	`tunnel_token` text NOT NULL,
	`status` text DEFAULT 'inactive' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tunnels_app_id_unique` ON `tunnels` (`app_id`);--> statement-breakpoint
ALTER TABLE `app_services` ADD `exposure_method` text DEFAULT 'dns';