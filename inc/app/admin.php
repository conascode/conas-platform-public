<?php
defined('IN_APP') or exit;

/* 사내 관리자(is_admin): 가입 승인 · 이용 중지 · 관리자 지정 · 게시판 설정 */

function require_admin_me(array $me): void
{
    if (!$me['is_admin']) fail('관리자만 이용할 수 있어요.', 403);
}

function api_admin_members(array $me, array $in): array
{
    require_admin_me($me);
    $rows = q(
        'SELECT u.id, u.username, u.email, m.display_name, m.avatar, m.status, m.is_admin, m.role,
                UNIX_TIMESTAMP(m.created_at) AS created_ts, UNIX_TIMESTAMP(m.last_seen_at) AS seen_ts
           FROM in_members m JOIN users u ON u.id = m.user_id
          ORDER BY FIELD(m.status, \'pending\', \'active\', \'disabled\'), m.created_at DESC
          LIMIT 500'
    )->fetchAll();
    return ['members' => array_map(fn($r) => [
        'id' => (int)$r['id'],
        'name' => user_label($r),
        'username' => $r['username'],
        'email' => $r['email'],
        'av' => avatar_url((int)$r['id'], $r['avatar']),
        'status' => $r['status'],
        'is_admin' => (bool)$r['is_admin'],
        'role' => $r['role'],
        'created_ts' => (int)$r['created_ts'],
        'seen_ts' => $r['seen_ts'] ? (int)$r['seen_ts'] : null,
    ], $rows)];
}

function api_admin_member(array $me, array $in): array
{
    require_admin_me($me);
    $id = int_in($in, 'user_id');
    $action = (string)($in['action'] ?? '');
    $row = q('SELECT user_id, status, is_admin, role FROM in_members WHERE user_id = ?', [$id])->fetch();
    if (!$row) fail('회원을 찾을 수 없어요.', 404);
    if ($id === $me['id'] && in_array($action, ['disable', 'revoke_admin'], true)) {
        fail('내 계정은 중지하거나 관리자 권한을 해제할 수 없어요.');
    }
    if ($row['role'] === 'ceo' && $action === 'disable') fail('대표 계정은 중지할 수 없어요.');

    switch ($action) {
        case 'approve':
        case 'enable':
            // 채널에는 자동으로 넣지 않음: 필요한 채널은 본인이 '참여하기'로 들어감
            q("UPDATE in_members SET status = 'active' WHERE user_id = ?", [$id]);
            break;
        case 'disable':
            q("UPDATE in_members SET status = 'disabled' WHERE user_id = ?", [$id]);
            q('DELETE FROM in_remember_tokens WHERE user_id = ?', [$id]);
            q('DELETE FROM in_push_subscriptions WHERE user_id = ?', [$id]);
            break;
        case 'make_admin':
            q('UPDATE in_members SET is_admin = 1 WHERE user_id = ?', [$id]);
            break;
        case 'revoke_admin':
            q('UPDATE in_members SET is_admin = 0 WHERE user_id = ?', [$id]);
            break;
        default:
            fail('알 수 없는 작업이에요.');
    }
    return api_admin_members($me, []) + ['ok' => true];
}

function api_admin_boards(array $me, array $in): array
{
    require_admin_me($me);
    $rows = q(
        'SELECT b.*, (SELECT COUNT(*) FROM in_posts p WHERE p.board_id = b.id AND p.deleted_at IS NULL) AS post_count
           FROM in_boards b ORDER BY b.sort_order, b.id'
    )->fetchAll();
    return ['boards' => array_map(fn($b) => [
        'id' => (int)$b['id'],
        'slug' => $b['slug'],
        'name' => $b['name'],
        'description' => $b['description'],
        'anonymous' => (bool)$b['is_anonymous'],
        'write_role' => $b['write_role'],
        'allow_comments' => (bool)$b['allow_comments'],
        'allow_attachments' => (bool)$b['allow_attachments'],
        'visible' => (bool)$b['is_visible'],
        'sort_order' => (int)$b['sort_order'],
        'post_count' => (int)$b['post_count'],
    ], $rows)];
}

/** 게시판 추가 · 수정. 익명/실명 설정은 새 글부터 적용 */
function api_admin_board(array $me, array $in): array
{
    require_admin_me($me);
    $id = int_in($in, 'id');
    $name = str_in($in, 'name', 50);
    if ($name === '') fail('게시판 이름을 입력해 주세요.');
    $desc = str_in($in, 'description', 255);
    $anon = bool_in($in, 'anonymous') ? 1 : 0;
    $writeRole = ($in['write_role'] ?? 'user') === 'admin' ? 'admin' : 'user';
    $comments = bool_in($in, 'allow_comments') ? 1 : 0;
    $files = bool_in($in, 'allow_attachments') ? 1 : 0;
    $visible = bool_in($in, 'visible') ? 1 : 0;

    if ($id) {
        if (!board_by_id($id)) fail('게시판을 찾을 수 없어요.', 404);
        q(
            'UPDATE in_boards SET name = ?, description = ?, is_anonymous = ?, write_role = ?, allow_comments = ?, allow_attachments = ?, is_visible = ? WHERE id = ?',
            [$name, $desc !== '' ? $desc : null, $anon, $writeRole, $comments, $files, $visible, $id]
        );
    } else {
        $slug = 'b' . bin2hex(random_bytes(4));
        $max = (int)q('SELECT COALESCE(MAX(sort_order), 0) FROM in_boards')->fetchColumn();
        q(
            'INSERT INTO in_boards (slug, name, description, is_anonymous, write_role, allow_comments, allow_attachments, is_visible, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$slug, $name, $desc !== '' ? $desc : null, $anon, $writeRole, $comments, $files, $visible, $max + 1]
        );
    }
    return api_admin_boards($me, []) + ['ok' => true];
}
