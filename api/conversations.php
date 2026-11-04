<?php
// 내 채팅방 목록 (최근 대화 순)
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';

$u = api_member();

$rows = q(
    'SELECT c.id, c.type, c.name, c.last_message_id, UNIX_TIMESTAMP(c.updated_at) AS updated_ts,
            cm.last_read_message_id,
            lm.body AS last_body, lm.user_id AS last_uid, UNIX_TIMESTAMP(lm.created_at) AS last_ts,
            (SELECT COUNT(*) FROM in_attachments a WHERE a.message_id = lm.id) AS last_files,
            (SELECT COUNT(*) FROM in_messages x
              WHERE x.conversation_id = c.id AND x.id > cm.last_read_message_id
                AND (x.user_id IS NULL OR x.user_id <> ?)) AS unread
       FROM in_conversation_members cm
       JOIN in_conversations c ON c.id = cm.conversation_id
       LEFT JOIN in_messages lm ON lm.id = c.last_message_id
      WHERE cm.user_id = ?
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT 200',
    [$u['id'], $u['id']]
)->fetchAll();

$members = chat_members(array_map(fn($r) => (int)$r['id'], $rows));

$list = [];
foreach ($rows as $r) {
    $cid = (int)$r['id'];
    $mem = $members[$cid] ?? [];
    // 1:1 채팅은 상대방 프로필 사진
    $av = null;
    if ($r['type'] === 'dm') {
        foreach ($mem as $mm) {
            if ($mm['id'] !== $u['id']) {
                $av = $mm['av'];
                break;
            }
        }
    }
    $list[] = [
        'av' => $av,
        'id' => $cid,
        'type' => $r['type'],
        'title' => chat_title($r, $mem, $u['id']),
        'member_count' => count($mem),
        'preview' => $r['last_message_id'] ? chat_preview($r['last_body'], (int)$r['last_files']) : '',
        'last_mine' => $r['last_uid'] !== null && (int)$r['last_uid'] === $u['id'],
        'ts' => (int)($r['last_ts'] ?: $r['updated_ts']),
        'unread' => (int)$r['unread'],
    ];
}

json_out(['conversations' => $list, 'unread' => array_sum(array_column($list, 'unread'))]);
