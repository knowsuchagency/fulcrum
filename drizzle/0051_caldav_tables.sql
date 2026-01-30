CREATE TABLE `caldav_calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`remote_url` text NOT NULL,
	`display_name` text,
	`color` text,
	`ctag` text,
	`sync_token` text,
	`timezone` text,
	`enabled` integer DEFAULT true,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `caldav_calendars_remote_url_unique` ON `caldav_calendars` (`remote_url`);--> statement-breakpoint
CREATE TABLE `caldav_events` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`remote_url` text NOT NULL,
	`uid` text,
	`etag` text,
	`summary` text,
	`description` text,
	`location` text,
	`dtstart` text,
	`dtend` text,
	`duration` text,
	`all_day` integer DEFAULT false,
	`recurrence_rule` text,
	`status` text,
	`organizer` text,
	`attendees` text,
	`raw_ical` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `caldav_events_remote_url_unique` ON `caldav_events` (`remote_url`);
