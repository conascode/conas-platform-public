<?php
/*
 * 새 화면(한 페이지 앱)이 쓰는 API
 *   GET  api/app.php?a=이름&...      → 조회
 *   POST api/app.php?a=이름 (JSON)   → 변경 (CSRF 토큰 필요)
 * 응답: JSON. 실패하면 { error: '사용자에게 보여줄 메시지' }
 */
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/org.php';
require __DIR__ . '/../inc/attachments.php';

// 예상 못 한 오류도 화면이 읽을 수 있는 JSON으로 (자세한 내용은 서버 오류 로그에만)
set_exception_handler(function (Throwable $e) {
    error_log('[api/app.php] ' . $e);
    if (!headers_sent()) {
        json_out(['error' => '서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.'], 500);
    }
});

$routes = [
    // 기본 · 사람
    'bootstrap'      => ['GET',  'people'],
    'badges'         => ['GET',  'people'],
    'me.password'    => ['POST', 'people'],
    'me.update'      => ['POST', 'people'],
    'member.update'  => ['POST', 'people'],
    'team.save'      => ['POST', 'people'],
    'team.delete'    => ['POST', 'people'],
    'noti.list'      => ['GET',  'people'],
    'noti.read'      => ['POST', 'people'],
    // 관리자
    'admin.members'  => ['GET',  'admin'],
    'admin.member'   => ['POST', 'admin'],
    'admin.boards'   => ['GET',  'admin'],
    'admin.board'    => ['POST', 'admin'],
    // 게시판
    'posts'          => ['GET',  'board'],
    'post'           => ['GET',  'board'],
    'post.save'      => ['POST', 'board'],
    'post.delete'    => ['POST', 'board'],
    'post.like'      => ['POST', 'board'],
    'comment.add'    => ['POST', 'board'],
    'comment.delete' => ['POST', 'board'],
    'comment.like'   => ['POST', 'board'],
    // 채널 · DM
    'chats'          => ['GET',  'chat'],
    'chat.info'      => ['GET',  'chat'],
    'chat.dm'        => ['POST', 'chat'],
    'chat.join'      => ['POST', 'chat'],
    'chat.leave'     => ['POST', 'chat'],
    'chat.kick'      => ['POST', 'chat'],
    'msg.react'      => ['POST', 'chat'],
    'msg.delete'     => ['POST', 'chat'],
    'chat.group'     => ['POST', 'chat'],
    'chat.invite'    => ['POST', 'chat'],
    'chat.rename'    => ['POST', 'chat'],
    'channel.save'   => ['POST', 'chat'],
    // 홈 · 업무
    'home'           => ['GET',  'work'],
    'tasks'          => ['GET',  'work'],
    'task.save'      => ['POST', 'work'],
    'task.act'       => ['POST', 'work'],
    'project'        => ['GET',  'work'],
    'project.save'   => ['POST', 'work'],
    'deadline.save'  => ['POST', 'work'],
    'deadline.delete'=> ['POST', 'work'],
    'events'         => ['GET',  'work'],
    'event.save'     => ['POST', 'work'],
    'event.delete'   => ['POST', 'work'],
    // 공지
    'notices'        => ['GET',  'notice'],
    'notice'         => ['GET',  'notice'],
    'notice.confirm' => ['POST', 'notice'],
    'notice.save'    => ['POST', 'notice'],
    'notice.delete'  => ['POST', 'notice'],
    // 근태 (QR은 데모)
    'att'            => ['GET',  'att'],
    'att.check'      => ['POST', 'att'],
    // 결재
    'approvals'      => ['GET',  'appr'],
    'approval'       => ['GET',  'appr'],
    'approval.create'=> ['POST', 'appr'],
    'approval.act'   => ['POST', 'appr'],
    // 급여 · 계약서
    'pay'            => ['GET',  'pay'],
    'pay.save'       => ['POST', 'pay'],
    'contract.save'  => ['POST', 'pay'],
];

$a = (string)($_GET['a'] ?? '');
if (!isset($routes[$a])) {
    json_out(['error' => '알 수 없는 요청이에요.'], 404);
}
[$method, $module] = $routes[$a];

$u = api_member();
if ($method === 'POST') {
    if (!is_post()) json_out(['error' => 'POST만 가능해요.'], 405);
    check_csrf();
    $in = json_input();
} else {
    $in = $_GET;
}

require __DIR__ . '/../inc/app/' . $module . '.php';
$fn = 'api_' . str_replace('.', '_', $a);

try {
    $me = org_member($u['id']);
    if (!$me) fail('회원 정보를 찾을 수 없어요.', 403);
    $out = $fn($me, $in);
} catch (ApiError $e) {
    json_out(['error' => $e->getMessage()], $e->status);
}

$out = is_array($out) ? $out : ['ok' => true];
$push = array_values(array_unique($GLOBALS['__push_users']));
if ($push) {
    // 응답을 먼저 보내고 푸시 발송
    json_send_and_continue($out);
    require_once __DIR__ . '/../inc/push.php';
    push_to_users($push);
    exit;
}
json_out($out);
