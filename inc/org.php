<?php
defined('IN_APP') or exit;

/*
 * 조직 · 권한 규칙 (한곳에서 관리)
 *  role: ceo = 대표, lead = 팀장, member = 팀원
 *  - 업무 배정: 대표 → 전원, 팀장 → 자기 팀 팀원
 *  - 결재선: 팀원 → 팀장 → 대표 / 팀장 → 대표 / 대표 → 전결
 *  - 프로젝트: 우리 팀 것만 (대표는 전체)
 *  - 인사 변경(팀, 직책, 직급): 대표만
 *  is_admin(사내 관리자)은 직책과 별개: 가입 승인, 게시판 설정, 공지 작성
 */

const ROLE_LABEL = ['ceo' => '대표', 'lead' => '팀장', 'member' => '팀원'];
const POSITIONS = ['사원', '주임', '대리', '과장', '차장', '부장', '이사', '대표이사'];

/** API 에러 (사용자에게 보여줄 메시지) */
final class ApiError extends RuntimeException
{
    public function __construct(string $msg, public int $status = 400)
    {
        parent::__construct($msg);
    }
}

function fail(string $msg, int $status = 400): never
{
    throw new ApiError($msg, $status);
}

/** 활성 회원 전체 (조직 정보 포함). 요청 안에서는 한 번만 조회 */
function org_members(bool $refresh = false): array
{
    static $cache = null;
    if ($cache !== null && !$refresh) {
        return $cache;
    }
    $rows = q(
        "SELECT u.id, u.username, u.email, m.display_name, m.employee_no, m.avatar, m.phone, m.team_id, t.name AS team_name,
                m.role, m.position, m.joined_on, m.annual_leave, m.is_admin, m.status,
                (m.last_seen_at >= NOW() - INTERVAL 3 MINUTE) AS online
           FROM in_members m
           JOIN users u ON u.id = m.user_id
           LEFT JOIN in_teams t ON t.id = m.team_id
          WHERE m.status = 'active'
          ORDER BY FIELD(m.role, 'ceo', 'lead', 'member'), COALESCE(NULLIF(m.display_name, ''), u.username)"
    )->fetchAll();
    $cache = [];
    foreach ($rows as $r) {
        $r['id'] = (int)$r['id'];
        $r['team_id'] = $r['team_id'] === null ? null : (int)$r['team_id'];
        $r['is_admin'] = (bool)$r['is_admin'];
        $r['name'] = user_label($r);
        $cache[$r['id']] = $r;
    }
    return $cache;
}

function org_member(int $id): ?array
{
    return org_members()[$id] ?? null;
}

function org_name(?int $id): string
{
    if (!$id) return '(알 수 없음)';
    $m = org_member($id);
    if ($m) return $m['name'];
    $r = q('SELECT u.username, m.display_name FROM users u LEFT JOIN in_members m ON m.user_id = u.id WHERE u.id = ?', [$id])->fetch();
    return $r ? user_label($r) : '(알 수 없음)';
}

/** 화면에 보낼 회원 정보 */
function member_public(array $m): array
{
    return [
        'id' => $m['id'],
        'name' => $m['name'],
        'username' => $m['username'],
        'email' => $m['email'],
        'av' => avatar_url($m['id'], $m['avatar']),
        'phone' => $m['phone'],
        'team_id' => $m['team_id'],
        'team' => $m['team_name'],
        'role' => $m['role'],
        'position' => $m['position'],
        'joined_on' => $m['joined_on'],
        'is_admin' => $m['is_admin'],
        'online' => (bool)$m['online'],
    ];
}

function is_ceo(array $me): bool
{
    return $me['role'] === 'ceo';
}

/** 공지 · 회사 마감 · 전사 일정 작성 권한 */
function can_manage_company(array $me): bool
{
    return is_ceo($me) || $me['is_admin'];
}

function ceo_id(): ?int
{
    foreach (org_members() as $m) {
        if ($m['role'] === 'ceo') return $m['id'];
    }
    return null;
}

function team_lead_id(?int $teamId, ?int $except = null): ?int
{
    if (!$teamId) return null;
    foreach (org_members() as $m) {
        if ($m['team_id'] === $teamId && $m['role'] === 'lead' && $m['id'] !== $except) return $m['id'];
    }
    return null;
}

/** 결재선 (회원 id 목록, 순서대로) */
function approver_chain(array $m): array
{
    if ($m['role'] === 'ceo') return [];
    $chain = [];
    if ($m['role'] === 'member') {
        $lead = team_lead_id($m['team_id'], $m['id']);
        if ($lead) $chain[] = $lead;
    }
    $ceo = ceo_id();
    if ($ceo && $ceo !== $m['id'] && !in_array($ceo, $chain, true)) $chain[] = $ceo;
    return $chain;
}

/** 내가 업무를 배정할 수 있는 사람 id 목록 (나 제외) */
function assignable_ids(array $me): array
{
    $out = [];
    foreach (org_members() as $m) {
        if ($m['id'] === $me['id']) continue;
        if (is_ceo($me) || ($me['role'] === 'lead' && $me['team_id'] && $m['team_id'] === $me['team_id'] && $m['role'] === 'member')) {
            $out[] = $m['id'];
        }
    }
    return $out;
}

/** $me가 $targetId의 상급자인가 (대표는 모두의 상급자, 팀장은 자기 팀 팀원의 상급자) */
function is_superior_of(array $me, int $targetId): bool
{
    return in_array($targetId, assignable_ids($me), true);
}

/** 볼 수 있는 프로젝트 조건 (SQL): 대표는 전체, 나머지는 우리 팀 프로젝트 + 내가 참여한 프로젝트 */
function project_visible_sql(array $me, string $alias = 'p'): array
{
    if (is_ceo($me)) return ['1=1', []];
    $member = "EXISTS(SELECT 1 FROM in_project_members pm WHERE pm.project_id = $alias.id AND pm.user_id = ?)";
    if ($me['team_id']) return ["($alias.team_id = ? OR $member)", [$me['team_id'], $me['id']]];
    return [$member, [$me['id']]];
}

// ---------------------------------------------------------------------
// 알림: DB에 저장하고, 응답을 보낸 뒤 푸시 발송
// ---------------------------------------------------------------------
$GLOBALS['__push_users'] = [];

/** link: 앱 안 경로 (예: '/ws/task') */
function notify(int|array $userIds, string $kind, string $title, string $body = '', string $link = ''): void
{
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)$userIds))));
    foreach ($ids as $id) {
        q(
            'INSERT INTO in_notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)',
            [$id, $kind, mb_substr($title, 0, 200), mb_substr($body, 0, 255), mb_substr($link, 0, 100)]
        );
        $GLOBALS['__push_users'][] = $id;
    }
}

// ---------------------------------------------------------------------
// 입력 도우미
// ---------------------------------------------------------------------
function date_in(array $src, string $key, bool $required = true): ?string
{
    $v = str_in($src, $key, 10);
    if ($v === '') {
        if ($required) fail('날짜를 입력해 주세요.');
        return null;
    }
    $d = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) fail('날짜 형식이 올바르지 않아요.');
    return $v;
}

function bool_in(array $src, string $key): bool
{
    $v = $src[$key] ?? false;
    return $v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'on';
}

/** 연락처: 비워도 되고, 숫자 · - · + · 공백만 */
function phone_in(array $src, string $key): ?string
{
    $v = str_in($src, $key, 30);
    if ($v === '') return null;
    if (!preg_match('/^\+?[0-9][0-9\- ]{6,18}[0-9]$/', $v)) fail('연락처는 숫자와 - 만 써서 입력해 주세요. (예: 010-1234-5678)');
    return $v;
}

function ts(?string $dt): ?int
{
    return $dt ? strtotime($dt) : null;
}
