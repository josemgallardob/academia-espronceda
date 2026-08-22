CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`first_surname` text NOT NULL,
	`second_surname` text,
	`course_code` text NOT NULL,
	`weekly_hours_total` integer NOT NULL,
	`school_name` text,
	`primary_phone` text NOT NULL,
	`secondary_phone` text,
	`is_tutored` integer DEFAULT false NOT NULL,
	`tutor_full_name` text,
	`comments` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "people_first_name_not_blank" CHECK(length(trim("people"."first_name")) > 0),
	CONSTRAINT "people_first_surname_not_blank" CHECK(length(trim("people"."first_surname")) > 0),
	CONSTRAINT "people_weekly_hours_positive" CHECK("people"."weekly_hours_total" > 0),
	CONSTRAINT "people_primary_phone_not_blank" CHECK(length(trim("people"."primary_phone")) > 0),
	CONSTRAINT "people_course_code_allowed" CHECK("people"."course_code" in ('ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2', 'OTHER')),
	CONSTRAINT "people_status_allowed" CHECK("people"."status" in ('ACTIVE', 'WAITING_LIST')),
	CONSTRAINT "people_tutor_coherence" CHECK(("people"."is_tutored" = 0) or ("people"."tutor_full_name" is not null and length(trim("people"."tutor_full_name")) > 0))
);
--> statement-breakpoint
CREATE INDEX `people_status_idx` ON `people` (`status`);--> statement-breakpoint
CREATE INDEX `people_name_idx` ON `people` (`first_surname`,`first_name`);--> statement-breakpoint
CREATE TABLE `person_relationships` (
	`first_person_id` text NOT NULL,
	`second_person_id` text NOT NULL,
	PRIMARY KEY(`first_person_id`, `second_person_id`),
	FOREIGN KEY (`first_person_id`) REFERENCES `people`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`second_person_id`) REFERENCES `people`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "person_relationships_canonical_order" CHECK("person_relationships"."first_person_id" < "person_relationships"."second_person_id")
);
--> statement-breakpoint
CREATE TABLE `person_subjects` (
	`person_id` text NOT NULL,
	`subject_code` text NOT NULL,
	`weekly_hours` integer NOT NULL,
	PRIMARY KEY(`person_id`, `subject_code`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "person_subjects_hours_positive" CHECK("person_subjects"."weekly_hours" > 0),
	CONSTRAINT "person_subjects_subject_allowed" CHECK("person_subjects"."subject_code" in ('MATHEMATICS', 'SOCIAL_SCIENCES_MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'SPANISH_LANGUAGE', 'ENGLISH'))
);
--> statement-breakpoint
CREATE TABLE `person_unavailable_slots` (
	`person_id` text NOT NULL,
	`slot_id` text NOT NULL,
	PRIMARY KEY(`person_id`, `slot_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `schedule_accepted_findings` (
	`schedule_id` text NOT NULL,
	`validation_id` text NOT NULL,
	`finding_fingerprint` text NOT NULL,
	`accepted_by_user_id` text NOT NULL,
	`accepted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`schedule_id`, `finding_fingerprint`),
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`validation_id`,`finding_fingerprint`) REFERENCES `schedule_validation_findings`(`validation_id`,`fingerprint`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`schedule_id`,`validation_id`) REFERENCES `schedule_validations`(`schedule_id`,`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `schedule_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`person_id` text NOT NULL,
	`student_display_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`schedule_id`,`slot_id`,`class_id`) REFERENCES `schedule_classes`(`schedule_id`,`slot_id`,`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "schedule_assignments_display_name_not_blank" CHECK(length(trim("schedule_assignments"."student_display_name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_assignments_class_person_uq` ON `schedule_assignments` (`class_id`,`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_assignments_person_slot_uq` ON `schedule_assignments` (`schedule_id`,`person_id`,`slot_id`);--> statement-breakpoint
CREATE INDEX `schedule_assignments_person_idx` ON `schedule_assignments` (`person_id`);--> statement-breakpoint
CREATE TABLE `schedule_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`schedule_id`,`teacher_id`) REFERENCES `schedule_teachers`(`schedule_id`,`teacher_id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`schedule_id`,`slot_id`) REFERENCES `schedule_slots`(`schedule_id`,`slot_id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_classes_teacher_slot_uq` ON `schedule_classes` (`schedule_id`,`teacher_id`,`slot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_classes_schedule_slot_id_uq` ON `schedule_classes` (`schedule_id`,`slot_id`,`id`);--> statement-breakpoint
CREATE INDEX `schedule_classes_schedule_idx` ON `schedule_classes` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `schedule_confirmations` (
	`schedule_id` text PRIMARY KEY NOT NULL,
	`validation_id` text NOT NULL,
	`confirmed_by_user_id` text NOT NULL,
	`confirmed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`validation_id`) REFERENCES `schedule_validations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`schedule_id`,`validation_id`) REFERENCES `schedule_validations`(`schedule_id`,`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_confirmations_validation_id_unique` ON `schedule_confirmations` (`validation_id`);--> statement-breakpoint
CREATE INDEX `schedule_confirmations_user_idx` ON `schedule_confirmations` (`confirmed_by_user_id`);--> statement-breakpoint
CREATE TABLE `schedule_slots` (
	`schedule_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`day_of_week` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	PRIMARY KEY(`schedule_id`, `slot_id`),
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "schedule_slots_ordered" CHECK("schedule_slots"."start_time" < "schedule_slots"."end_time"),
	CONSTRAINT "schedule_slots_day_allowed" CHECK("schedule_slots"."day_of_week" in ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'))
);
--> statement-breakpoint
CREATE TABLE `schedule_teachers` (
	`schedule_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`display_name` text NOT NULL,
	`profile` text NOT NULL,
	PRIMARY KEY(`schedule_id`, `teacher_id`),
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "schedule_teachers_display_name_not_blank" CHECK(length(trim("schedule_teachers"."display_name")) > 0),
	CONSTRAINT "schedule_teachers_profile_allowed" CHECK("schedule_teachers"."profile" in ('SENIOR_SCIENCES', 'GENERAL_SCIENCES', 'LANGUAGES'))
);
--> statement-breakpoint
CREATE TABLE `schedule_validation_findings` (
	`validation_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`rule_id` text NOT NULL,
	`enforcement` text NOT NULL,
	`severity` text NOT NULL,
	`blocks_confirmation` integer NOT NULL,
	`entity_refs_json` text DEFAULT '[]' NOT NULL,
	`slot_ids_json` text DEFAULT '[]' NOT NULL,
	`parameters_json` text DEFAULT '{}' NOT NULL,
	`message` text NOT NULL,
	PRIMARY KEY(`validation_id`, `fingerprint`),
	FOREIGN KEY (`validation_id`) REFERENCES `schedule_validations`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "schedule_validation_findings_message_not_blank" CHECK(length(trim("schedule_validation_findings"."message")) > 0),
	CONSTRAINT "schedule_validation_findings_enforcement_allowed" CHECK("schedule_validation_findings"."enforcement" in ('HARD', 'RELAXABLE', 'PREFERENCE')),
	CONSTRAINT "schedule_validation_findings_severity_allowed" CHECK("schedule_validation_findings"."severity" in ('ERROR', 'WARNING', 'INFO')),
	CONSTRAINT "schedule_validation_findings_fingerprint_format" CHECK(length("schedule_validation_findings"."fingerprint") = 71 and substr("schedule_validation_findings"."fingerprint", 1, 7) = 'sha256:' and substr("schedule_validation_findings"."fingerprint", 8) not glob '*[^0-9a-f]*'),
	CONSTRAINT "schedule_validation_findings_entity_refs_json" CHECK(json_valid("schedule_validation_findings"."entity_refs_json")),
	CONSTRAINT "schedule_validation_findings_slot_ids_json" CHECK(json_valid("schedule_validation_findings"."slot_ids_json")),
	CONSTRAINT "schedule_validation_findings_parameters_json" CHECK(json_valid("schedule_validation_findings"."parameters_json"))
);
--> statement-breakpoint
CREATE INDEX `schedule_validation_findings_rule_idx` ON `schedule_validation_findings` (`rule_id`);--> statement-breakpoint
CREATE TABLE `schedule_validations` (
	`id` text PRIMARY KEY NOT NULL,
	`validation_fingerprint` text NOT NULL,
	`schedule_id` text NOT NULL,
	`schedule_revision` integer NOT NULL,
	`rule_catalog_version` text NOT NULL,
	`outcome` text NOT NULL,
	`can_confirm` integer NOT NULL,
	`blocking_errors` integer DEFAULT 0 NOT NULL,
	`relaxable_errors` integer DEFAULT 0 NOT NULL,
	`warnings` integer DEFAULT 0 NOT NULL,
	`information` integer DEFAULT 0 NOT NULL,
	`evaluated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "schedule_validations_revision_non_negative" CHECK("schedule_validations"."schedule_revision" >= 0),
	CONSTRAINT "schedule_validations_counts_non_negative" CHECK("schedule_validations"."blocking_errors" >= 0 and "schedule_validations"."relaxable_errors" >= 0 and "schedule_validations"."warnings" >= 0 and "schedule_validations"."information" >= 0),
	CONSTRAINT "schedule_validations_outcome_allowed" CHECK("schedule_validations"."outcome" in ('IDEAL', 'VALID_WITH_RECOMMENDATIONS', 'HAS_RELAXABLE_CONFLICTS', 'BLOCKED')),
	CONSTRAINT "schedule_validations_fingerprint_format" CHECK(length("schedule_validations"."validation_fingerprint") = 71 and substr("schedule_validations"."validation_fingerprint", 1, 7) = 'sha256:' and substr("schedule_validations"."validation_fingerprint", 8) not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_validations_fingerprint_uq` ON `schedule_validations` (`schedule_id`,`schedule_revision`,`validation_fingerprint`);--> statement-breakpoint
CREATE INDEX `schedule_validations_schedule_idx` ON `schedule_validations` (`schedule_id`,`evaluated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_validations_schedule_id_uq` ON `schedule_validations` (`schedule_id`,`id`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'DRAFT' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`source_schedule_id` text,
	`rule_catalog_version` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`source_schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "schedules_revision_non_negative" CHECK("schedules"."revision" >= 0),
	CONSTRAINT "schedules_state_allowed" CHECK("schedules"."state" in ('DRAFT', 'CONFIRMED')),
	CONSTRAINT "schedules_current_is_confirmed" CHECK("schedules"."is_current" = 0 or "schedules"."state" = 'CONFIRMED'),
	CONSTRAINT "schedules_rule_catalog_version_format" CHECK("schedules"."rule_catalog_version" glob '[0-9]*.[0-9]*.[0-9]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedules_single_current_uq` ON `schedules` (`is_current`) WHERE "schedules"."is_current" = 1;--> statement-breakpoint
CREATE INDEX `schedules_state_created_idx` ON `schedules` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `subject_teacher_allocations` (
	`schedule_id` text NOT NULL,
	`person_id` text NOT NULL,
	`subject_code` text NOT NULL,
	`teacher_id` text NOT NULL,
	`weekly_hours` integer NOT NULL,
	PRIMARY KEY(`schedule_id`, `person_id`, `subject_code`),
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`schedule_id`,`teacher_id`) REFERENCES `schedule_teachers`(`schedule_id`,`teacher_id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "subject_teacher_allocations_hours_positive" CHECK("subject_teacher_allocations"."weekly_hours" > 0),
	CONSTRAINT "subject_teacher_allocations_subject_allowed" CHECK("subject_teacher_allocations"."subject_code" in ('MATHEMATICS', 'SOCIAL_SCIENCES_MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'SPANISH_LANGUAGE', 'ENGLISH'))
);
--> statement-breakpoint
CREATE INDEX `subject_teacher_allocations_teacher_idx` ON `subject_teacher_allocations` (`schedule_id`,`teacher_id`);--> statement-breakpoint
CREATE TABLE `teacher_available_slots` (
	`teacher_id` text NOT NULL,
	`slot_id` text NOT NULL,
	PRIMARY KEY(`teacher_id`, `slot_id`),
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `teacher_courses` (
	`teacher_id` text NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`teacher_id`, `course_code`),
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "teacher_courses_course_allowed" CHECK("teacher_courses"."course_code" in ('ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE `teacher_subjects` (
	`teacher_id` text NOT NULL,
	`subject_code` text NOT NULL,
	PRIMARY KEY(`teacher_id`, `subject_code`),
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "teacher_subjects_subject_allowed" CHECK("teacher_subjects"."subject_code" in ('MATHEMATICS', 'SOCIAL_SCIENCES_MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'SPANISH_LANGUAGE', 'ENGLISH'))
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`profile` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "teachers_display_name_not_blank" CHECK(length(trim("teachers"."display_name")) > 0),
	CONSTRAINT "teachers_profile_allowed" CHECK("teachers"."profile" in ('SENIOR_SCIENCES', 'GENERAL_SCIENCES', 'LANGUAGES'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_token_version_non_negative" CHECK("users"."token_version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_ci_uq` ON `users` (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_ci_uq` ON `users` (lower("email"));--> statement-breakpoint
CREATE TABLE `weekly_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`day_of_week` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "weekly_slots_start_format" CHECK("weekly_slots"."start_time" glob '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "weekly_slots_end_format" CHECK("weekly_slots"."end_time" glob '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "weekly_slots_ordered" CHECK("weekly_slots"."start_time" < "weekly_slots"."end_time"),
	CONSTRAINT "weekly_slots_day_allowed" CHECK("weekly_slots"."day_of_week" in ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_slots_period_uq` ON `weekly_slots` (`day_of_week`,`start_time`,`end_time`);