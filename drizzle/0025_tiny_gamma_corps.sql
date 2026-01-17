CREATE TABLE `task_links` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`url` text NOT NULL,
	`label` text,
	`type` text,
	`created_at` text NOT NULL
);
