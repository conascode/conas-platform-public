<?php
defined('IN_APP') or exit;

/** 앱을 열 때 한 번: 나, 사람들, 팀, 게시판, 배지 숫자 */
function api_bootstrap(array $me, array $in): array
{
    q('UPDATE in_members SET last_seen_at = NOW() WHERE user_id = ?', [$me['id']]);
    $teams = q('SELECT id, name FROM in_teams ORDER BY sort_order, id')->fetchAll();
    foreach ($teams as &$t) $t['id'] = (int)$t['id'];
    unset($t);

    return [
        'me' => member_public($me) + [
            'employee_no' => $me['employee_no'],
            'annual_leave' => $me['annual_leave'] === null ? null : (float)$me['annual_leave'],
            'can_manage' => can_manage_company($me),
            'assignable' => assignable_ids($me),
            'approvers' => approver_chain($me),
        ],
        'members' => members_for($me),
        'teams' => $teams,
        'boards' => array_values(array_map(
            fn($b) => board_public($b, $me),
            array_filter(visible_boards($me), fn($b) => (int)$b['is_visible'] === 1)
        )),
        'positions' => POSITIONS,
        'settings' => ['work_start' => setting_get('work_start') ?? '09:00', 'work_end' => setting_get('work_end') ?? '18:00'],
        'badges' => badges($me),
        'today' => date('Y-m-d'),
        'version' => APP_VERSION,
        'csrf' => csrf_token(),
    ];
}

/** 회원 목록 (연차 일수는 대표에게만) */
function members_for(array $me): array
{
    return array_values(array_map(
        fn($m) => member_public($m) + (is_ceo($me) ? ['annual_leave' => $m['annual_leave'] === null ? null : (float)$m['annual_leave']] : []),
        org_members()
    ));
}

function board_public(array $b, array $me): array
{
    return [
        'id' => (int)$b['id'],
        'slug' => $b['slug'],
        'name' => $b['name'],
        'description' => $b['description'],
        'anonymous' => (bool)$b['is_anonymous'],
        'can_write' => can_write_board($b, $me),
        'allow_comments' => (bool)$b['allow_comments'],
        'allow_attachments' => (bool)$b['allow_attachments'],
        'max_files' => (int)$b['max_files'],
        'visible' => (bool)$b['is_visible'],
    ];
}

/** 하단바 · 알림 배지 숫자 */
function badges(array $me): array
{
    require_once __DIR__ . '/../chat.php';
    $uid = $me['id'];
    $dmUnread = (int)q(
        "SELECT COUNT(*) FROM in_messages m
           JOIN in_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
           JOIN in_conversations c ON c.id = m.conversation_id AND c.type <> 'channel'
          WHERE m.id > cm.last_read_message_id AND (m.user_id IS NULL OR m.user_id <> ?)",
        [$uid, $uid]
    )->fetchColumn();
    $chUnread = (int)q(
        "SELECT COUNT(*) FROM in_messages m
           JOIN in_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
           JOIN in_conversations c ON c.id = m.conversation_id AND c.type = 'channel'
          WHERE m.id > cm.last_read_message_id AND (m.user_id IS NULL OR m.user_id <> ?)",
        [$uid, $uid]
    )->fetchColumn();
    $noti = (int)q('SELECT COUNT(*) FROM in_notifications WHERE user_id = ? AND read_at IS NULL', [$uid])->fetchColumn();
    $tasksDue = (int)q(
        "SELECT COUNT(*) FROM in_tasks WHERE assignee_id = ? AND status = 'todo' AND due_date <= CURDATE()",
        [$uid]
    )->fetchColumn();
    $reviews = count(review_queue_ids($me));
    $approvals = (int)q(
        "SELECT COUNT(*) FROM in_approval_steps s JOIN in_approvals a ON a.id = s.approval_id
          WHERE s.approver_id = ? AND s.status = 'pending' AND a.status = 'pending'",
        [$uid]
    )->fetchColumn();
    $notices = (int)q(
        "SELECT COUNT(*) FROM in_notices n
           LEFT JOIN in_notice_reads r ON r.notice_id = n.id AND r.user_id = ?
          WHERE n.deleted_at IS NULL AND (r.notice_id IS NULL OR (n.must_confirm = 1 AND r.confirmed_at IS NULL AND ? <> 'ceo'))",
        [$uid, $me['role']]
    )->fetchColumn();
    return [
        'dm' => $dmUnread,
        'channel' => $chUnread,
        'noti' => $noti,
        'task' => $tasksDue + $reviews,
        'approval' => $approvals,
        'notice' => $notices,
        'pending' => $me['is_admin'] ? pending_count() : 0,
    ];
}

/** 내가 검토해야 하는 업무 id (완료 요청 상태) */
function review_queue_ids(array $me): array
{
    $rows = q("SELECT id, assignee_id, reviewer_id FROM in_tasks WHERE status = 'review'")->fetchAll();
    $out = [];
    foreach ($rows as $t) {
        if (can_review_task($t, $me)) $out[] = (int)$t['id'];
    }
    return $out;
}

/** 검토 권한: 지정된 검토자, 또는 담당자의 상급자. 본인 할 일(검토자 없음)은 검토 대상 아님 */
function can_review_task(array $t, array $me): bool
{
    if ($t['reviewer_id'] === null || (int)$t['assignee_id'] === $me['id']) return false;
    return (int)$t['reviewer_id'] === $me['id'] || is_superior_of($me, (int)$t['assignee_id']);
}

/** 배지 숫자만 (화면이 켜져 있는 동안 주기적으로) */
function api_badges(array $me, array $in): array
{
    q('UPDATE in_members SET last_seen_at = NOW() WHERE user_id = ?', [$me['id']]);
    return ['badges' => badges($me), 'csrf' => csrf_token(), 'version' => APP_VERSION];
}

/** 비밀번호 변경 (conas.kr 메인 사이트 비밀번호도 함께 바뀜). 다른 기기의 로그인 유지는 해제 */
function api_me_password(array $me, array $in): array
{
    $cur = is_string($in['current'] ?? null) ? $in['current'] : '';
    $new = is_string($in['new'] ?? null) ? $in['new'] : '';
    $hash = (string)q('SELECT password FROM users WHERE id = ?', [$me['id']])->fetchColumn();
    if (!password_verify($cur, $hash)) fail('현재 비밀번호가 맞지 않아요.');
    if (strlen($new) < 8 || strlen($new) > 72) fail('새 비밀번호는 8~72자로 입력해 주세요.');
    q('UPDATE users SET password = ? WHERE id = ?', [password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]), $me['id']]);
    q('DELETE FROM in_remember_tokens WHERE user_id = ?', [$me['id']]);
    return ['ok' => true];
}

/** 내 정보 수정: 이름, 연락처(선택) */
function api_me_update(array $me, array $in): array
{
    $name = str_in($in, 'display_name', 50);
    if ($name === '') fail('이름을 입력해 주세요.');
    $phone = phone_in($in, 'phone');
    q('UPDATE in_members SET display_name = ?, phone = ? WHERE user_id = ?', [$name, $phone, $me['id']]);
    return ['ok' => true, 'member' => member_public(org_members(true)[$me['id']])];
}

/** 대표: 직원의 팀 · 직책 · 직급 · 입사일 · 연차 · 연락처 변경 */
function api_member_update(array $me, array $in): array
{
    if (!is_ceo($me)) fail('대표만 바꿀 수 있어요.', 403);
    $id = int_in($in, 'user_id');
    $m = org_member($id);
    if (!$m) fail('직원을 찾을 수 없어요.', 404);
    if ($m['role'] === 'ceo') fail('대표 정보는 여기서 바꿀 수 없어요.');

    $teamId = int_in($in, 'team_id') ?: null;
    if ($teamId && !q('SELECT 1 FROM in_teams WHERE id = ?', [$teamId])->fetchColumn()) fail('팀을 찾을 수 없어요.');
    $role = (string)($in['role'] ?? 'member');
    if (!in_array($role, ['lead', 'member'], true)) fail('직책을 다시 골라 주세요.');
    if ($role === 'lead' && !$teamId) fail('팀장은 소속 팀이 있어야 해요.');
    $position = str_in($in, 'position', 20);
    $joined = date_in($in, 'joined_on', false);
    // 연차: 값을 보내지 않으면 그대로, 빈 값이면 미지정
    if (array_key_exists('annual_leave', $in)) {
        $leave = $in['annual_leave'];
        $leave = ($leave === null || $leave === '') ? null : (float)$leave;
    } else {
        $leave = $m['annual_leave'] === null ? null : (float)$m['annual_leave'];
    }
    if ($leave !== null && ($leave < 0 || $leave > 99)) fail('연차 일수를 확인해 주세요.');
    $phone = array_key_exists('phone', $in) ? phone_in($in, 'phone') : $m['phone'];

    $demoted = null;
    $pdo = db();
    $pdo->beginTransaction();
    // 팀장은 팀에 한 명: 기존 팀장은 팀원으로
    if ($role === 'lead') {
        $prev = team_lead_id($teamId, $id);
        if ($prev) {
            q("UPDATE in_members SET role = 'member' WHERE user_id = ?", [$prev]);
            $demoted = $prev;
        }
    }
    q(
        'UPDATE in_members SET team_id = ?, role = ?, position = ?, joined_on = ?, annual_leave = ?, phone = ? WHERE user_id = ?',
        [$teamId, $role, $position !== '' ? $position : null, $joined, $leave, $phone, $id]
    );
    $pdo->commit();

    $all = org_members(true);
    $label = ($all[$id]['team_name'] ?? '소속 없음') . ' · ' . ($role === 'lead' ? '팀장' : ($position ?: '팀원'));
    notify($id, 'org', '인사 정보가 변경됐어요', $label, '/cm/people');
    if ($demoted) notify($demoted, 'org', '인사 정보가 변경됐어요', ($all[$demoted]['team_name'] ?? '') . ' · 팀원', '/cm/people');

    return ['ok' => true, 'members' => members_for($me), 'demoted' => $demoted];
}

/** 대표: 팀 추가 · 이름 변경 */
function api_team_save(array $me, array $in): array
{
    if (!is_ceo($me)) fail('대표만 팀을 관리할 수 있어요.', 403);
    $id = int_in($in, 'id');
    $name = str_in($in, 'name', 50);
    if ($name === '') fail('팀 이름을 입력해 주세요.');
    if ($id) {
        q('UPDATE in_teams SET name = ? WHERE id = ?', [$name, $id]);
    } else {
        $max = (int)q('SELECT COALESCE(MAX(sort_order), 0) FROM in_teams')->fetchColumn();
        q('INSERT INTO in_teams (name, sort_order) VALUES (?, ?)', [$name, $max + 1]);
        $id = (int)db()->lastInsertId();
    }
    return ['ok' => true, 'id' => $id, 'teams' => q('SELECT id, name FROM in_teams ORDER BY sort_order, id')->fetchAll()];
}

function api_team_delete(array $me, array $in): array
{
    if (!is_ceo($me)) fail('대표만 팀을 관리할 수 있어요.', 403);
    $id = int_in($in, 'id');
    if ((int)q("SELECT COUNT(*) FROM in_members WHERE team_id = ? AND status = 'active'", [$id])->fetchColumn() > 0) {
        fail('팀에 사람이 있으면 지울 수 없어요. 먼저 다른 팀으로 옮겨 주세요.');
    }
    q('DELETE FROM in_teams WHERE id = ?', [$id]);
    return ['ok' => true];
}

function api_noti_list(array $me, array $in): array
{
    $rows = q(
        'SELECT id, kind, title, body, link, UNIX_TIMESTAMP(created_at) AS ts, read_at IS NOT NULL AS is_read
           FROM in_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50',
        [$me['id']]
    )->fetchAll();
    return ['items' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'kind' => $r['kind'], 'title' => $r['title'], 'body' => $r['body'],
        'link' => $r['link'], 'ts' => (int)$r['ts'], 'read' => (bool)$r['is_read'],
    ], $rows)];
}

function api_noti_read(array $me, array $in): array
{
    q('UPDATE in_notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [$me['id']]);
    return ['ok' => true, 'badges' => badges($me)];
}
