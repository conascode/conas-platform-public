<?php
/*
 * 채팅방 메시지 조회
 *  c      : 채팅방 id
 *  before : 이 id보다 이전 메시지 (위로 스크롤해서 더 불러올 때)
 *
 * DM · 그룹방은 내가 들어온 뒤의 메시지만 보여줌 (나중에 초대된 사람, 나갔다 다시 온 사람)
 * 채널은 공개 대화방이라 이전 대화도 보여줌
 */
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';

$u = api_member();
$c = (int)($_GET['c'] ?? 0);
$before = (int)($_GET['before'] ?? 0);

$conv = chat_conversation($c, $u['id']);
if (!$conv) {
    json_out(['error' => '채팅방을 찾을 수 없어요.'], 404);
}

const PAGE = 50;
$out = [];

$where = 'm.conversation_id = ?';
$params = [$c];
if ($conv['type'] !== 'channel') {
    $where .= ' AND m.created_at >= ?';
    $params[] = $conv['joined_at'];
}

if ($before <= 0) {
    // 새 메시지 확인 기준점을 먼저 잡아야 그 사이 메시지를 놓치지 않음
    $out['since'] = (int)q('SELECT COALESCE(MAX(id), 0) FROM in_messages')->fetchColumn();
    $msgs = chat_fetch_messages($where, $params, 'DESC', PAGE);
    // 메시지별 안 읽은 사람 수 계산용: 참여자별 마지막으로 읽은 메시지 id
    $reads = [];
    foreach (q('SELECT user_id, last_read_message_id FROM in_conversation_members WHERE conversation_id = ?', [$c]) as $r) {
        $reads[(int)$r['user_id']] = (int)$r['last_read_message_id'];
    }
    $out['reads'] = (object)$reads;
} else {
    $msgs = chat_fetch_messages($where . ' AND m.id < ?', array_merge($params, [$before]), 'DESC', PAGE);
}

$out['messages'] = array_reverse($msgs);
$out['has_more'] = count($msgs) === PAGE;

json_out($out);
