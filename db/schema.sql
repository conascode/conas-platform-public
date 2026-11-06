-- =====================================================================
-- CONAS 사내 2.0 — DB 스키마
--
-- 운영 DB(MySQL 8.0)의 실제 구조(SHOW CREATE TABLE)와 똑같이 맞춘 파일이에요.
--   - MySQL 8.0 이상, MariaDB 10.5 이상에서 동작해요.
--   - 새 서버나 내 컴퓨터(Laragon, Termux 등)에 처음 설치할 때 그대로 실행하면 돼요.
--   - 모든 테이블은 IF NOT EXISTS 라서 이미 있는 테이블은 건드리지 않아요.
--   - 외래 키가 있어요. 회원(users)이 지워지면
--       · 그 사람만의 기록(사내 회원 정보, 알림, 근태, 급여, 좋아요 등)은 같이 지워지고
--       · 다른 사람과 함께 보는 기록(게시글, 댓글, 메시지, 공지 등)은 남고 작성자만 비워져요.
--   - users 테이블은 conas.kr 메인 사이트와 같이 써요. 운영 서버에는 이미 있어요.
--
-- 실행 예)  mysql -u root -p conas_dev < db/schema.sql
-- 구조를 바꾸면 이 파일도 같이 고치고, 운영 DB에 실행할 변경 SQL은 db/migrations/ 에 날짜순으로 넣어 주세요.
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+09:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 회원 계정 (conas.kr 메인 사이트와 같이 쓰는 테이블)
--   role 은 메인 사이트용이에요. 사내 권한은 in_members 의 is_admin / role 을 봐요.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL COMMENT 'bcrypt',
  `email` varchar(100) NOT NULL,
  `role` enum('admin','user') DEFAULT 'user',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 기본 · 사람 · 조직
-- =====================================================================

-- 팀
CREATE TABLE IF NOT EXISTS `in_teams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 사내 회원 정보 (users 1명당 1줄)
--   status : pending = 승인 대기, active = 사용 중, disabled = 이용 중지
--   role   : ceo = 대표, lead = 팀장, member = 팀원
--   is_admin 은 직책과 별개 (가입 승인, 게시판 설정, 공지 작성)
CREATE TABLE IF NOT EXISTS `in_members` (
  `user_id` int NOT NULL,
  `display_name` varchar(50) DEFAULT NULL,
  `employee_no` varchar(20) DEFAULT NULL COMMENT '사원번호 (관리자가 입력, 겹치면 안 됨)',
  `avatar` varchar(64) DEFAULT NULL COMMENT '예: 12_0123456789ab.jpg (UPLOAD_DIR/avatars 안의 파일 이름)',
  `phone` varchar(20) DEFAULT NULL,
  `team_id` int DEFAULT NULL,
  `role` enum('ceo','lead','member') NOT NULL DEFAULT 'member',
  `position` varchar(20) DEFAULT NULL COMMENT '사원, 주임, 대리, 과장 ...',
  `joined_on` date DEFAULT NULL COMMENT '입사일',
  `annual_leave` decimal(4,1) DEFAULT NULL COMMENT '올해 연차 일수 (NULL = 미설정)',
  `status` enum('pending','active','disabled') NOT NULL DEFAULT 'pending',
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  `last_seen_at` timestamp NULL DEFAULT NULL COMMENT '3분 안이면 접속 중으로 표시',
  `chat_active_at` timestamp NULL DEFAULT NULL COMMENT '채팅 화면을 보고 있으면 푸시를 보내지 않음',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uniq_employee_no` (`employee_no`),
  KEY `idx_status` (`status`),
  KEY `idx_team` (`team_id`),
  CONSTRAINT `fk_in_members_team` FOREIGN KEY (`team_id`) REFERENCES `in_teams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 앱 설정 (k = 'work_start' '09:00' / 'work_end' '18:00' / 'vapid' 푸시 키 JSON)
CREATE TABLE IF NOT EXISTS `in_settings` (
  `k` varchar(50) NOT NULL,
  `v` text NOT NULL,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로그인 유지 토큰 (쿠키: selector:validator, DB에는 validator의 sha256만 저장)
CREATE TABLE IF NOT EXISTS `in_remember_tokens` (
  `selector` char(24) NOT NULL,
  `user_id` int NOT NULL,
  `validator_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`selector`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_remember_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로그인 실패 기록 (10분 동안 IP 10회 / 아이디 5회 실패 시 잠시 막음, 하루 지나면 삭제)
CREATE TABLE IF NOT EXISTS `in_login_attempts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `login` varchar(100) NOT NULL,
  `attempted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip` (`ip`,`attempted_at`),
  KEY `idx_login` (`login`,`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 알림 (link: 앱 안 경로, 예: '/ws/task')
CREATE TABLE IF NOT EXISTS `in_notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `kind` varchar(20) NOT NULL COMMENT 'task, approval, notice, pay ...',
  `title` varchar(200) NOT NULL,
  `body` varchar(255) DEFAULT NULL,
  `link` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`,`id`),
  CONSTRAINT `fk_in_noti_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 웹 푸시 구독 (기기마다 1줄)
CREATE TABLE IF NOT EXISTS `in_push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `endpoint` text NOT NULL,
  `endpoint_hash` char(64) NOT NULL COMMENT 'sha256(endpoint)',
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_endpoint` (`endpoint_hash`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_push_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 게시판
-- =====================================================================
CREATE TABLE IF NOT EXISTS `in_boards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(30) NOT NULL,
  `name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_anonymous` tinyint(1) NOT NULL DEFAULT 0,
  `write_role` enum('admin','user') NOT NULL DEFAULT 'user',
  `allow_comments` tinyint(1) NOT NULL DEFAULT 1,
  `allow_attachments` tinyint(1) NOT NULL DEFAULT 1,
  `max_files` int NOT NULL DEFAULT 5,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_visible` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 게시판에 글이 있으면 게시판은 지울 수 없어요 (fk_in_posts_board)
CREATE TABLE IF NOT EXISTS `in_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `board_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `is_anonymous` tinyint(1) NOT NULL DEFAULT 0,
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `view_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_board_list` (`board_id`,`deleted_at`,`id`),
  KEY `idx_board_pinned` (`board_id`,`is_pinned`),
  KEY `fk_in_posts_user` (`user_id`),
  CONSTRAINT `fk_in_posts_board` FOREIGN KEY (`board_id`) REFERENCES `in_boards` (`id`),
  CONSTRAINT `fk_in_posts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 댓글 (parent_id: 답글이면 원 댓글 id)
CREATE TABLE IF NOT EXISTS `in_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_post` (`post_id`,`id`),
  KEY `fk_in_comments_user` (`user_id`),
  KEY `idx_parent` (`parent_id`),
  CONSTRAINT `fk_in_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `in_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_comments_post` FOREIGN KEY (`post_id`) REFERENCES `in_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `in_post_likes` (
  `post_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_like_post` FOREIGN KEY (`post_id`) REFERENCES `in_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_like_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `in_comment_likes` (
  `comment_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_clike_comment` FOREIGN KEY (`comment_id`) REFERENCES `in_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_clike_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 채널 · DM · 그룹 대화
-- =====================================================================
--   type    : dm = 1:1, group = 그룹 대화, channel = 공개 채널
--   dm_key  : 1:1 방만 '작은id:큰id' (같은 두 사람의 방이 두 개 생기지 않게)
CREATE TABLE IF NOT EXISTS `in_conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('dm','group','channel') NOT NULL DEFAULT 'dm',
  `name` varchar(100) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `dm_key` varchar(30) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `last_message_id` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_dm` (`dm_key`),
  KEY `idx_updated` (`updated_at`),
  KEY `fk_in_conv_creator` (`created_by`),
  CONSTRAINT `fk_in_conv_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 대화방 참여자 (joined_at 이전 메시지는 DM/그룹에서 보이지 않음)
CREATE TABLE IF NOT EXISTS `in_conversation_members` (
  `conversation_id` int NOT NULL,
  `user_id` int NOT NULL,
  `last_read_message_id` bigint NOT NULL DEFAULT 0,
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_cm_conv` FOREIGN KEY (`conversation_id`) REFERENCES `in_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_cm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 메시지 (client_msg_id: 화면이 만든 임시 id, 재전송 중복 방지. 'sys:'로 시작하면 안내 메시지)
--   삭제해도 실제로 지우지 않고 deleted_at 만 남김 (화면에는 '삭제된 메시지예요')
CREATE TABLE IF NOT EXISTS `in_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `body` text NOT NULL,
  `client_msg_id` varchar(40) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '삭제한 시각 (실제로 지우지 않고 표시만)',
  `changed_at` timestamp NULL DEFAULT NULL COMMENT '반응 · 삭제가 바뀐 시각 (다른 사람 화면 갱신용)',
  PRIMARY KEY (`id`),
  KEY `idx_conv` (`conversation_id`,`id`),
  KEY `fk_in_msg_user` (`user_id`),
  KEY `idx_changed` (`conversation_id`,`changed_at`),
  CONSTRAINT `fk_in_msg_conv` FOREIGN KEY (`conversation_id`) REFERENCES `in_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_msg_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 메시지 반응: 한 사람이 메시지 하나에 반응 하나 (카카오톡처럼, 다른 걸 고르면 바뀜)
--   reaction: heart ❤️, like 👍, check ✅, laugh 😆, wow 😮, sad 😥
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

-- =====================================================================
-- 업무 · 프로젝트 · 일정
-- =====================================================================
--   stages         : JSON 배열 [{"id":"s1a2b3c4","name":"기획"}, ...] (최대 50개)
--   current_stage  : stages 안의 id
--   allow_edit_done: 완료한 업무 수정 0 = 불가, 1 = 담당자만, 2 = 누구나
CREATE TABLE IF NOT EXISTS `in_projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `team_id` int DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `short_name` varchar(20) DEFAULT NULL,
  `stages` json DEFAULT NULL,
  `current_stage` varchar(16) DEFAULT NULL,
  `require_review` tinyint(1) NOT NULL DEFAULT 1,
  `allow_edit_done` tinyint(1) NOT NULL DEFAULT 0,
  `due_date` date DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `archived_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_team` (`team_id`),
  KEY `fk_in_projects_user` (`created_by`),
  CONSTRAINT `fk_in_projects_team` FOREIGN KEY (`team_id`) REFERENCES `in_teams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_projects_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `in_project_members` (
  `project_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_pmem_project` FOREIGN KEY (`project_id`) REFERENCES `in_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_pmem_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 업무
--   status: todo = 진행 중, review = 검토 요청, done = 완료
--   reviewer_id 가 있으면 완료할 때 검토를 거침 (프로젝트 require_review = 0 이면 생략)
--   프로젝트를 지우면 그 프로젝트의 업무도 같이 지워져요
CREATE TABLE IF NOT EXISTS `in_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int DEFAULT NULL,
  `stage_id` varchar(16) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `assignee_id` int NOT NULL COMMENT '담당자',
  `assigner_id` int DEFAULT NULL COMMENT '배정한 사람',
  `reviewer_id` int DEFAULT NULL COMMENT '검토할 사람',
  `due_date` date NOT NULL,
  `status` enum('todo','review','done') NOT NULL DEFAULT 'todo',
  `submit_note` text DEFAULT NULL,
  `reject_note` text DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `done_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_assignee` (`assignee_id`,`status`,`due_date`),
  KEY `idx_reviewer` (`reviewer_id`,`status`),
  KEY `idx_project` (`project_id`),
  KEY `fk_in_tasks_assigner` (`assigner_id`),
  CONSTRAINT `fk_in_tasks_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_tasks_assigner` FOREIGN KEY (`assigner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_tasks_project` FOREIGN KEY (`project_id`) REFERENCES `in_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_tasks_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 회사 마감 (전사 공통 마감일)
CREATE TABLE IF NOT EXISTS `in_deadlines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `due_date` date NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_due` (`due_date`),
  KEY `fk_in_deadlines_user` (`created_by`),
  CONSTRAINT `fk_in_deadlines_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 일정 (team_id NULL = 전사 일정 / color: primary, ok, warn, danger, leave)
--   팀을 지우면 그 팀 일정도 같이 지워져요
CREATE TABLE IF NOT EXISTS `in_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `place` varchar(100) DEFAULT NULL,
  `starts_at` datetime NOT NULL,
  `color` varchar(10) NOT NULL DEFAULT 'primary',
  `team_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_starts` (`starts_at`),
  KEY `fk_in_events_team` (`team_id`),
  KEY `fk_in_events_user` (`created_by`),
  CONSTRAINT `fk_in_events_team` FOREIGN KEY (`team_id`) REFERENCES `in_teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_events_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 공지
-- =====================================================================
--   category: 일반, 인사, 총무, 행사 / must_confirm = 필독(확인 필요)
CREATE TABLE IF NOT EXISTS `in_notices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category` varchar(10) NOT NULL DEFAULT '일반',
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `must_confirm` tinyint(1) NOT NULL DEFAULT 0,
  `user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_list` (`deleted_at`,`id`),
  KEY `fk_in_notices_user` (`user_id`),
  CONSTRAINT `fk_in_notices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공지 읽음 · 확인
CREATE TABLE IF NOT EXISTS `in_notice_reads` (
  `notice_id` int NOT NULL,
  `user_id` int NOT NULL,
  `read_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`notice_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_in_nread_notice` FOREIGN KEY (`notice_id`) REFERENCES `in_notices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_nread_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 근태
-- =====================================================================
--   kind: work = 출근, leave = 연차, half_am / half_pm = 반차, absent = 결근
--   연차 · 반차 결재가 최종 승인되면 자동으로 기록됨
CREATE TABLE IF NOT EXISTS `in_attendance` (
  `user_id` int NOT NULL,
  `work_date` date NOT NULL,
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `kind` enum('work','leave','half_am','half_pm','absent') NOT NULL DEFAULT 'work',
  `note` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`user_id`,`work_date`),
  KEY `idx_date` (`work_date`),
  CONSTRAINT `fk_in_att_user_day` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 서류 결재
-- =====================================================================
--   type  : reason, leave, ot, exp, cert, supply, propose, suggest, request (inc/app/appr.php APPR_TYPES)
--   fields: 서류 내용 JSON
CREATE TABLE IF NOT EXISTS `in_approvals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '올린 사람',
  `type` varchar(20) NOT NULL,
  `title` varchar(200) NOT NULL,
  `fields` json DEFAULT NULL,
  `status` enum('pending','approved','rejected','canceled') NOT NULL DEFAULT 'pending',
  `current_step` tinyint NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`,`id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_in_appr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 결재선 (step 0부터 차례대로)
--   status: waiting = 앞 단계 대기, pending = 내 차례, approved, rejected, skipped = 반려로 건너뜀
CREATE TABLE IF NOT EXISTS `in_approval_steps` (
  `approval_id` int NOT NULL,
  `step` tinyint NOT NULL,
  `approver_id` int DEFAULT NULL,
  `status` enum('waiting','pending','approved','rejected','skipped') NOT NULL DEFAULT 'waiting',
  `note` varchar(500) DEFAULT NULL,
  `acted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`approval_id`,`step`),
  KEY `idx_approver` (`approver_id`,`status`),
  CONSTRAINT `fk_in_astep_appr` FOREIGN KEY (`approval_id`) REFERENCES `in_approvals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_astep_user` FOREIGN KEY (`approver_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 급여 명세 · 근로계약서 (본인과 대표/관리자만 열람)
-- =====================================================================
--   items: JSON 배열 [{"label":"기본급","amount":3500000,"kind":"pay"|"deduct"}, ...]
CREATE TABLE IF NOT EXISTS `in_payslips` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `pay_month` char(7) NOT NULL COMMENT 'YYYY-MM',
  `items` json NOT NULL,
  `memo` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_month` (`user_id`,`pay_month`),
  KEY `fk_in_pay_creator` (`created_by`),
  CONSTRAINT `fk_in_pay_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_pay_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 근로계약서 (가장 최근 것 1개를 보여줌)
CREATE TABLE IF NOT EXISTS `in_contracts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(100) NOT NULL,
  `contract_type` varchar(20) DEFAULT NULL COMMENT '정규직, 계약직 ...',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `work_hours` varchar(50) DEFAULT NULL,
  `salary_text` varchar(100) DEFAULT NULL,
  `attachment_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `fk_in_contract_creator` (`created_by`),
  CONSTRAINT `fk_in_contract_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_contract_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 첨부파일 (게시글 / 메시지 / 결재 서류 / 개인 서류 중 하나에 연결)
--   올린 직후에는 모두 NULL이고, 하루가 지나도 연결이 안 되면 자동 삭제
-- =====================================================================
CREATE TABLE IF NOT EXISTS `in_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT '올린 사람',
  `post_id` int DEFAULT NULL,
  `message_id` bigint DEFAULT NULL,
  `approval_id` int DEFAULT NULL,
  `personal_user_id` int DEFAULT NULL COMMENT '근로계약서 등 개인 서류의 주인',
  `original_name` varchar(255) NOT NULL,
  `stored_name` char(32) NOT NULL COMMENT 'UPLOAD_DIR 안의 파일 이름 (랜덤 hex)',
  `mime_type` varchar(100) NOT NULL,
  `size_bytes` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_stored` (`stored_name`),
  KEY `idx_post` (`post_id`),
  KEY `idx_message` (`message_id`),
  KEY `idx_orphan` (`post_id`,`message_id`,`created_at`),
  KEY `fk_in_att_user` (`user_id`),
  KEY `idx_approval` (`approval_id`),
  KEY `idx_personal` (`personal_user_id`),
  CONSTRAINT `fk_in_att_appr` FOREIGN KEY (`approval_id`) REFERENCES `in_approvals` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_att_msg` FOREIGN KEY (`message_id`) REFERENCES `in_messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_att_personal` FOREIGN KEY (`personal_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_in_att_post` FOREIGN KEY (`post_id`) REFERENCES `in_posts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_att_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 구내식당 메뉴 (대표 · 관리자가 입력, 날짜 · 끼니마다 1줄)
-- =====================================================================
CREATE TABLE IF NOT EXISTS `in_meals` (
  `meal_date` date NOT NULL,
  `meal` varchar(10) NOT NULL DEFAULT 'lunch' COMMENT '지금은 lunch(점심)만 씀',
  `items` text NOT NULL COMMENT '메뉴, 한 줄에 하나',
  `updated_by` int DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`meal_date`,`meal`),
  KEY `fk_in_meals_user` (`updated_by`),
  CONSTRAINT `fk_in_meals_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 모바일 사원증 바코드 확인 기록 (reader.php)
--   result: ok 통과, expired 예전 코드(캡처 의심), invalid 없는 코드, inactive 이용 중지된 사람
-- =====================================================================
CREATE TABLE IF NOT EXISTS `in_idcard_scans` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT '찍힌 사원증의 주인 (없는 코드면 NULL)',
  `scanned_by` int DEFAULT NULL COMMENT '리더기를 쓴 사람',
  `result` varchar(10) NOT NULL COMMENT 'ok, expired, invalid, inactive',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`,`id`),
  KEY `idx_time` (`created_at`),
  KEY `fk_in_scan_by` (`scanned_by`),
  CONSTRAINT `fk_in_scan_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_scan_by` FOREIGN KEY (`scanned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 기본 데이터 (새로 설치할 때만 들어가요. 이미 있으면 건너뜀)
-- =====================================================================
INSERT IGNORE INTO `in_settings` (`k`, `v`) VALUES
  ('work_start', '09:00'),
  ('work_end',   '18:00');

INSERT IGNORE INTO `in_boards` (`slug`, `name`, `description`, `is_anonymous`, `write_role`, `allow_comments`, `allow_attachments`, `is_visible`, `sort_order`) VALUES
  ('free', '자유게시판', '모든 글은 익명으로 올라가요', 1, 'user', 1, 1, 1, 1);

-- 첫 관리자 · 대표 지정 (처음 한 번만, 가입한 뒤 아이디를 넣어 실행하세요)
--   UPDATE in_members m JOIN users u ON u.id = m.user_id
--      SET m.status = 'active', m.is_admin = 1, m.role = 'ceo'
--    WHERE u.username = '대표아이디';
