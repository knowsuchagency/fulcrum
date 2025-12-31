ALTER TABLE `apps` ADD `environment_variables` text;--> statement-breakpoint
ALTER TABLE `apps` ADD `no_cache_build` integer DEFAULT false;