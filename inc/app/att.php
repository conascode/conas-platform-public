<?php
defined('IN_APP') or exit;

/* 근태: QR은 데모(화면에 보여주기만). 출근/퇴근 버튼을 누른 시간을 기록 */

function work_start(): string
{
    return setting_get('work_start') ?? '09:00';
}

/** 지각 여부: 출근 시각이 근무 시작 시각보다 늦으면 */
function att_status(array $r): string
{
    if ($r['kind'] === 'leave') return 'leave';
    if (in_array($r['kind'], ['half_am', 'half_pm'], true)) return 'half';
    if ($r['kind'] === 'absent') return 'no';
    if (!$r['check_in']) return 'no';
    return substr($r['check_in'], 0, 5) > work_start() ? 'late' : 'ok';
}

/** 이번 해에 쓴 연차 (승인된 연차 기록 기준, 반차는 0.5일) */
function leave_used(int $uid): float
{
    $r = q(
        "SELECT SUM(kind = 'leave') AS full, SUM(kind IN ('half_am','half_pm')) AS half
           FROM in_attendance WHERE user_id = ? AND YEAR(work_date) = YEAR(CURDATE())",
        [$uid]
    )->fetch();
    return (float)$r['full'] + 0.5 * (float)$r['half'];
}

function api_att(array $me, array $in): array
{
    $uid = int_in($in, 'user_id') ?: $me['id'];
    if ($uid !== $me['id'] && !is_superior_of($me, $uid)) fail('볼 수 있는 권한이 없어요.', 403);
    $ym = str_in($in, 'month', 7);
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) $ym = date('Y-m');
    $from = $ym . '-01';
    $to = date('Y-m-d', strtotime($from . ' +1 month'));

    $rows = q(
        'SELECT work_date, check_in, check_out, kind, note FROM in_attendance WHERE user_id = ? AND work_date >= ? AND work_date < ? ORDER BY work_date',
        [$uid, $from, $to]
    )->fetchAll();
    $days = [];
    $late = 0;
    $work = 0;
    foreach ($rows as $r) {
        $st = att_status($r);
        if ($st === 'late') $late++;
        if (in_array($st, ['ok', 'late', 'half'], true)) $work++;
        $days[$r['work_date']] = [
            'in' => $r['check_in'] ? substr($r['check_in'], 0, 5) : null,
            'out' => $r['check_out'] ? substr($r['check_out'], 0, 5) : null,
            'status' => $st,
            'note' => $r['note'],
        ];
    }
    $m = org_member($uid);
    $total = $m && $m['annual_leave'] !== null ? (float)$m['annual_leave'] : null;
    $used = leave_used($uid);

    return [
        'month' => $ym,
        'days' => (object)$days,
        'work_days' => $work,
        'late' => $late,
        'leave_total' => $total,
        'leave_used' => $used,
        'leave_left' => $total === null ? null : max(0, $total - $used),
        'work_start' => work_start(),
        'work_end' => setting_get('work_end') ?? '18:00',
    ];
}

/** 출근 / 퇴근 (QR 데모) */
function api_att_check(array $me, array $in): array
{
    $today = date('Y-m-d');
    $now = date('H:i:s');
    $r = q('SELECT * FROM in_attendance WHERE user_id = ? AND work_date = ?', [$me['id'], $today])->fetch();
    $act = (string)($in['action'] ?? '');
    if ($act === 'in') {
        if ($r && $r['check_in']) fail('오늘은 이미 출근했어요.');
        q(
            "INSERT INTO in_attendance (user_id, work_date, check_in, kind) VALUES (?, ?, ?, 'work')
             ON DUPLICATE KEY UPDATE check_in = VALUES(check_in)",
            [$me['id'], $today, $now]
        );
    } elseif ($act === 'out') {
        if (!$r || !$r['check_in']) fail('먼저 출근을 기록해 주세요.');
        q('UPDATE in_attendance SET check_out = ? WHERE user_id = ? AND work_date = ?', [$now, $me['id'], $today]);
    } else {
        fail('알 수 없는 작업이에요.');
    }
    return ['ok' => true, 'time' => substr($now, 0, 5), 'late' => $act === 'in' && substr($now, 0, 5) > work_start()];
}
