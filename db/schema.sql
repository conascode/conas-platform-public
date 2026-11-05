-- =====================================================================
-- CONAS 사내 2.0 — DB 스키마 (MySQL 8 / MariaDB 10.5 이상)
--
-- 코드(inc/, api/, *.php)에서 실제로 쓰는 쿼리를 기준으로 정리했어요.
--   - 새 서버나 내 컴퓨터(Laragon 등)에 처음 설치할 때 이 파일을 그대로 실행하면 돼요.
--   - 모든 테이블은 IF NOT EXISTS 라서 이미 있는 테이블은 건드리지 않아요.
--     (운영 DB에 실행해도 기존 데이터는 바뀌지 않지만, 빠진 칸이 추가되지도 않아요.)
--   - 외래 키(FOREIGN KEY)는 일부러 걸지 않았어요. users 테이블이 conas.kr 메인
--     사이트와 같이 쓰는 테이블이라, 회원이 지워져도 사내 기록은 남도록
--     코드가 LEFT JOIN 으로 '(알 수 없음)' 처리를 하고 있어요.
--
-- 실행 예)  mysql -u root -p conas_dev < db/schema.sql
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- ---------------------------------------------------------------------
-- 회원 계정 (conas.kr 메인 사이트와 같이 쓰는 테이블)
--   운영 서버에는 이미 있어요. 개발용 DB에서만 새로 만들어져요.
--   사내 앱이 쓰는 칸: id, username, password(bcrypt), email
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username    VARCHAR(50)  NOT NULL,
  password    VARCHAR(255) NOT NULL,
  email       VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 기본 · 사람 · 조직
-- =====================================================================

-- 팀
CREATE TABLE IF NOT EXISTS in_teams (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(50)  NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_teams_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 사내 회원 정보 (users 1명당 1줄)
--   status : pending = 승인 대기, active = 사용 중, disabled = 이용 중지
--   role   : ceo = 대표, lead = 팀장, member = 팀원
--   is_admin 은 직책과 별개 (가입 승인, 게시판 설정, 공지 작성)
CREATE TABLE IF NOT EXISTS in_members (
  user_id         INT UNSIGNED NOT NULL,
  display_name    VARCHAR(50)  NULL,
  avatar          VARCHAR(40)  NULL COMMENT '예: 12_0123456789ab.jpg (UPLOAD_DIR/avatars 안의 파일 이름)',
  phone           VARCHAR(30)  NULL,
  status          ENUM('pending','active','disabled') NOT NULL DEFAULT 'pending',
  is_admin        TINYINT(1)   NOT NULL DEFAULT 0,
  team_id         INT UNSIGNED NULL,
  role            ENUM('ceo','lead','member') NOT NULL DEFAULT 'member',
  position        VARCHAR(20)  NULL COMMENT '사원, 주임, 대리, 과장 ...',
  joined_on       DATE         NULL COMMENT '입사일',
  annual_leave    DECIMAL(4,1) NULL COMMENT '올해 연차 일수 (NULL = 미설정)',
  last_seen_at    DATETIME     NULL COMMENT '3분 안이면 접속 중으로 표시',
  chat_active_at  DATETIME     NULL COMMENT '채팅 화면을 보고 있으면 푸시를 보내지 않음',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_members_status (status, created_at),
  KEY idx_members_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 앱 설정 (k = 'work_start' '09:00' / 'work_end' '18:00' / 'vapid' 푸시 키 JSON)
CREATE TABLE IF NOT EXISTS in_settings (
  k  VARCHAR(50) NOT NULL,
  v  TEXT        NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로그인 유지 토큰 (쿠키: selector:validator, DB에는 validator의 sha256만 저장)
CREATE TABLE IF NOT EXISTS in_remember_tokens (
  selector        CHAR(24)     NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  validator_hash  CHAR(64)     NOT NULL,
  expires_at      DATETIME     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (selector),
  KEY idx_remember_user (user_id),
  KEY idx_remember_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로그인 실패 기록 (10분 동안 IP 10회 / 아이디 5회 실패 시 잠시 막음, 하루 지나면 삭제)
CREATE TABLE IF NOT EXISTS in_login_attempts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip            VARCHAR(45)  NOT NULL,
  login         VARCHAR(100) NOT NULL,
  attempted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_ip (ip, attempted_at),
  KEY idx_login_login (login, attempted_at),
  KEY idx_login_time (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 알림 (link: 앱 안 경로, 예: '/ws/task')
CREATE TABLE IF NOT EXISTS in_notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  kind        VARCHAR(20)  NOT NULL COMMENT 'task, approval, notice, pay ...',
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(255) NOT NULL DEFAULT '',
  link        VARCHAR(100) NOT NULL DEFAULT '',
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_noti_user (user_id, read_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 웹 푸시 구독 (기기마다 1줄)
CREATE TABLE IF NOT EXISTS in_push_subscriptions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  endpoint       VARCHAR(2000) NOT NULL,
  endpoint_hash  CHAR(64)     NOT NULL COMMENT 'sha256(endpoint)',
  p256dh         VARCHAR(255) NULL,
  auth           VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 첨부파일 (게시글 / 메시지 / 결재 서류 / 개인 서류 중 하나에 연결)
--   올린 직후에는 모두 NULL이고, 하루가 지나도 연결이 안 되면 자동 삭제
-- =====================================================================
CREATE TABLE IF NOT EXISTS in_attachments (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL COMMENT '올린 사람',
  original_name     VARCHAR(255) NOT NULL,
  stored_name       CHAR(32)     NOT NULL COMMENT 'UPLOAD_DIR 안의 파일 이름 (랜덤 hex)',
  mime_type         VARCHAR(100) NOT NULL,
  size_bytes        INT UNSIGNED NOT NULL DEFAULT 0,
  post_id           INT UNSIGNED NULL,
  message_id        BIGINT UNSIGNED NULL,
  approval_id       INT UNSIGNED NULL,
  personal_user_id  INT UNSIGNED NULL COMMENT '근로계약서 등 개인 서류의 주인',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_stored (stored_name),
  KEY idx_att_post (post_id),
  KEY idx_att_message (message_id),
  KEY idx_att_approval (approval_id),
  KEY idx_att_personal (personal_user_id),
  KEY idx_att_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 게시판
-- =====================================================================
CREATE TABLE IF NOT EXISTS in_boards (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug               VARCHAR(30)  NOT NULL,
  name               VARCHAR(50)  NOT NULL,
  description        VARCHAR(255) NULL,
  is_anonymous       TINYINT(1)   NOT NULL DEFAULT 0,
  write_role         ENUM('user','admin') NOT NULL DEFAULT 'user',
  allow_comments     TINYINT(1)   NOT NULL DEFAULT 1,
  allow_attachments  TINYINT(1)   NOT NULL DEFAULT 1,
  max_files          TINYINT UNSIGNED NOT NULL DEFAULT 10,
  is_visible         TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order         INT          NOT NULL DEFAULT 0,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_boards_slug (slug),
  KEY idx_boards_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS in_posts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  board_id      INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NULL,
  is_anonymous  TINYINT(1)   NOT NULL DEFAULT 0,
  title         VARCHAR(200) NOT NULL,
  body          MEDIUMTEXT   NOT NULL,
  is_pinned     TINYINT(1)   NOT NULL DEFAULT 0,
  view_count    INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NULL,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_posts_board (board_id, deleted_at, is_pinned, id),
  KEY idx_posts_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 댓글 (parent_id: 답글이면 원 댓글 id)
CREATE TABLE IF NOT EXISTS in_comments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id     INT UNSIGNED NOT NULL,
  parent_id   INT UNSIGNED NULL,
  user_id     INT UNSIGNED NULL,
  body        TEXT         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_comments_post (post_id, id),
  KEY idx_comments_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS in_post_likes (
  post_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  KEY idx_post_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS in_comment_likes (
  comment_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, user_id),
  KEY idx_comment_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 채널 · DM · 그룹 대화
-- =====================================================================
--   type    : dm = 1:1, group = 그룹 대화, channel = 공개 채널
--   dm_key  : 1:1 방만 '작은id:큰id' (같은 두 사람의 방이 두 개 생기지 않게)
CREATE TABLE IF NOT EXISTS in_conversations (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type             ENUM('dm','group','channel') NOT NULL,
  name             VARCHAR(100) NULL,
  description      VARCHAR(255) NULL,
  dm_key           VARCHAR(30)  NULL,
  last_message_id  BIGINT UNSIGNED NULL,
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conv_dm_key (dm_key),
  KEY idx_conv_type (type, name),
  KEY idx_conv_updated (updated_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 대화방 참여자 (joined_at 이전 메시지는 DM/그룹에서 보이지 않음)
CREATE TABLE IF NOT EXISTS in_conversation_members (
  conversation_id       INT UNSIGNED    NOT NULL,
  user_id               INT UNSIGNED    NOT NULL,
  last_read_message_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_conv_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 메시지 (client_msg_id: 화면이 만든 임시 id, 재전송 중복 방지. 'sys:'로 시작하면 안내 메시지)
CREATE TABLE IF NOT EXISTS in_messages (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id  INT UNSIGNED NOT NULL,
  user_id          INT UNSIGNED NULL,
  body             TEXT         NOT NULL,
  client_msg_id    VARCHAR(64)  NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_conv (conversation_id, id),
  KEY idx_messages_client (conversation_id, user_id, client_msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 업무 · 프로젝트 · 일정
-- =====================================================================
--   stages         : JSON 배열 [{"id":"s1a2b3c4","name":"기획"}, ...] (최대 50개)
--   current_stage  : stages 안의 id
--   allow_edit_done: 완료한 업무 수정 0 = 불가, 1 = 담당자만, 2 = 누구나
CREATE TABLE IF NOT EXISTS in_projects (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id          INT UNSIGNED NULL,
  name             VARCHAR(100) NOT NULL,
  short_name       VARCHAR(20)  NULL,
  stages           TEXT         NULL,
  current_stage    VARCHAR(16)  NULL,
  require_review   TINYINT(1)   NOT NULL DEFAULT 1,
  allow_edit_done  TINYINT      NOT NULL DEFAULT 0,
  due_date         DATE         NULL,
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_projects_team (team_id, archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS in_project_members (
  project_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  KEY idx_project_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 업무
--   status: todo = 진행 중, review = 검토 요청, done = 완료
--   reviewer_id 가 있으면 완료할 때 검토를 거침 (프로젝트 require_review = 0 이면 생략)
CREATE TABLE IF NOT EXISTS in_tasks (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id    INT UNSIGNED NULL,
  stage_id      VARCHAR(16)  NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT         NULL,
  assignee_id   INT UNSIGNED NOT NULL COMMENT '담당자',
  assigner_id   INT UNSIGNED NULL COMMENT '배정한 사람',
  reviewer_id   INT UNSIGNED NULL COMMENT '검토할 사람',
  due_date      DATE         NOT NULL,
  status        ENUM('todo','review','done') NOT NULL DEFAULT 'todo',
  submit_note   TEXT         NULL,
  reject_note   TEXT         NULL,
  submitted_at  DATETIME     NULL,
  done_at       DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_assignee (assignee_id, status, due_date),
  KEY idx_tasks_project (project_id, stage_id),
  KEY idx_tasks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 회사 마감 (전사 공통 마감일)
CREATE TABLE IF NOT EXISTS in_deadlines (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title        VARCHAR(200) NOT NULL,
  description  VARCHAR(255) NULL,
  due_date     DATE         NOT NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deadlines_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 일정 (team_id NULL = 전사 일정 / color: primary, ok, warn, danger, leave)
CREATE TABLE IF NOT EXISTS in_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  place       VARCHAR(100) NULL,
  starts_at   DATETIME     NOT NULL,
  color       VARCHAR(10)  NOT NULL DEFAULT 'primary',
  team_id     INT UNSIGNED NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_starts (starts_at),
  KEY idx_events_team (team_id, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 공지
-- =====================================================================
--   category: 일반, 인사, 총무, 행사 / must_confirm = 필독(확인 필요)
CREATE TABLE IF NOT EXISTS in_notices (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category      VARCHAR(10)  NOT NULL DEFAULT '일반',
  title         VARCHAR(200) NOT NULL,
  body          MEDIUMTEXT   NOT NULL,
  must_confirm  TINYINT(1)   NOT NULL DEFAULT 0,
  user_id       INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NULL,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_notices_deleted (deleted_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공지 읽음 · 확인
CREATE TABLE IF NOT EXISTS in_notice_reads (
  notice_id     INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  read_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at  DATETIME     NULL,
  PRIMARY KEY (notice_id, user_id),
  KEY idx_notice_reads_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 근태
-- =====================================================================
--   kind: work = 출근, leave = 연차, half_am / half_pm = 반차, absent = 결근
--   연차 · 반차 결재가 최종 승인되면 자동으로 기록됨
CREATE TABLE IF NOT EXISTS in_attendance (
  user_id    INT UNSIGNED NOT NULL,
  work_date  DATE         NOT NULL,
  check_in   TIME         NULL,
  check_out  TIME         NULL,
  kind       ENUM('work','leave','half_am','half_pm','absent') NOT NULL DEFAULT 'work',
  note       VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, work_date),
  KEY idx_attendance_date (work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 서류 결재
-- =====================================================================
--   type  : reason, leave, ot, exp, cert, supply, propose, suggest, request (inc/app/appr.php APPR_TYPES)
--   fields: 서류 내용 JSON
CREATE TABLE IF NOT EXISTS in_approvals (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL COMMENT '올린 사람',
  type          VARCHAR(20)  NOT NULL,
  title         VARCHAR(200) NOT NULL,
  fields        MEDIUMTEXT   NOT NULL,
  status        ENUM('pending','approved','rejected','canceled') NOT NULL DEFAULT 'pending',
  current_step  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_approvals_user (user_id, status, id),
  KEY idx_approvals_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 결재선 (step 0부터 차례대로)
--   status: waiting = 앞 단계 대기, pending = 내 차례, approved, rejected, skipped = 반려로 건너뜀
CREATE TABLE IF NOT EXISTS in_approval_steps (
  approval_id  INT UNSIGNED NOT NULL,
  step         TINYINT UNSIGNED NOT NULL,
  approver_id  INT UNSIGNED NULL,
  status       ENUM('waiting','pending','approved','rejected','skipped') NOT NULL DEFAULT 'waiting',
  note         VARCHAR(500) NULL,
  acted_at     DATETIME     NULL,
  PRIMARY KEY (approval_id, step),
  KEY idx_steps_approver (approver_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 급여 명세 · 근로계약서 (본인과 대표/관리자만 열람)
-- =====================================================================
--   items: JSON 배열 [{"label":"기본급","amount":3500000,"kind":"pay"|"deduct"}, ...]
CREATE TABLE IF NOT EXISTS in_payslips (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  pay_month   CHAR(7)      NOT NULL COMMENT 'YYYY-MM',
  items       TEXT         NOT NULL,
  memo        VARCHAR(255) NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payslips_month (user_id, pay_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 근로계약서 (가장 최근 것 1개를 보여줌)
CREATE TABLE IF NOT EXISTS in_contracts (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  title          VARCHAR(100) NOT NULL DEFAULT '근로계약서',
  contract_type  VARCHAR(20)  NULL COMMENT '정규직, 계약직 ...',
  start_date     DATE         NULL,
  end_date       DATE         NULL,
  work_hours     VARCHAR(50)  NULL,
  salary_text    VARCHAR(100) NULL,
  attachment_id  INT UNSIGNED NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contracts_user (user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 기본 데이터
-- =====================================================================
INSERT IGNORE INTO in_settings (k, v) VALUES
  ('work_start', '09:00'),
  ('work_end',   '18:00');

INSERT IGNORE INTO in_boards (slug, name, description, is_anonymous, write_role, allow_comments, allow_attachments, is_visible, sort_order) VALUES
  ('free', '자유게시판', '모든 글은 익명으로 올라가요', 1, 'user', 1, 1, 1, 1);

-- 첫 관리자 · 대표 지정 (처음 한 번만, 가입한 뒤 아이디를 넣어 실행하세요)
--   UPDATE in_members m JOIN users u ON u.id = m.user_id
--      SET m.status = 'active', m.is_admin = 1, m.role = 'ceo'
--    WHERE u.username = '대표아이디';
