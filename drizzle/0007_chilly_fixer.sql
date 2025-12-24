ALTER TABLE `terminal_view_state` ADD `current_view` text;--> statement-breakpoint
ALTER TABLE `terminal_view_state` ADD `current_task_id` text;--> statement-breakpoint
ALTER TABLE `terminal_view_state` ADD `is_tab_visible` integer;--> statement-breakpoint
ALTER TABLE `terminal_view_state` ADD `view_updated_at` text;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `last_review_notified_at`;