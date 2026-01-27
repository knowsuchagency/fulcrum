CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text,
	`in_reply_to` text,
	`references` text,
	`direction` text NOT NULL,
	`from_address` text NOT NULL,
	`from_name` text,
	`to_addresses` text,
	`cc_addresses` text,
	`subject` text,
	`text_content` text,
	`html_content` text,
	`snippet` text,
	`email_date` text,
	`folder` text DEFAULT 'inbox',
	`is_read` integer DEFAULT false,
	`is_starred` integer DEFAULT false,
	`labels` text,
	`imap_uid` integer,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `emails_connection_id_idx` ON `emails` (`connection_id`);--> statement-breakpoint
CREATE INDEX `emails_thread_id_idx` ON `emails` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `emails_message_id_idx` ON `emails` (`message_id`);
