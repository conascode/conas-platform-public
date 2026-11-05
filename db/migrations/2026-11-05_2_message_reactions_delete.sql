-- =====================================================================
-- 2026-11-05 (2) · 메시지 반응(❤️ 😥 등) · 메시지 삭제
--
-- 운영 DB(phpMyAdmin > conastt > SQL 탭)에 한 번만 실행하세요.
-- ⚠️ 이 SQL을 먼저 실행하고 나서 코드를 올려야 해요. (순서가 바뀌면 채팅이 오류를 냄)
-- 2026-11-05_add_employee_no.sql 을 먼저 실행한 뒤에 실행하세요.
--
--  - 메시지는 실제로 지우지 않아요. deleted_at 에 시각만 남기고 화면에는 "삭제된 메시지예요"로 보여요.
--  - changed_at: 반응이나 삭제가 바뀐 시각. 대화방을 보고 있는 다른 사람 화면을 갱신할 때 씀
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE `in_messages`
  ADD COLUMN `deleted_at` timestamp NULL DEFAULT NULL COMMENT '삭제한 시각 (실제로 지우지 않고 표시만)',
  ADD COLUMN `changed_at` timestamp NULL DEFAULT NULL COMMENT '반응 · 삭제가 바뀐 시각 (다른 사람 화면 갱신용)',
  ADD KEY `idx_changed` (`conversation_id`,`changed_at`);

-- 메시지 반응: 한 사람이 메시지 하나에 반응 하나 (카카오톡처럼, 다른 걸 고르면 바뀜)
CREATE TABLE IF NOT EXISTS `in_message_reactions` (
  `message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `reaction` varchar(10) NOT NULL COMMENT 'heart, like, check, laugh, wow, sad',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_mreact_msg` FOREIGN KEY (`message_id`) REFERENCES `in_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_mreact_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
