<?php
defined('IN_APP') or exit;

require_once __DIR__ . '/attachments.php';

/** 내가 속한 채팅방이면 방 정보, 아니면 null */
function chat_conversation(int $convId, int $userId): ?array
{
    $c = q(
        'SELECT c.*, cm.last_read_message_id, cm.joined_at
           FROM in_conversations c
           JOIN in_conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
          WHERE c.id = ?',
        [$userId, $convId]
    )->fetch();
    return $c ?: null;
}

/** 방 id => [회원 목록] */
function chat_members(array $convIds): array
{
    if (!$convIds) return [];
    $convIds = array_values($convIds);
    $out = [];
    $rows = q(
        'SELECT cm.conversation_id, cm.user_id, cm.last_read_message_id, u.username, m.display_name, m.avatar, m.status
           FROM in_conversation_members cm
           JOIN users u ON u.id = cm.user_id
           LEFT JOIN in_members m ON m.user_id = cm.user_id
          WHERE cm.conversation_id IN (' . in_list($convIds) . ')
          ORDER BY cm.joined_at, cm.user_id',
        $convIds
    );
    foreach ($rows as $r) {
        $out[(int)$r['conversation_id']][] = [
            'id' => (int)$r['user_id'],
            'name' => user_label($r),
            'avatar' => $r['avatar'],
            'av' => avatar_url((int)$r['user_id'], $r['avatar']),
            'active' => $r['status'] === 'active',
            'last_read' => (int)$r['last_read_message_id'],
        ];
    }
    return $out;
}

/** 방 이름: 그룹 이름이 있으면 그것, 없으면 나를 뺀 참여자 이름 */
function chat_title(array $conv, array $members, int $meId): string
{
    if ($conv['type'] === 'group' && trim((string)$conv['name']) !== '') {
        return (string)$conv['name'];
    }
    $names = [];
    foreach ($members as $m) {
        if ($m['id'] !== $meId) {
            $names[] = $m['name'] . ($m['active'] ? '' : ' (중지됨)');
        }
    }
    if (!$names) {
        return $conv['type'] === 'dm' ? '나와의 채팅' : '(참여자 없음)';
    }
    return implode(', ', $names);
}

/** 메시지 목록 조회 후 JSON용 배열로 변환 */
function chat_fetch_messages(string $where, array $params, string $order = 'ASC', int $limit = 50): array
{
    $order = $order === 'DESC' ? 'DESC' : 'ASC';
    $rows = q(
        "SELECT m.id, m.conversation_id, m.user_id, m.body, m.client_msg_id, UNIX_TIMESTAMP(m.created_at) AS ts,
                u.username, mm.display_name, mm.avatar
           FROM in_messages m
           LEFT JOIN users u ON u.id = m.user_id
           LEFT JOIN in_members mm ON mm.user_id = m.user_id
          WHERE $where
          ORDER BY m.id $order
          LIMIT " . (int)$limit,
        $params
    )->fetchAll();

    $atts = att_for_messages(array_map(fn($r) => (int)$r['id'], $rows));
    $out = [];
    foreach ($rows as $r) {
        $id = (int)$r['id'];
        $out[] = [
            'id' => $id,
            'c' => (int)$r['conversation_id'],
            'uid' => $r['user_id'] === null ? null : (int)$r['user_id'],
            'name' => user_label($r),
            'av' => $r['user_id'] === null ? null : avatar_url((int)$r['user_id'], $r['avatar']),
            'body' => $r['body'],
            'cid' => $r['client_msg_id'],
            'ts' => (int)$r['ts'],
            'files' => $atts[$id] ?? [],
            'sys' => str_starts_with((string)$r['client_msg_id'], 'sys:'),
        ];
    }
    return $out;
}

/**
 * 안내 메시지 ("OO님이 나갔어요" 등)
 * DB를 바꾸지 않으려고 client_msg_id 앞에 'sys:'를 붙여 일반 메시지와 구분함
 */
function chat_system_message(int $convId, int $actorId, string $body): int
{
    q(
        'INSERT INTO in_messages (conversation_id, user_id, body, client_msg_id) VALUES (?, ?, ?, ?)',
        [$convId, $actorId, $body, 'sys:' . bin2hex(random_bytes(8))]
    );
    $mid = (int)db()->lastInsertId();
    q('UPDATE in_conversations SET last_message_id = ?, updated_at = NOW() WHERE id = ?', [$mid, $convId]);
    q('UPDATE in_conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?', [$mid, $convId, $actorId]);
    return $mid;
}

/**
 * 대화방에 사람 넣기. 들어온 시점 이전 메시지는 보이지 않음 (joined_at 기준)
 * 이미 들어와 있으면 그대로 둠. 실제로 새로 들어온 사람 id 목록을 돌려줌
 */
function chat_add_members(int $convId, array $userIds): array
{
    $last = (int)q('SELECT COALESCE(last_message_id, 0) FROM in_conversations WHERE id = ?', [$convId])->fetchColumn();
    $added = [];
    foreach ($userIds as $uid) {
        $n = q(
            'INSERT IGNORE INTO in_conversation_members (conversation_id, user_id, last_read_message_id, joined_at) VALUES (?, ?, ?, NOW())',
            [$convId, (int)$uid, $last]
        )->rowCount();
        if ($n) $added[] = (int)$uid;
    }
    return $added;
}

/** 1:1 방이면 두 사람 id */
function chat_dm_pair(array $conv): array
{
    if (($conv['type'] ?? '') !== 'dm' || !$conv['dm_key']) return [];
    return array_values(array_unique(array_map('intval', explode(':', (string)$conv['dm_key']))));
}

function chat_unread_total(int $userId): int
{
    return (int)q(
        'SELECT COUNT(*) FROM in_messages m
           JOIN in_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
          WHERE m.id > cm.last_read_message_id AND (m.user_id IS NULL OR m.user_id <> ?)',
        [$userId, $userId]
    )->fetchColumn();
}

function chat_preview(?string $body, int $fileCount): string
{
    $body = trim((string)$body);
    if ($body !== '') {
        return mb_strimwidth(preg_replace('/\s+/u', ' ', $body) ?? '', 0, 80, '…');
    }
    return $fileCount > 0 ? '📎 파일 ' . $fileCount . '개' : '';
}
