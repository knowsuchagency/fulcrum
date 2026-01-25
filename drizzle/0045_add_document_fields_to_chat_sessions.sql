ALTER TABLE `chat_sessions` ADD `document_path` text;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `document_starred` integer DEFAULT false;
