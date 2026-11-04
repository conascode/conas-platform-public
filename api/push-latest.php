<?php
// 서비스 워커가 푸시를 받았을 때 알림에 표시할 최신 내용 (안 읽은 메시지 또는 앱 알림 중 더 최근 것)
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';

$u = api_member();

$m = q(
    'SELECT m.id, m.conversation_id, m.body, u.username, mm.display_name, UNIX_TIMESTAMP(m.created_at) AS ts,
            (SELECT COUNT(*) FROM in_attachments a WHERE a.message_id = m.id) AS files
       FROM in_messages m
       JOIN in_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN in_members mm ON mm.user_id = m.user_id
      WHERE m.id > cm.last_read_message_id AND (m.user_id IS NULL OR m.user_id <> ?)
      ORDER BY m.id DESC
      LIMIT 1',
    [$u['id'], $u['id']]
)->fetch();

$n = q(
    'SELECT id, title, body, link, UNIX_TIMESTAMP(created_at) AS ts
       FROM in_notifications
      WHERE user_id = ? AND read_at IS NULL AND created_at >= NOW() - INTERVAL 10 MINUTE
      ORDER BY id DESC LIMIT 1',
    [$u['id']]
)->fetch();

$notiUnread = (int)q('SELECT COUNT(*) FROM in_notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']])->fetchColumn();
$out = ['unread' => chat_unread_total($u['id']) + $notiUnread, 'message' => null];

if ($n && (!$m || (int)$n['ts'] >= (int)$m['ts'])) {
    $out['message'] = [
        'id' => (int)$n['id'],
        'c' => 'n' . (int)$n['id'],
        'title' => $n['title'],
        'body' => (string)$n['body'],
        'url' => url('') . '#' . ($n['link'] ?: '/home'),
    ];
} elseif ($m) {
    $cid = (int)$m['conversation_id'];
    $conv = chat_conversation($cid, $u['id']);
    $members = chat_members([$cid])[$cid] ?? [];
    $sender = user_label($m);
    $multi = $conv && $conv['type'] !== 'dm';
    $title = $conv ? chat_title($conv, $members, $u['id']) : $sender;
    if ($conv && $conv['type'] === 'channel') $title = '#' . $conv['name'];
    $out['message'] = [
        'id' => (int)$m['id'],
        'c' => $cid,
        'title' => $multi ? $title : $sender,
        'body' => ($multi ? $sender . ': ' : '') . chat_preview($m['body'], (int)$m['files']),
        'url' => url('') . '#/chat/' . $cid,
    ];
}

json_out($out);
