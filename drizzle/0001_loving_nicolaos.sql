CREATE TABLE `family_access` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`patient_id` text NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_access_patient_email` ON `family_access` (`clinic`,`patient_id`,`email`);--> statement-breakpoint
CREATE INDEX `family_access_email` ON `family_access` (`email`);