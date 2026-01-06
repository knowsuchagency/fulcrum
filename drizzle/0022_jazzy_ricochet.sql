CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`repository_id` text,
	`app_id` text,
	`terminal_tab_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_accessed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_app_id_unique` ON `projects` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_terminal_tab_id_unique` ON `projects` (`terminal_tab_id`);