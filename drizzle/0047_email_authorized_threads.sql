CREATE TABLE `email_authorized_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`authorized_by` text NOT NULL,
	`subject` text,
	`created_at` text NOT NULL
);
