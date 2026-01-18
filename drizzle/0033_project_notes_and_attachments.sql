-- Add notes column to projects table
ALTER TABLE `projects` ADD `notes` text;--> statement-breakpoint
-- Create project_attachments table
CREATE TABLE `project_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
