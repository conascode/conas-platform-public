<?php
defined('IN_APP') or exit;

/*
 * 채널(공개 대화방) · DM(1:1, 단체)
 * 메시지 조회/보내기/읽음/새 메시지 확인은 기존 API를 그대로 씀
 *   api/messages.php, api/send.php, api/read.php, api/poll.php, api/upload.php
 *
 * DB를 바꾸지 않고 처리하는 규칙
 *   - 단체 DM = in_conversations.type 'group'
 *   - 초대 · 다시 들어온 사람은 joined_at 이후 메시지만 봄
 *   - 안내 메시지(초대, 나감)는 client_msg_id 'sys:…' 로 구분
 */
require_once __DIR__ . '/../chat.php';

const GROUP_MAX = 50;

function api_chats(array $me, array $in): array
{
    $uid = $me['id'];
    $rows = q(
        'SELECT c.id, c.type, c.name, c.description, c.dm_key, c.last_message_id, UNIX_TIMESTAMP(c.updated_at) AS updated_ts,
                cm.last_read_message_id, cm.user_id IS NOT NULL AS joined,
                lm.body AS last_body, lm.user_id AS last_uid, lm.client_msg_id AS last_cid, UNIX_TIMESTAMP(lm.created_at) AS last_ts,
                (lm.created_at >= cm.joined_at OR c.type = \'channel\') AS last_visible,
                (SELECT COUNT(*) FROM in_attachments a WHERE a.message_id = lm.id) AS last_files,
                (SELECT COUNT(*) FROM in_conversation_members x WHERE x.conversation_id = c.id) AS member_count,
                IF(cm.user_id IS NULL, 0, (SELECT COUNT(*) FROM in_messages x
                  WHERE x.conversation_id = c.id AND x.id > cm.last_read_message_id
                    AND (x.user_id IS NULL OR x.user_id <> ?))) AS unread
           FROM in_conversations c
           LEFT JOIN in_conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
           LEFT JOIN in_messages lm ON lm.id = c.last_message_id
          WHERE c.type = \'channel\' OR cm.user_id IS NOT NULL
          ORDER BY c.updated_at DESC, c.id DESC
          LIMIT 300',
        [$uid, $uid]
    )->fetchAll();

    $memberIds = array_values(array_map(fn($r) => (int)$r['id'], array_filter($rows, fn($r) => $r['type'] !== 'channel')));
    $members = chat_members($memberIds);

    $channels = [];
    $dms = [];
    foreach ($rows as $r) {
        $cid = (int)$r['id'];
        $hasLast = $r['last_message_id'] && $r['last_visible'];
        $isSys = str_starts_with((string)$r['last_cid'], 'sys:');
        $preview = $hasLast ? chat_preview($r['last_body'], (int)$r['last_files']) : '';
        $base = [
            'id' => $cid,
            'type' => $r['type'],
            'preview' => $preview,
            'last_name' => $hasLast && $r['last_uid'] && !$isSys ? org_name((int)$r['last_uid']) : '',
            'last_mine' => $hasLast && !$isSys && $r['last_uid'] !== null && (int)$r['last_uid'] === $uid,
            'ts' => (int)($hasLast ? $r['last_ts'] : $r['updated_ts']),
            'unread' => (int)$r['unread'],
        ];
        if ($r['type'] === 'channel') {
            $channels[] = $base + [
                'name' => (string)$r['name'],
                'description' => $r['description'],
                'joined' => (bool)$r['joined'],
                'member_count' => (int)$r['member_count'],
            ];
            continue;
        }
        $mem = $members[$cid] ?? [];
        $others = array_values(array_filter($mem, fn($mm) => $mm['id'] !== $uid));
        $other = $others[0] ?? null;
        $isDm = $r['type'] === 'dm';
        $title = chat_title($r, $mem, $uid);
        if ($isDm && !$other) {
            // 상대가 나간 1:1 방
            foreach (chat_dm_pair($r) as $pid) {
                if ($pid !== $uid && ($pm = org_member($pid))) {
                    $other = ['id' => $pid, 'av' => avatar_url($pid, $pm['avatar'])];
                    $title = $pm['name'];
                }
            }
        }
        $om = $other ? org_member($other['id']) : null;
        $dms[] = $base + [
            'title' => $title,
            'other_id' => $isDm && $other ? $other['id'] : null,
            'av' => $isDm && $other ? $other['av'] : null,
            // 단체방 사진: 나를 뺀 앞의 4명
            'avs' => $isDm ? [] : array_map(fn($m) => ['name' => $m['name'], 'av' => $m['av']], array_slice($others, 0, 4)),
            'online' => $isDm && $om ? (bool)$om['online'] : false,
            'sub' => $isDm && $om ? trim(($om['team_name'] ?? '') . ' · ' . ($om['position'] ?: ROLE_LABEL[$om['role']]), ' ·') : '',
            'member_count' => count($mem),
        ];
    }
    // 채널: 참여 중인 것 먼저
    usort($channels, fn($a, $b) => [$b['joined'], $b['ts']] <=> [$a['joined'], $a['ts']]);
    return ['channels' => $channels, 'dms' => $dms];
}

/** 대화방 머리글 정보 (참여 전 채널도 볼 수 있음) */
function api_chat_info(array $me, array $in): array
{
    $c = int_in($in, 'c');
    $conv = q('SELECT * FROM in_conversations WHERE id = ?', [$c])->fetch();
    $joined = (bool)q('SELECT 1 FROM in_conversation_members WHERE conversation_id = ? AND user_id = ?', [$c, $me['id']])->fetchColumn();
    if (!$conv || (!$joined && $conv['type'] !== 'channel')) fail('대화방을 찾을 수 없어요.', 404);
    $mem = chat_members([$c])[$c] ?? [];
    $people = array_map(function ($mm) {
        $om = org_member($mm['id']);
        return $om ? member_public($om) : ['id' => $mm['id'], 'name' => $mm['name'], 'av' => $mm['av'], 'role' => null, 'gone' => true];
    }, $mem);
    $other = null;
    if ($conv['type'] === 'dm') {
        foreach ($people as $p) {
            if ($p['id'] !== $me['id']) {
                $other = $p;
                break;
            }
        }
        // 상대가 나간 1:1 방: 상대 정보는 dm_key로 찾음
        if (!$other) {
            foreach (chat_dm_pair($conv) as $pid) {
                if ($pid !== $me['id'] && ($om = org_member($pid))) $other = member_public($om) + ['left' => true];
            }
        }
    }
    return [
        'id' => (int)$conv['id'],
        'type' => $conv['type'],
        'name' => (string)$conv['name'],
        'title' => $conv['type'] === 'channel' ? (string)$conv['name'] : ($other ? $other['name'] : chat_title($conv, $mem, $me['id'])),
        'description' => $conv['description'],
        'joined' => $joined,
        'members' => $people,
        'other' => $other,
        'can_edit' => $conv['type'] === 'channel' ? ((int)$conv['created_by'] === $me['id'] || $me['is_admin']) : $conv['type'] === 'group',
        'can_invite' => $joined && $conv['type'] !== 'channel',
    ];
}

/** 1:1 대화방 열기 (없으면 만들기, 내가 나갔던 방이면 다시 들어감) */
function api_chat_dm(array $me, array $in): array
{
    $other = int_in($in, 'user_id');
    if (!org_member($other)) fail('대화할 수 없는 사람이에요.', 404);
    $key = min($me['id'], $other) . ':' . max($me['id'], $other);
    $cid = (int)q('SELECT id FROM in_conversations WHERE dm_key = ?', [$key])->fetchColumn();
    if ($cid) {
        chat_add_members($cid, [$me['id']]);
        return ['c' => $cid];
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        q("INSERT INTO in_conversations (type, dm_key, created_by) VALUES ('dm', ?, ?)", [$key, $me['id']]);
        $cid = (int)$pdo->lastInsertId();
        if ($other === $me['id']) {
            q('INSERT INTO in_conversation_members (conversation_id, user_id) VALUES (?, ?)', [$cid, $me['id']]);
        } else {
            q('INSERT INTO in_conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)', [$cid, $me['id'], $cid, $other]);
        }
        $pdo->commit();
    } catch (PDOException $ex) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $cid = (int)q('SELECT id FROM in_conversations WHERE dm_key = ?', [$key])->fetchColumn();
        if (!$cid) throw $ex;
        chat_add_members($cid, [$me['id']]);
    }
    return ['c' => $cid];
}

/** 초대할 수 있는 사람만 남김 (승인된 직원, 나 제외) */
function chat_pick_people(array $me, array $ids): array
{
    return array_values(array_filter($ids, fn($id) => $id !== $me['id'] && org_member($id)));
}

function chat_names(array $ids): string
{
    $names = array_map(fn($id) => org_name($id) . '님', $ids);
    return implode(', ', $names);
}

/** 단체 DM 만들기 { user_ids: [..], name? } — 한 명만 고르면 1:1 대화로 */
function api_chat_group(array $me, array $in): array
{
    $ids = chat_pick_people($me, int_list_in($in, 'user_ids', GROUP_MAX));
    if (!$ids) fail('대화할 사람을 골라 주세요.');
    if (count($ids) === 1) return api_chat_dm($me, ['user_id' => $ids[0]]);
    return ['c' => chat_create_group($me, $ids, str_in($in, 'name', 100))];
}

function chat_create_group(array $me, array $ids, string $name = ''): int
{
    $pdo = db();
    $pdo->beginTransaction();
    q("INSERT INTO in_conversations (type, name, created_by) VALUES ('group', ?, ?)", [$name !== '' ? $name : null, $me['id']]);
    $cid = (int)$pdo->lastInsertId();
    chat_add_members($cid, array_merge([$me['id']], $ids));
    chat_system_message($cid, $me['id'], $me['name'] . '님이 ' . chat_names($ids) . '을 초대했어요');
    $pdo->commit();
    return $cid;
}

/**
 * 초대 { c, user_ids }
 *  단체방: 그 방에 추가 (초대된 사람은 이전 대화를 볼 수 없음)
 *  1:1 방: 두 사람 + 초대한 사람으로 새 단체방을 만듦
 */
function api_chat_invite(array $me, array $in): array
{
    $c = int_in($in, 'c');
    $conv = chat_conversation($c, $me['id']);
    if (!$conv) fail('대화방을 찾을 수 없어요.', 404);
    if ($conv['type'] === 'channel') fail('채널은 누구나 직접 참여할 수 있어요.');
    $ids = chat_pick_people($me, int_list_in($in, 'user_ids', GROUP_MAX));
    $current = array_map(fn($m) => $m['id'], chat_members([$c])[$c] ?? []);
    $ids = array_values(array_diff($ids, $current));
    if (!$ids) fail('초대할 사람을 골라 주세요.');

    if ($conv['type'] === 'dm') {
        $base = array_values(array_diff(chat_dm_pair($conv), [$me['id']]));
        $base = chat_pick_people($me, $base);
        return ['c' => chat_create_group($me, array_values(array_unique(array_merge($base, $ids)))), 'new' => true];
    }
    if (count($current) + count($ids) > GROUP_MAX) fail('단체 대화는 최대 ' . GROUP_MAX . '명까지예요.');
    $pdo = db();
    $pdo->beginTransaction();
    $added = chat_add_members($c, $ids);
    if ($added) chat_system_message($c, $me['id'], $me['name'] . '님이 ' . chat_names($added) . '을 초대했어요');
    $pdo->commit();
    return ['c' => $c, 'new' => false];
}

/** 단체방 이름 바꾸기 (참여자 누구나) */
function api_chat_rename(array $me, array $in): array
{
    $c = int_in($in, 'c');
    $conv = chat_conversation($c, $me['id']);
    if (!$conv || $conv['type'] !== 'group') fail('대화방을 찾을 수 없어요.', 404);
    $name = str_in($in, 'name', 100);
    q('UPDATE in_conversations SET name = ? WHERE id = ?', [$name !== '' ? $name : null, $c]);
    chat_system_message($c, $me['id'], $name !== '' ? $me['name'] . "님이 방 이름을 '$name'(으)로 바꿨어요" : $me['name'] . '님이 방 이름을 지웠어요');
    return ['ok' => true];
}

function api_chat_join(array $me, array $in): array
{
    $c = int_in($in, 'c');
    $conv = q("SELECT id, last_message_id FROM in_conversations WHERE id = ? AND type = 'channel'", [$c])->fetch();
    if (!$conv) fail('채널을 찾을 수 없어요.', 404);
    q(
        'INSERT IGNORE INTO in_conversation_members (conversation_id, user_id, last_read_message_id) VALUES (?, ?, ?)',
        [$c, $me['id'], (int)$conv['last_message_id']]
    );
    return ['ok' => true];
}

/**
 * 나가기
 *  채널: 언제든 다시 참여 가능
 *  단체방: 다시 초대받으면 그 뒤 대화부터 보임
 *  1:1: 내 목록에서만 사라짐. 상대 방은 그대로. 다시 대화하면 그 뒤 메시지부터 보임
 */
function api_chat_leave(array $me, array $in): array
{
    $c = int_in($in, 'c');
    $conv = chat_conversation($c, $me['id']);
    if (!$conv) fail('대화방을 찾을 수 없어요.', 404);
    $pdo = db();
    $pdo->beginTransaction();
    if ($conv['type'] !== 'channel') {
        chat_system_message($c, $me['id'], $me['name'] . '님이 나갔어요');
    }
    q('DELETE FROM in_conversation_members WHERE conversation_id = ? AND user_id = ?', [$c, $me['id']]);
    $pdo->commit();
    return ['ok' => true];
}

/** 채널 만들기 · 이름/설명 바꾸기 */
function api_channel_save(array $me, array $in): array
{
    $id = int_in($in, 'id');
    $name = str_in($in, 'name', 50);
    $name = ltrim($name, '# ');
    if ($name === '') fail('채널 이름을 입력해 주세요.');
    $desc = str_in($in, 'description', 255);
    if ($id) {
        $conv = q("SELECT * FROM in_conversations WHERE id = ? AND type = 'channel'", [$id])->fetch();
        if (!$conv) fail('채널을 찾을 수 없어요.', 404);
        if ((int)$conv['created_by'] !== $me['id'] && !$me['is_admin']) fail('채널을 만든 사람이나 관리자만 바꿀 수 있어요.', 403);
        q('UPDATE in_conversations SET name = ?, description = ? WHERE id = ?', [$name, $desc !== '' ? $desc : null, $id]);
        return ['ok' => true, 'c' => $id];
    }
    if (q("SELECT 1 FROM in_conversations WHERE type = 'channel' AND name = ?", [$name])->fetchColumn()) {
        fail('같은 이름의 채널이 있어요.');
    }
    $pdo = db();
    $pdo->beginTransaction();
    q("INSERT INTO in_conversations (type, name, description, created_by) VALUES ('channel', ?, ?, ?)", [$name, $desc !== '' ? $desc : null, $me['id']]);
    $cid = (int)$pdo->lastInsertId();
    q('INSERT INTO in_conversation_members (conversation_id, user_id) VALUES (?, ?)', [$cid, $me['id']]);
    $pdo->commit();
    return ['ok' => true, 'c' => $cid];
}
