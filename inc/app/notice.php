<?php
defined('IN_APP') or exit;

/* 공지: 필독(must_confirm)은 '확인했어요'를 눌러야 하고, 누가 확인했는지 보임. 대표는 확인 대상이 아님 */
require_once __DIR__ . '/people.php';

const NOTICE_CATEGORIES = ['일반', '인사', '총무', '행사'];

/** 확인 대상 인원 (대표 제외 활성 회원) */
function notice_staff_ids(): array
{
    return array_values(array_map(fn($m) => $m['id'], array_filter(org_members(), fn($m) => $m['role'] !== 'ceo')));
}

function notice_list(array $me): array
{
    $rows = q(
        'SELECT n.id, n.category, n.title, n.body, n.must_confirm, n.user_id, UNIX_TIMESTAMP(n.created_at) AS ts,
                r.read_at, r.confirmed_at,
                (SELECT COUNT(*) FROM in_notice_reads x WHERE x.notice_id = n.id AND x.confirmed_at IS NOT NULL) AS confirmed
           FROM in_notices n
           LEFT JOIN in_notice_reads r ON r.notice_id = n.id AND r.user_id = ?
          WHERE n.deleted_at IS NULL
          ORDER BY n.id DESC
          LIMIT 100',
        [$me['id']]
    )->fetchAll();
    $staff = count(notice_staff_ids());
    $list = array_map(fn($n) => notice_public($n, $me, $staff), $rows);
    // 확인이 필요한 필독 공지를 맨 위로
    usort($list, fn($a, $b) => [$b['need_confirm'], $b['id']] <=> [$a['need_confirm'], $a['id']]);
    return $list;
}

function notice_public(array $n, array $me, int $staff): array
{
    $must = (bool)$n['must_confirm'];
    $isCeo = is_ceo($me);
    return [
        'id' => (int)$n['id'],
        'category' => $n['category'],
        'title' => $n['title'],
        'preview' => mb_strimwidth(preg_replace('/\s+/u', ' ', $n['body']) ?? '', 0, 90, '…'),
        'must' => $must,
        'author' => org_name($n['user_id'] === null ? null : (int)$n['user_id']),
        'ts' => (int)$n['ts'],
        'read' => $isCeo || $n['read_at'] !== null || (int)$n['user_id'] === $me['id'],
        'confirmed' => $n['confirmed_at'] !== null,
        'need_confirm' => $must && !$isCeo && $n['confirmed_at'] === null,
        'confirm_count' => (int)$n['confirmed'],
        'staff_count' => $staff,
    ];
}

function api_notices(array $me, array $in): array
{
    return [
        'notices' => notice_list($me),
        'categories' => NOTICE_CATEGORIES,
        'can_write' => can_manage_company($me),
        'badges' => badges($me),
    ];
}

function api_notice(array $me, array $in): array
{
    $id = int_in($in, 'id');
    $n = q('SELECT * FROM in_notices WHERE id = ? AND deleted_at IS NULL', [$id])->fetch();
    if (!$n) fail('공지를 찾을 수 없어요.', 404);
    q('INSERT IGNORE INTO in_notice_reads (notice_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
    $r = q('SELECT read_at, confirmed_at FROM in_notice_reads WHERE notice_id = ? AND user_id = ?', [$id, $me['id']])->fetch();
    $confirmedIds = array_map('intval', q('SELECT user_id FROM in_notice_reads WHERE notice_id = ? AND confirmed_at IS NOT NULL', [$id])->fetchAll(PDO::FETCH_COLUMN));
    $staff = notice_staff_ids();
    $n['ts'] = strtotime($n['created_at']);
    $n['read_at'] = $r['read_at'];
    $n['confirmed_at'] = $r['confirmed_at'];
    $n['confirmed'] = count(array_intersect($staff, $confirmedIds));
    return [
        'notice' => notice_public($n, $me, count($staff)) + [
            'body' => $n['body'],
            'confirmed_names' => array_values(array_map('org_name', array_intersect($staff, $confirmedIds))),
            'pending_names' => array_values(array_map('org_name', array_diff($staff, $confirmedIds))),
            'can_edit' => can_manage_company($me),
        ],
        'badges' => badges($me),
    ];
}

function api_notice_confirm(array $me, array $in): array
{
    $id = int_in($in, 'id');
    if (!q('SELECT 1 FROM in_notices WHERE id = ? AND deleted_at IS NULL AND must_confirm = 1', [$id])->fetchColumn()) fail('공지를 찾을 수 없어요.', 404);
    q(
        'INSERT INTO in_notice_reads (notice_id, user_id, confirmed_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE confirmed_at = COALESCE(confirmed_at, NOW())',
        [$id, $me['id']]
    );
    return api_notice($me, ['id' => $id]);
}

function api_notice_save(array $me, array $in): array
{
    if (!can_manage_company($me)) fail('대표나 관리자만 공지를 쓸 수 있어요.', 403);
    $id = int_in($in, 'id');
    $cat = in_array($in['category'] ?? '', NOTICE_CATEGORIES, true) ? $in['category'] : '일반';
    $title = str_in($in, 'title', 200);
    $body = str_in($in, 'body', 20000);
    if ($title === '' || $body === '') fail('제목과 내용을 입력해 주세요.');
    $must = bool_in($in, 'must') ? 1 : 0;
    if ($id) {
        q('UPDATE in_notices SET category = ?, title = ?, body = ?, must_confirm = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL', [$cat, $title, $body, $must, $id]);
        return ['ok' => true, 'id' => $id];
    }
    q('INSERT INTO in_notices (category, title, body, must_confirm, user_id) VALUES (?, ?, ?, ?, ?)', [$cat, $title, $body, $must, $me['id']]);
    $id = (int)db()->lastInsertId();
    $others = array_values(array_filter(array_keys(org_members()), fn($x) => $x !== $me['id']));
    notify($others, 'notice', $must ? '필독 공지가 올라왔어요' : '새 공지가 올라왔어요', $title, '/ws/notice/' . $id);
    return ['ok' => true, 'id' => $id];
}

function api_notice_delete(array $me, array $in): array
{
    if (!can_manage_company($me)) fail('대표나 관리자만 지울 수 있어요.', 403);
    q('UPDATE in_notices SET deleted_at = NOW() WHERE id = ?', [int_in($in, 'id')]);
    return ['ok' => true];
}
