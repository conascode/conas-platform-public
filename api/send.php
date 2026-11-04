<?php
/*
 * 메시지 보내기 (JSON)
 *  { c, body, cid(보낸 화면의 임시 id), files: [첨부 id...] }
 */
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';
require __DIR__ . '/../inc/push.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}
$u = api_member();
check_csrf();

$in = json_input();
$c = int_in($in, 'c');
$body = str_in($in, 'body', 5000);
$cid = substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string)($in['cid'] ?? '')) ?? '', 0, 40);
$fileIds = int_list_in($in, 'files', 10);

$conv = chat_conversation($c, $u['id']);
if (!$conv) {
    json_out(['error' => '채팅방을 찾을 수 없어요.'], 404);
}
if ($body === '' && !$fileIds) {
    json_out(['error' => '보낼 내용이 없어요.'], 400);
}

// 같은 임시 id로 이미 저장된 메시지가 있으면(재전송) 그대로 돌려줌
if ($cid !== '') {
    $dup = q('SELECT id FROM in_messages WHERE conversation_id = ? AND user_id = ? AND client_msg_id = ? LIMIT 1', [$c, $u['id'], $cid])->fetchColumn();
    if ($dup) {
        json_out(['message' => chat_fetch_messages('m.id = ?', [(int)$dup])[0] ?? null]);
    }
}

// 1:1 대화에서 상대가 나간 상태면 다시 넣어줌 (이전 대화는 안 보이고 이 메시지부터 보임)
if ($conv['type'] === 'dm') {
    chat_add_members($c, chat_dm_pair($conv));
}

$pdo = db();
$pdo->beginTransaction();
q('INSERT INTO in_messages (conversation_id, user_id, body, client_msg_id) VALUES (?, ?, ?, ?)', [$c, $u['id'], $body, $cid !== '' ? $cid : null]);
$mid = (int)$pdo->lastInsertId();
$claimed = att_claim($fileIds, $u['id'], 'message_id', $mid);
if ($body === '' && !$claimed) {
    $pdo->rollBack();
    json_out(['error' => '첨부파일을 찾을 수 없어요. 다시 올려주세요.'], 400);
}
q('UPDATE in_conversations SET last_message_id = ?, updated_at = NOW() WHERE id = ?', [$mid, $c]);
q('UPDATE in_conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?', [$mid, $c, $u['id']]);
$pdo->commit();

$msg = chat_fetch_messages('m.id = ?', [$mid])[0] ?? null;
json_send_and_continue(['message' => $msg]);

// 응답을 보낸 뒤: 채팅 화면을 보고 있지 않은 참여자에게 푸시 알림
$targets = q(
    "SELECT cm.user_id
       FROM in_conversation_members cm
       JOIN in_members m ON m.user_id = cm.user_id AND m.status = 'active'
      WHERE cm.conversation_id = ? AND cm.user_id <> ?
        AND (m.chat_active_at IS NULL OR m.chat_active_at < NOW() - INTERVAL 8 SECOND)",
    [$c, $u['id']]
)->fetchAll(PDO::FETCH_COLUMN);
if ($targets) {
    push_to_users($targets);
}
