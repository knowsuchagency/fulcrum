CREATE TABLE `app_services` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`service_name` text NOT NULL,
	`container_port` integer,
	`exposed` integer DEFAULT false,
	`domain` text,
	`status` text DEFAULT 'stopped',
	`container_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repository_id` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`compose_file` text NOT NULL,
	`status` text DEFAULT 'stopped' NOT NULL,
	`auto_deploy_enabled` integer DEFAULT false,
	`last_deployed_at` text,
	`last_deploy_commit` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`status` text NOT NULL,
	`git_commit` text,
	`git_message` text,
	`deployed_by` text,
	`build_logs` text,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL
);
