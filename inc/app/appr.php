<?php
defined('IN_APP') or exit;

/*
 * 서류 결재
 *  결재선: 팀원 → 팀장 → 대표 / 팀장 → 대표 / 대표 → 전결(바로 승인)
 *  연차 · 반차가 최종 승인되면 근태에 자동으로 기록
 */

const APPR_TYPES = [
    'reason' => ['근태 사유서', ['date', 'kind', 'reason']],
    'leave'  => ['연차·반차 신청', ['kind', 'date', 'to', 'reason']],
    'ot'     => ['연장근무 신청', ['date', 'from', 'until', 'reason']],
    'exp'    => ['지출결의서', ['date', 'item', 'amount', 'reason']],
    'cert'   => ['증명서 발급', ['kind', 'purpose', 'count']],
    'supply' => ['비품 신청', ['item', 'count', 'reason']],
    // 업무 문서: 결재선 대신 받을 사람(관리자)을 한 명 지정
    'propose' => ['제안서', ['subject', 'background', 'content', 'effect']],
    'suggest' => ['건의서', ['subject', 'content', 'solution']],
    'request' => ['품의서', ['subject', 'content', 'amount', 'reason']],
];
/** 받을 사람을 직접 고르는 서류 */
const APPR_PICK = ['propose', 'suggest', 'request'];
/** 길게 쓰는 칸 */
const APPR_LONG = ['background', 'content', 'effect', 'solution', 'reason'];
/** 꼭 채워야 하는 칸 (업무 문서) */
const APPR_REQUIRED = ['subject', 'content'];

/** 업무 문서를 받을 수 있는 사람: 대표, 팀장, 관리자 (나 빼고) */
function appr_pick_ids(array $me): array
{
    $out = [];
    foreach (org_members() as $m) {
        if ($m['id'] === $me['id']) continue;
        if ($m['role'] === 'ceo' || $m['role'] === 'lead' || $m['is_admin']) $out[] = $m['id'];
    }
    return $out;
}

function appr_title(string $type, array $f): string
{
    $name = APPR_TYPES[$type][0];
    if (in_array($type, APPR_PICK, true)) {
        $sub = trim((string)($f['subject'] ?? ''));
        if ($type === 'request' && !empty($f['amount'])) $sub .= ' · ' . number_format((int)$f['amount']) . '원';
        return mb_substr($name . ($sub !== '' ? ' · ' . $sub : ''), 0, 200);
    }
    if ($type === 'leave') $name = ($f['kind'] ?? '연차') . ' 신청';
    if ($type === 'reason') $name = ($f['kind'] ?? '근태') . ' 사유서';
    $sub = '';
    if (!empty($f['date'])) {
        $t = strtotime($f['date']);
        $sub = ' · ' . date('n/j', $t) . ' (' . ['일', '월', '화', '수', '목', '금', '토'][(int)date('w', $t)] . ')';
        if (!empty($f['to']) && $f['to'] !== $f['date']) $sub .= ' ~ ' . date('n/j', strtotime($f['to']));
    }
    if ($type === 'exp' && !empty($f['amount'])) $sub .= ' ' . number_format((int)$f['amount']) . '원';
    if (in_array($type, ['cert', 'supply'], true) && !empty($f['kind'] ?? $f['item'] ?? '')) $sub = ' · ' . ($f['kind'] ?? $f['item']);
    return mb_substr($name . $sub, 0, 200);
}

function appr_row(int $id): array
{
    $a = q('SELECT * FROM in_approvals WHERE id = ?', [$id])->fetch();
    if (!$a) fail('서류를 찾을 수 없어요.', 404);
    return $a;
}

function appr_steps(int $id): array
{
    return q('SELECT * FROM in_approval_steps WHERE approval_id = ? ORDER BY step', [$id])->fetchAll();
}

function appr_can_view(array $a, array $steps, array $me): bool
{
    if ((int)$a['user_id'] === $me['id'] || is_ceo($me)) return true;
    foreach ($steps as $s) {
        if ((int)$s['approver_id'] === $me['id']) return true;
    }
    return false;
}

function appr_public(array $a, array $me, ?array $steps = null): array
{
    $steps ??= appr_steps((int)$a['id']);
    $cur = null;
    foreach ($steps as $s) {
        if ($s['status'] === 'pending') $cur = $s;
    }
    return [
        'id' => (int)$a['id'],
        'type' => $a['type'],
        'type_name' => APPR_TYPES[$a['type']][0] ?? $a['type'],
        'title' => $a['title'],
        'user_id' => (int)$a['user_id'],
        'user' => org_name((int)$a['user_id']),
        'status' => $a['status'],
        'ts' => strtotime($a['created_at']),
        'fields' => json_decode((string)$a['fields'], true) ?: [],
        'steps' => array_map(fn($s) => [
            'step' => (int)$s['step'],
            'approver_id' => $s['approver_id'] === null ? null : (int)$s['approver_id'],
            'approver' => org_name($s['approver_id'] === null ? null : (int)$s['approver_id']),
            'role' => ($m = org_member((int)$s['approver_id'])) ? ROLE_LABEL[$m['role']] : '',
            'status' => $s['status'],
            'note' => $s['note'],
            'ts' => $s['acted_at'] ? strtotime($s['acted_at']) : null,
        ], $steps),
        'my_turn' => $cur && (int)$cur['approver_id'] === $me['id'] && $a['status'] === 'pending',
        'can_cancel' => (int)$a['user_id'] === $me['id'] && $a['status'] === 'pending',
    ];
}

function api_approvals(array $me, array $in): array
{
    $mine = q('SELECT * FROM in_approvals WHERE user_id = ? AND status <> \'canceled\' ORDER BY id DESC LIMIT 50', [$me['id']])->fetchAll();
    $inbox = q(
        "SELECT a.* FROM in_approvals a JOIN in_approval_steps s ON s.approval_id = a.id
          WHERE s.approver_id = ? AND s.status = 'pending' AND a.status = 'pending' ORDER BY a.id",
        [$me['id']]
    )->fetchAll();
    $done = q(
        "SELECT DISTINCT a.* FROM in_approvals a JOIN in_approval_steps s ON s.approval_id = a.id
          WHERE s.approver_id = ? AND s.status IN ('approved','rejected') ORDER BY a.id DESC LIMIT 20",
        [$me['id']]
    )->fetchAll();
    return [
        'mine' => array_map(fn($a) => appr_public($a, $me), $mine),
        'inbox' => array_map(fn($a) => appr_public($a, $me), $inbox),
        'handled' => array_map(fn($a) => appr_public($a, $me), $done),
        'approvers' => array_map(fn($id) => ['id' => $id, 'name' => org_name($id), 'role' => ROLE_LABEL[org_member($id)['role']] ?? ''], approver_chain($me)),
        'pick_ids' => appr_pick_ids($me),
        'leave_left' => leave_left($me),
    ];
}

function leave_left(array $me): ?float
{
    if ($me['annual_leave'] === null) return null;
    require_once __DIR__ . '/att.php';
    return max(0, (float)$me['annual_leave'] - leave_used($me['id']));
}

function api_approval(array $me, array $in): array
{
    $a = appr_row(int_in($in, 'id'));
    $steps = appr_steps((int)$a['id']);
    if (!appr_can_view($a, $steps, $me)) fail('볼 수 있는 권한이 없어요.', 403);
    $files = q('SELECT * FROM in_attachments WHERE approval_id = ? ORDER BY id', [(int)$a['id']])->fetchAll();
    return ['approval' => appr_public($a, $me, $steps) + ['files' => array_map('att_public', $files)]];
}

function api_approval_create(array $me, array $in): array
{
    $type = (string)($in['type'] ?? '');
    if (!isset(APPR_TYPES[$type])) fail('서류 종류를 다시 골라 주세요.');
    $src = is_array($in['fields'] ?? null) ? $in['fields'] : [];
    $fields = [];
    foreach (APPR_TYPES[$type][1] as $k) {
        $v = str_in($src, $k, in_array($k, APPR_LONG, true) ? 5000 : ($k === 'subject' ? 100 : 1000));
        if (in_array($k, ['date', 'to'], true) && $v !== '') date_in($src, $k);
        if (in_array($k, ['amount', 'count'], true) && $v !== '') {
            if (!ctype_digit($v)) fail('숫자를 확인해 주세요.');
            $v = (int)$v;
        }
        if (in_array($k, ['from', 'until'], true) && $v !== '' && !preg_match('/^\d{2}:\d{2}$/', $v)) fail('시간을 확인해 주세요.');
        $fields[$k] = $v;
    }
    if (in_array('date', APPR_TYPES[$type][1], true) && ($fields['date'] ?? '') === '') fail('날짜를 입력해 주세요.');
    if ($type === 'leave' && ($fields['to'] ?? '') !== '' && $fields['to'] < $fields['date']) fail('종료일이 시작일보다 빨라요.');
    if ($type === 'exp' && empty($fields['amount'])) fail('금액을 입력해 주세요.');

    if (in_array($type, APPR_PICK, true)) {
        foreach (APPR_REQUIRED as $k) {
            if (($fields[$k] ?? '') === '') fail($k === 'subject' ? '제목을 입력해 주세요.' : '내용을 입력해 주세요.');
        }
        // 받을 사람 한 명 지정
        $to = int_in($in, 'approver_id');
        if (!in_array($to, appr_pick_ids($me), true)) fail('받을 사람을 골라 주세요.');
        $chain = [$to];
    } else {
        $chain = approver_chain($me);
    }
    $title = appr_title($type, $fields);
    $pdo = db();
    $pdo->beginTransaction();
    q(
        'INSERT INTO in_approvals (user_id, type, title, fields, status, decided_at) VALUES (?, ?, ?, ?, ?, ' . ($chain ? 'NULL' : 'NOW()') . ')',
        [$me['id'], $type, $title, json_encode($fields, JSON_UNESCAPED_UNICODE), $chain ? 'pending' : 'approved']
    );
    $id = (int)$pdo->lastInsertId();
    foreach ($chain as $i => $uid) {
        q('INSERT INTO in_approval_steps (approval_id, step, approver_id, status) VALUES (?, ?, ?, ?)', [$id, $i, $uid, $i === 0 ? 'pending' : 'waiting']);
    }
    att_claim(int_list_in($in, 'files', 10), $me['id'], 'approval_id', $id);
    $pdo->commit();

    if ($chain) {
        $head = in_array($type, APPR_PICK, true) ? APPR_TYPES[$type][0] . '가 도착했어요' : '결재 요청이 왔어요';
        notify($chain[0], 'approval', $head, $me['name'] . ' · ' . $title, '/ws/doc');
    } else {
        appr_on_approved(appr_row($id));
    }
    return ['ok' => true, 'id' => $id, 'auto' => !$chain];
}

/** 최종 승인되면: 연차/반차는 근태에 기록 */
function appr_on_approved(array $a): void
{
    if ($a['type'] !== 'leave') return;
    $f = json_decode((string)$a['fields'], true) ?: [];
    $kind = match ($f['kind'] ?? '연차') {
        '오전 반차' => 'half_am',
        '오후 반차' => 'half_pm',
        default => 'leave',
    };
    $from = $f['date'] ?? null;
    if (!$from) return;
    $to = ($kind === 'leave' && !empty($f['to'])) ? $f['to'] : $from;
    for ($d = $from; $d <= $to; $d = date('Y-m-d', strtotime($d . ' +1 day'))) {
        if (in_array((int)date('w', strtotime($d)), [0, 6], true)) continue; // 주말 제외
        q(
            'INSERT INTO in_attendance (user_id, work_date, kind, note) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE kind = VALUES(kind), note = VALUES(note)',
            [(int)$a['user_id'], $d, $kind, $f['kind'] ?? '연차']
        );
    }
}

function api_approval_act(array $me, array $in): array
{
    $a = appr_row(int_in($in, 'id'));
    $id = (int)$a['id'];
    $act = (string)($in['action'] ?? '');
    $steps = appr_steps($id);

    if ($act === 'cancel') {
        if ((int)$a['user_id'] !== $me['id'] || $a['status'] !== 'pending') fail('지금은 취소할 수 없어요.');
        q("UPDATE in_approvals SET status = 'canceled', decided_at = NOW() WHERE id = ?", [$id]);
        return ['ok' => true];
    }

    $cur = null;
    foreach ($steps as $s) {
        if ($s['status'] === 'pending') $cur = $s;
    }
    if ($a['status'] !== 'pending' || !$cur || (int)$cur['approver_id'] !== $me['id']) fail('지금 결재할 차례가 아니에요.', 403);
    $step = (int)$cur['step'];
    $owner = (int)$a['user_id'];

    if ($act === 'approve') {
        q("UPDATE in_approval_steps SET status = 'approved', note = ?, acted_at = NOW() WHERE approval_id = ? AND step = ?", [str_in($in, 'note', 500) ?: null, $id, $step]);
        $next = null;
        foreach ($steps as $s) {
            if ((int)$s['step'] === $step + 1) $next = $s;
        }
        if ($next) {
            q("UPDATE in_approval_steps SET status = 'pending' WHERE approval_id = ? AND step = ?", [$id, $step + 1]);
            q('UPDATE in_approvals SET current_step = ? WHERE id = ?', [$step + 1, $id]);
            notify((int)$next['approver_id'], 'approval', '결재 요청이 왔어요', org_name($owner) . ' · ' . $a['title'], '/ws/doc');
        } else {
            q("UPDATE in_approvals SET status = 'approved', decided_at = NOW() WHERE id = ?", [$id]);
            appr_on_approved($a);
            notify($owner, 'approval', '서류가 승인됐어요', $a['title'], '/ws/doc');
        }
    } elseif ($act === 'reject') {
        $note = str_in($in, 'note', 500);
        if ($note === '') fail('반려 사유를 적어주세요.');
        q("UPDATE in_approval_steps SET status = 'rejected', note = ?, acted_at = NOW() WHERE approval_id = ? AND step = ?", [$note, $id, $step]);
        q("UPDATE in_approval_steps SET status = 'skipped' WHERE approval_id = ? AND step > ?", [$id, $step]);
        q("UPDATE in_approvals SET status = 'rejected', decided_at = NOW() WHERE id = ?", [$id]);
        notify($owner, 'approval', '서류가 반려됐어요', $a['title'] . ' · ' . $note, '/ws/doc');
    } else {
        fail('알 수 없는 작업이에요.');
    }
    return api_approval($me, ['id' => $id]) + ['ok' => true];
}
