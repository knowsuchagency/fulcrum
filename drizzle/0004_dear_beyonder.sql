CREATE TABLE `system_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`cpu_percent` real NOT NULL,
	`memory_used_bytes` integer NOT NULL,
	`memory_total_bytes` integer NOT NULL,
	`disk_used_bytes` integer NOT NULL,
	`disk_total_bytes` integer NOT NULL
);
