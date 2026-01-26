CREATE TABLE `messaging_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_type` text NOT NULL,
	`enabled` integer DEFAULT false,
	`auth_state` text,
	`display_name` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `messaging_session_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`channel_user_id` text NOT NULL,
	`channel_user_name` text,
	`session_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_message_at` text NOT NULL
);
