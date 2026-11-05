<?php
defined('IN_APP') or exit;

/*
 * 구내식당 메뉴 (점심)
 *  - 대표 · 관리자가 한 주(월~일)씩 입력. 메뉴는 한 줄에 하나
 *  - 홈 화면: 오늘 점심. 오후 2시가 지나면 다음 근무일(주말 건너뜀) 점심
 */

const MEAL_SWITCH_HOUR = 14;   // 이 시각부터 홈 화면에 다음 근무일 메뉴를 보여줌
const MEAL_MAX_ITEMS = 15;     // 하루 메뉴 최대 줄 수
const MEAL_ITEM_LEN = 40;      // 메뉴 한 줄 최대 글자 수

/** 메뉴 글(줄바꿈) → 배열 */
function meal_items(?string $text): array
{
    $out = [];
    foreach (preg_split('/\R/u', (string)$text) ?: [] as $line) {
        $line = trim(preg_replace('/\s+/u', ' ', $line) ?? '');
        if ($line !== '') $out[] = mb_substr($line, 0, MEAL_ITEM_LEN);
    }
    return array_slice($out, 0, MEAL_MAX_ITEMS);
}

/** 그 날짜가 있는 주의 월요일 */
function meal_monday(string $date): string
{
    $t = strtotime($date);
    return date('Y-m-d', strtotime('-' . (((int)date('N', $t)) - 1) . ' days', $t));
}

/** 날짜 => 메뉴 배열 */
function meals_between(string $from, string $to): array
{
    $out = [];
    foreach (q("SELECT meal_date, items FROM in_meals WHERE meal = 'lunch' AND meal_date >= ? AND meal_date < ?", [$from, $to]) as $r) {
        $out[$r['meal_date']] = meal_items($r['items']);
    }
    return $out;
}

/** 홈 화면용: 오늘 점심, 오후 2시 이후나 주말이면 다음 근무일 점심 */
function meal_for_home(?int $now = null): array
{
    $now ??= time();
    $d = date('Y-m-d', $now);
    if ((int)date('G', $now) >= MEAL_SWITCH_HOUR) $d = date('Y-m-d', strtotime($d . ' +1 day'));
    while ((int)date('N', strtotime($d)) >= 6) $d = date('Y-m-d', strtotime($d . ' +1 day'));
    $m = meals_between($d, date('Y-m-d', strtotime($d . ' +1 day')));
    return ['date' => $d, 'items' => $m[$d] ?? []];
}

/** 한 주 메뉴 (week: 그 주의 아무 날짜, 없으면 이번 주) */
function api_meals(array $me, array $in): array
{
    $base = str_in($in, 'week', 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $base) || !strtotime($base)) $base = date('Y-m-d');
    $mon = meal_monday($base);
    $end = date('Y-m-d', strtotime($mon . ' +7 days'));
    $meals = meals_between($mon, $end);
    $days = [];
    for ($i = 0; $i < 7; $i++) {
        $d = date('Y-m-d', strtotime($mon . " +$i days"));
        $days[] = ['date' => $d, 'items' => $meals[$d] ?? []];
    }
    return ['week_start' => $mon, 'today' => date('Y-m-d'), 'days' => $days, 'can_edit' => can_manage_company($me)];
}

/** 대표 · 관리자: 여러 날 메뉴 한 번에 저장 (비우면 그날 메뉴 지움) */
function api_meal_save(array $me, array $in): array
{
    if (!can_manage_company($me)) fail('대표나 관리자만 메뉴를 올릴 수 있어요.', 403);
    $list = is_array($in['days'] ?? null) ? array_slice($in['days'], 0, 7) : [];
    if (!$list) fail('저장할 메뉴가 없어요.');
    $pdo = db();
    $pdo->beginTransaction();
    $week = null;
    foreach ($list as $day) {
        if (!is_array($day)) continue;
        $date = date_in($day, 'date');
        $week ??= $date;
        $items = meal_items(is_string($day['items'] ?? null) ? $day['items'] : '');
        if (!$items) {
            q("DELETE FROM in_meals WHERE meal_date = ? AND meal = 'lunch'", [$date]);
            continue;
        }
        q(
            "INSERT INTO in_meals (meal_date, meal, items, updated_by) VALUES (?, 'lunch', ?, ?)
             ON DUPLICATE KEY UPDATE items = VALUES(items), updated_by = VALUES(updated_by)",
            [$date, implode("\n", $items), $me['id']]
        );
    }
    $pdo->commit();
    return api_meals($me, ['week' => $week ?? date('Y-m-d')]) + ['ok' => true];
}
