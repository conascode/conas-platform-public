<?php
defined('IN_APP') or exit;

/*
 * 급여 명세 · 근로계약서
 *  - 본인과 대표(또는 관리자)만 볼 수 있음
 *  - 급여는 시스템이 계산하지 않음. 급여 프로그램/세무사 결과를 대표가 입력
 */

function can_manage_pay(array $me): bool
{
    return is_ceo($me) || $me['is_admin'];
}

function pay_target(array $me, array $in): int
{
    $uid = int_in($in, 'user_id') ?: $me['id'];
    if ($uid !== $me['id'] && !can_manage_pay($me)) fail('본인 급여만 볼 수 있어요.', 403);
    if (!org_member($uid)) fail('직원을 찾을 수 없어요.', 404);
    return $uid;
}

function api_pay(array $me, array $in): array
{
    $uid = pay_target($me, $in);
    $rows = q('SELECT id, pay_month, items, memo FROM in_payslips WHERE user_id = ? ORDER BY pay_month DESC LIMIT 24', [$uid])->fetchAll();
    $slips = [];
    foreach ($rows as $r) {
        $items = json_decode((string)$r['items'], true) ?: [];
        $pay = 0;
        $ded = 0;
        foreach ($items as $it) {
            if (($it['kind'] ?? '') === 'deduct') $ded += (int)$it['amount'];
            else $pay += (int)$it['amount'];
        }
        $slips[] = ['id' => (int)$r['id'], 'month' => $r['pay_month'], 'items' => $items, 'memo' => $r['memo'], 'gross' => $pay, 'deduct' => $ded, 'net' => $pay - $ded];
    }
    $c = q('SELECT * FROM in_contracts WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$uid])->fetch();
    $contract = null;
    if ($c) {
        $att = $c['attachment_id'] ? q('SELECT * FROM in_attachments WHERE id = ?', [(int)$c['attachment_id']])->fetch() : null;
        $contract = [
            'id' => (int)$c['id'],
            'title' => $c['title'],
            'type' => $c['contract_type'],
            'start' => $c['start_date'],
            'end' => $c['end_date'],
            'hours' => $c['work_hours'],
            'salary' => $c['salary_text'],
            'file' => $att ? att_public($att) : null,
        ];
    }
    return ['user_id' => $uid, 'slips' => $slips, 'contract' => $contract, 'can_manage' => can_manage_pay($me)];
}

/** 대표: 급여 명세 입력 (같은 달이 있으면 덮어씀) */
function api_pay_save(array $me, array $in): array
{
    if (!can_manage_pay($me)) fail('대표나 관리자만 입력할 수 있어요.', 403);
    $uid = pay_target($me, $in);
    $month = str_in($in, 'month', 7);
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('지급 월을 확인해 주세요.');
    $items = [];
    foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 30) as $it) {
        if (!is_array($it)) continue;
        $label = str_in($it, 'label', 50);
        $amount = (int)($it['amount'] ?? 0);
        if ($label === '' || $amount <= 0) continue;
        $items[] = ['label' => $label, 'amount' => $amount, 'kind' => ($it['kind'] ?? '') === 'deduct' ? 'deduct' : 'pay'];
    }
    if (!$items) fail('지급 항목을 하나 이상 입력해 주세요.');
    q(
        'INSERT INTO in_payslips (user_id, pay_month, items, memo, created_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE items = VALUES(items), memo = VALUES(memo), created_by = VALUES(created_by)',
        [$uid, $month, json_encode($items, JSON_UNESCAPED_UNICODE), str_in($in, 'memo', 255) ?: null, $me['id']]
    );
    if ($uid !== $me['id']) {
        notify($uid, 'pay', '급여 명세가 올라왔어요', (int)substr($month, 5) . '월 급여 명세', '/ws/me');
    }
    return api_pay($me, ['user_id' => $uid]);
}

/** 대표: 근로계약서 정보 저장 (PDF 첨부 가능) */
function api_contract_save(array $me, array $in): array
{
    if (!can_manage_pay($me)) fail('대표나 관리자만 입력할 수 있어요.', 403);
    $uid = pay_target($me, $in);
    $fileId = int_in($in, 'file_id');
    $attId = null;
    if ($fileId) {
        $claimed = att_claim([$fileId], $me['id'], 'personal_user_id', $uid);
        $attId = $claimed[0] ?? null;
    }
    q(
        'INSERT INTO in_contracts (user_id, title, contract_type, start_date, end_date, work_hours, salary_text, attachment_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $uid,
            str_in($in, 'title', 100) ?: '근로계약서',
            str_in($in, 'type', 20) ?: null,
            date_in($in, 'start', false),
            date_in($in, 'end', false),
            str_in($in, 'hours', 50) ?: null,
            str_in($in, 'salary', 100) ?: null,
            $attId,
            $me['id'],
        ]
    );
    if ($uid !== $me['id']) notify($uid, 'pay', '근로계약서가 등록됐어요', '내 정보에서 확인할 수 있어요', '/ws/me');
    return api_pay($me, ['user_id' => $uid]);
}
