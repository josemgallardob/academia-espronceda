INSERT OR IGNORE INTO `teacher_available_slots` (`teacher_id`, `slot_id`)
SELECT `teachers`.`id`, `weekly_slots`.`id`
FROM `teachers`
INNER JOIN `weekly_slots` ON `weekly_slots`.`id` IN (
  'slot-monday-2000',
  'slot-wednesday-2000'
)
WHERE `teachers`.`profile` = 'GENERAL_SCIENCES';
