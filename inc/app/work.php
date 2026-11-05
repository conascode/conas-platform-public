<?php
defined('IN_APP') or exit;

/*
 * 홈 · 업무 · 프로젝트 · 회사 마감 · 일정
 * 업무 완료 흐름: 담당자 '완료 요청'(todo → review) → 검토자 '확정'(done) 또는 '반려'(todo + 사유)
 *  - 검토자: 배정한 사람. 내가 추가한 프로젝트 업무는 결재선 첫 사람(팀장, 팀장은 대표)
 *  - 검토자가 없는(reviewer_id NULL) 개인 할 일은 본인이 바로 완료
 *  - 프로젝트에서 '완료 승인 필요'를 끄면 그 프로젝트 업무는 모두 담당자가 바로 완료
 *  - 담당자의 상급자(팀장, 대표)도 검토할 수 있음
 * 프로젝트 단계: [{id, name}] 목록. 업무는 단계 id(stage_id)로 연결되어 순서/이름을 바꿔도 유지됨
 */
require_once __DIR__ . '/people.php';

/** 단계를 따로 정하지 않은 프로젝트의 기본 단계 */
const STAGES = ['기획', '디자인', '개발', 'QA', '출시'];
const MAX_STAGES = 50;

function default_stages(): array
{
    $out = [];
    foreach (STAGES as $i => $n) {
        $out[] = ['id' => 'd' . ($i + 1), 'name' => $n];
    }
    return $out;
}

/** JSON → [{id, name}] (비어 있거나 잘못되면 기본 단계) */
function stages_from_json(?string $json): array
{
    $s = json_decode((string)$json, true);
    $out = [];
    if (is_array($s)) {
        foreach ($s as $x) {
            if (is_array($x) && isset($x['id'], $x['name']) && (string)$x['id'] !== '') {
                $out[] = ['id' => (string)$x['id'], 'name' => (string)$x['name']];
            }
        }
    }
    return $out ?: default_stages();
}

function stage_ids(array $stages): array
{
    return array_column($stages, 'id');
}

/** 현재 단계 id (없거나 지워졌으면 첫 단계) */
function current_stage_id(array $stages, ?string $cur): string
{
    return in_array($cur, stage_ids($stages), true) ? $cur : $stages[0]['id'];
}

function stage_name(array $stages, ?string $id): ?string
{
    foreach ($stages as $s) {
        if ($s['id'] === $id) return $s['name'];
    }
    return null;
}

function project_member_ids(int $pid): array
{
    return array_map('intval', q('SELECT user_id FROM in_project_members WHERE project_id = ? ORDER BY created_at, user_id', [$pid])->fetchAll(PDO::FETCH_COLUMN));
}

/** 프로젝트 수정 권한: 대표, 그 팀의 팀장, 만든 사람 */
function can_edit_project(array $p, array $me): bool
{
    return is_ceo($me)
        || ($me['role'] === 'lead' && $p['team_id'] !== null && (int)$p['team_id'] === $me['team_id'])
        || (int)$p['created_by'] === $me['id'];
}

function dday(string $date): int
{
    return (int)round((strtotime($date) - strtotime(date('Y-m-d'))) / 86400);
}

/** 완료할 때 승인이 필요한 업무인가 */
function task_needs_review(array $t): bool
{
    if ($t['reviewer_id'] === null) return false;
    return $t['project_id'] === null || (int)($t['require_review'] ?? 1) === 1;
}

function task_public(array $t, array $me): array
{
    $assignee = (int)$t['assignee_id'];
    $mine = $assignee === $me['id'];
    $needs = task_needs_review($t);
    // 배정한 사람과 담당자의 상급자는 언제나 고칠 수 있음
    $boss = ($t['assigner_id'] !== null && (int)$t['assigner_id'] === $me['id']) || is_superior_of($me, $assignee);
    // 담당자는 진행 중일 때 수정 가능. 완료된 업무는 프로젝트 설정에 따라
    //   1 = 담당자가 자기 업무만, 2 = 프로젝트를 볼 수 있는 누구나 (저장할 때 프로젝트 공개 범위를 다시 확인)
    $editDone = $t['project_id'] !== null ? (int)($t['allow_edit_done'] ?? 0) : 0;
    $isDone = $t['status'] === 'done';
    $canEdit = $boss
        || ($mine && (!$isDone || $editDone >= 1))
        || ($isDone && $editDone === 2);
    $stages = $t['project_id'] !== null ? stages_from_json($t['project_stages'] ?? null) : [];
    return [
        'id' => (int)$t['id'],
        'project_id' => $t['project_id'] === null ? null : (int)$t['project_id'],
        'project' => $t['project_name'] ?? null,
        'project_short' => $t['project_short'] ?? null,
        'stage_id' => $t['stage_id'],
        'stage' => $t['stage_id'] !== null ? stage_name($stages, $t['stage_id']) : null,
        'title' => $t['title'],
        'description' => $t['description'],
        'assignee_id' => $assignee,
        'assignee' => org_name($assignee),
        'assigner_id' => $t['assigner_id'] === null ? null : (int)$t['assigner_id'],
        'assigner' => $t['assigner_id'] === null ? null : org_name((int)$t['assigner_id']),
        'reviewer_id' => $needs ? (int)$t['reviewer_id'] : null,
        'reviewer' => $needs ? org_name((int)$t['reviewer_id']) : null,
        'due' => $t['due_date'],
        'dday' => dday($t['due_date']),
        'status' => $t['status'],
        'submit_note' => $t['submit_note'],
        'reject_note' => $t['reject_note'],
        'self' => !$needs,
        'no_review_project' => $t['project_id'] !== null && (int)($t['require_review'] ?? 1) === 0,
        'mine' => $mine,
        'can_review' => $needs && can_review_task($t, $me),
        'can_edit' => $canEdit,
        'can_edit_due' => $boss,
        'can_move' => $boss,
        'can_delete' => $boss || (!$needs && $mine && $t['assigner_id'] !== null && (int)$t['assigner_id'] === $me['id']),
    ];
}

function task_select(): string
{
    return 'SELECT t.*, p.name AS project_name, p.short_name AS project_short, p.team_id AS project_team,
                   p.stages AS project_stages, p.require_review, p.allow_edit_done
              FROM in_tasks t LEFT JOIN in_projects p ON p.id = t.project_id';
}

function task_row(int $id): array
{
    $t = q(task_select() . ' WHERE t.id = ?', [$id])->fetch();
    if (!$t) fail('업무를 찾을 수 없어요.', 404);
    return $t;
}

/** 볼 수 있는 프로젝트 한 개 (없으면 오류) */
function visible_project(array $me, int $id): array
{
    [$pv, $pvParams] = project_visible_sql($me);
    $p = q(
        "SELECT p.*, t.name AS team_name FROM in_projects p LEFT JOIN in_teams t ON t.id = p.team_id WHERE p.id = ? AND $pv",
        array_merge([$id], $pvParams)
    )->fetch();
    if (!$p) fail('프로젝트를 찾을 수 없어요.', 404);
    return $p;
}

/** 프로젝트 카드 · 상세에 쓰는 정보 (진행률, 단계별 업무 수, 참여 인원) */
function project_info(array $p, array $me): array
{
    $pid = (int)$p['id'];
    $ts = q('SELECT assignee_id, status, due_date, stage_id FROM in_tasks WHERE project_id = ?', [$pid])->fetchAll();
    $today = date('Y-m-d');
    $done = count(array_filter($ts, fn($t) => $t['status'] === 'done'));
    $late = count(array_filter($ts, fn($t) => $t['status'] !== 'done' && $t['due_date'] < $today));
    $pct = $ts ? (int)round($done / count($ts) * 100) : 0;
    $dd = $p['due_date'] ? dday($p['due_date']) : null;

    $stages = stages_from_json($p['stages']);
    $cur = current_stage_id($stages, $p['current_stage']);
    $curIdx = array_search($cur, stage_ids($stages), true);
    $stagesOut = array_map(function ($s) use ($ts) {
        $in = array_filter($ts, fn($t) => $t['stage_id'] === $s['id']);
        return $s + ['total' => count($in), 'done' => count(array_filter($in, fn($t) => $t['status'] === 'done'))];
    }, $stages);

    $members = project_member_ids($pid);
    return [
        'id' => $pid,
        'name' => $p['name'],
        'short' => $p['short_name'] ?: $p['name'],
        'team_id' => $p['team_id'] === null ? null : (int)$p['team_id'],
        'team' => $p['team_name'] ?? null,
        'stages' => $stagesOut,
        'current' => $cur,
        'current_index' => (int)$curIdx,
        'no_stage' => count(array_filter($ts, fn($t) => $t['stage_id'] === null || !in_array($t['stage_id'], stage_ids($stages), true))),
        'require_review' => (bool)$p['require_review'],
        'edit_done' => max(0, min(2, (int)$p['allow_edit_done'])),
        'due' => $p['due_date'],
        'dday' => $dd,
        'total' => count($ts),
        'done' => $done,
        'late' => $late,
        'pct' => $pct,
        'state' => $late ? 'late' : (($dd !== null && $dd <= 14 && $pct < 50) ? 'warn' : 'ok'),
        'members' => $members,
        'people' => $members ?: array_values(array_unique(array_map(fn($t) => (int)$t['assignee_id'], $ts))),
        'can_edit' => can_edit_project($p, $me),
    ];
}

/** 홈 화면 */
function api_home(array $me, array $in): array
{
    $today = date('Y-m-d');
    $att = q('SELECT check_in, check_out, kind FROM in_attendance WHERE user_id = ? AND work_date = ?', [$me['id'], $today])->fetch() ?: null;

    // 이번 주(일~토) 일정: 전사 + 우리 팀 (대표는 전체)
    $start = date('Y-m-d', strtotime($today . ' -' . date('w') . ' days'));
    $end = date('Y-m-d', strtotime($start . ' +7 days'));
    $events = events_between($me, $start, $end);

    $tasks = q(
        task_select() . " WHERE t.assignee_id = ? AND t.status = 'todo' ORDER BY t.due_date, t.id",
        [$me['id']]
    )->fetchAll();
    $todayN = count(array_filter($tasks, fn($t) => $t['due_date'] <= $today));
    $lateN = count(array_filter($tasks, fn($t) => $t['due_date'] < $today));

    require_once __DIR__ . '/notice.php';
    $notices = array_slice(notice_list($me), 0, 3);
    require_once __DIR__ . '/meal.php';

    return [
        'att' => $att ? ['in' => $att['check_in'] ? substr($att['check_in'], 0, 5) : null, 'out' => $att['check_out'] ? substr($att['check_out'], 0, 5) : null, 'kind' => $att['kind']] : null,
        'week_start' => $start,
        'events' => $events,
        'today_tasks' => $todayN,
        'late_tasks' => $lateN,
        'open_tasks' => count($tasks),
        'first_task' => $tasks ? $tasks[0]['title'] : null,
        'notices' => $notices,
        'meal' => meal_for_home(),
        'badges' => badges($me),
    ];
}

function events_between(array $me, string $from, string $to): array
{
    $sql = 'SELECT e.id, e.title, e.place, e.starts_at, e.color, e.team_id, e.created_by, t.name AS team_name
              FROM in_events e LEFT JOIN in_teams t ON t.id = e.team_id
             WHERE e.starts_at >= ? AND e.starts_at < ?';
    $params = [$from, $to];
    if (!is_ceo($me)) {
        $sql .= ' AND (e.team_id IS NULL OR e.team_id = ?)';
        $params[] = $me['team_id'] ?? 0;
    }
    $rows = q($sql . ' ORDER BY e.starts_at', $params)->fetchAll();
    return array_map(fn($e) => [
        'id' => (int)$e['id'],
        'title' => $e['title'],
        'place' => $e['place'],
        'date' => substr($e['starts_at'], 0, 10),
        'time' => substr($e['starts_at'], 11, 5),
        'color' => $e['color'],
        'team' => $e['team_name'],
        'can_delete' => (int)$e['created_by'] === $me['id'] || can_manage_company($me),
    ], $rows);
}

/** 업무 탭: view = mine | team */
function api_tasks(array $me, array $in): array
{
    $view = ($in['view'] ?? 'mine') === 'team' && ($me['role'] !== 'member') ? 'team' : 'mine';
    [$pv, $pvParams] = project_visible_sql($me);

    if ($view === 'mine') {
        $rows = q(task_select() . ' WHERE t.assignee_id = ? ORDER BY t.due_date, t.id', [$me['id']])->fetchAll();
    } else {
        // 볼 수 있는 프로젝트의 업무 + 내 아래 사람에게 배정된 업무 (남의 개인 할 일은 제외)
        $sub = assignable_ids($me);
        $where = "(t.project_id IS NOT NULL AND $pv)";
        $params = $pvParams;
        if ($sub) {
            $where .= ' OR (t.reviewer_id IS NOT NULL AND t.assignee_id IN (' . in_list($sub) . '))';
            $params = array_merge($params, $sub);
        }
        $where .= ' OR t.assignee_id = ?';
        $params[] = $me['id'];
        $rows = q(task_select() . " WHERE $where ORDER BY t.due_date, t.id", $params)->fetchAll();
    }
    // 완료된 업무는 최근 60일만
    $cut = date('Y-m-d', strtotime('-60 days'));
    $rows = array_filter($rows, fn($t) => $t['status'] !== 'done' || substr((string)$t['done_at'], 0, 10) >= $cut || $t['due_date'] >= $cut);

    // 검토 요청함
    $reviewIds = review_queue_ids($me);
    $reviews = $reviewIds
        ? q(task_select() . ' WHERE t.id IN (' . in_list($reviewIds) . ') ORDER BY t.due_date', $reviewIds)->fetchAll()
        : [];

    $projects = q(
        "SELECT p.*, t.name AS team_name FROM in_projects p LEFT JOIN in_teams t ON t.id = p.team_id
          WHERE p.archived_at IS NULL AND $pv ORDER BY p.due_date IS NULL, p.due_date, p.id",
        $pvParams
    )->fetchAll();

    $deadlines = q(
        'SELECT id, title, description, due_date FROM in_deadlines WHERE due_date >= CURDATE() - INTERVAL 1 DAY ORDER BY due_date LIMIT 20'
    )->fetchAll();

    return [
        'view' => $view,
        'tasks' => array_values(array_map(fn($t) => task_public($t, $me), $rows)),
        'reviews' => array_map(fn($t) => task_public($t, $me), $reviews),
        'projects' => array_map(fn($p) => project_info($p, $me), $projects),
        'deadlines' => array_map(fn($d) => [
            'id' => (int)$d['id'], 'title' => $d['title'], 'description' => $d['description'],
            'due' => $d['due_date'], 'dday' => dday($d['due_date']),
        ], $deadlines),
        'default_stages' => STAGES,
        'can_manage' => can_manage_company($me),
        'badges' => badges($me),
    ];
}

/** 프로젝트 화면: 프로젝트 정보 + 업무 전체 */
function api_project(array $me, array $in): array
{
    $p = visible_project($me, int_in($in, 'id'));
    $rows = q(task_select() . " WHERE t.project_id = ? ORDER BY t.status = 'done', t.due_date, t.id", [(int)$p['id']])->fetchAll();
    return [
        'project' => project_info($p, $me),
        'tasks' => array_map(fn($t) => task_public($t, $me), $rows),
        'default_stages' => STAGES,
    ];
}

/** 업무 추가 · 배정 · 수정 */
function api_task_save(array $me, array $in): array
{
    $id = int_in($in, 'id');
    $title = str_in($in, 'title', 200);
    if ($title === '') fail('업무명을 입력해 주세요.');
    $desc = str_in($in, 'description', 3000);

    if ($id) {
        $t = task_row($id);
        $tp = task_public($t, $me);
        if (!$tp['can_edit']) {
            fail($t['status'] === 'done' ? '이 프로젝트는 완료한 업무를 고칠 수 없게 되어 있어요.' : '고칠 권한이 없어요.', 403);
        }
        // 누구나 수정 가능한 프로젝트라도, 그 프로젝트를 볼 수 있는 사람만
        if ($t['project_id'] !== null) visible_project($me, (int)$t['project_id']);
        // 마감일과 프로젝트는 배정한 사람(또는 상급자)만 바꿈
        $due = $tp['can_edit_due'] ? date_in($in, 'due') : $t['due_date'];
        $projectId = $tp['can_move'] && array_key_exists('project_id', $in) ? (int_in($in, 'project_id') ?: null) : ($t['project_id'] === null ? null : (int)$t['project_id']);
        $stageId = null;
        if ($projectId) {
            $p = visible_project($me, $projectId);
            $stageId = task_stage_in($in, $p, $t['stage_id']);
        }
        q(
            'UPDATE in_tasks SET title = ?, description = ?, due_date = ?, project_id = ?, stage_id = ? WHERE id = ?',
            [$title, $desc ?: null, $due, $projectId, $stageId, $id]
        );
        return ['ok' => true, 'id' => $id];
    }

    $due = date_in($in, 'due');
    $projectId = int_in($in, 'project_id') ?: null;
    $stageId = null;
    if ($projectId) {
        $p = visible_project($me, $projectId);
        $stageId = task_stage_in($in, $p, null);
    }
    $to = int_in($in, 'assignee_id') ?: $me['id'];
    if ($to !== $me['id'] && !in_array($to, assignable_ids($me), true)) fail('이 사람에게는 업무를 배정할 수 없어요.', 403);
    if ($to !== $me['id']) {
        $reviewer = $me['id'];
    } else {
        // 내가 추가한 프로젝트 업무는 상급자가 확인, 개인 할 일은 검토 없음
        $reviewer = $projectId ? (approver_chain($me)[0] ?? null) : null;
    }
    q(
        'INSERT INTO in_tasks (project_id, stage_id, title, description, assignee_id, assigner_id, reviewer_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$projectId, $stageId, $title, $desc ?: null, $to, $me['id'], $reviewer, $due]
    );
    $id = (int)db()->lastInsertId();
    // 프로젝트 업무를 맡으면 자동으로 참여 인원에 추가
    if ($projectId) {
        q('INSERT IGNORE INTO in_project_members (project_id, user_id) VALUES (?, ?)', [$projectId, $to]);
    }
    if ($to !== $me['id']) {
        notify($to, 'task', '새 업무가 배정됐어요', $me['name'] . ' · ' . $title, '/ws/task');
    }
    return ['ok' => true, 'id' => $id];
}

/** 입력한 단계 id 확인 (없으면 지금 값 → 프로젝트 현재 단계) */
function task_stage_in(array $in, array $p, ?string $fallback): string
{
    $stages = stages_from_json($p['stages']);
    $sid = str_in($in, 'stage_id', 16);
    if ($sid !== '' && in_array($sid, stage_ids($stages), true)) return $sid;
    if ($fallback !== null && in_array($fallback, stage_ids($stages), true)) return $fallback;
    return current_stage_id($stages, $p['current_stage']);
}

/** 완료 요청 · 취소 · 확정 · 반려 · 확정 취소 · 바로 완료 · 삭제 */
function api_task_act(array $me, array $in): array
{
    $t = task_row(int_in($in, 'id'));
    $id = (int)$t['id'];
    $act = (string)($in['action'] ?? '');
    $mine = (int)$t['assignee_id'] === $me['id'];
    $needs = task_needs_review($t);
    $title = $t['title'];

    switch ($act) {
        case 'submit':
            if (!$mine || !$needs || $t['status'] !== 'todo') fail('지금은 완료 요청을 할 수 없어요.');
            q("UPDATE in_tasks SET status = 'review', submit_note = ?, reject_note = NULL, submitted_at = NOW() WHERE id = ?", [str_in($in, 'note', 2000) ?: null, $id]);
            notify((int)$t['reviewer_id'], 'review', '완료 검토 요청이 왔어요', $me['name'] . ' · ' . $title, '/ws/task');
            break;
        case 'cancel':
            if (!$mine || $t['status'] !== 'review') fail('지금은 요청을 취소할 수 없어요.');
            q("UPDATE in_tasks SET status = 'todo', submitted_at = NULL WHERE id = ?", [$id]);
            break;
        case 'approve':
            if (!can_review_task($t, $me) || $t['status'] !== 'review') fail('검토할 수 없는 업무예요.', 403);
            q("UPDATE in_tasks SET status = 'done', done_at = NOW(), reject_note = NULL WHERE id = ?", [$id]);
            notify((int)$t['assignee_id'], 'task', '업무가 확정됐어요', $me['name'] . ' · ' . $title, '/ws/task');
            break;
        case 'reject':
            if (!can_review_task($t, $me) || $t['status'] !== 'review') fail('검토할 수 없는 업무예요.', 403);
            $note = str_in($in, 'note', 2000);
            if ($note === '') fail('반려 사유를 적어주세요.');
            q("UPDATE in_tasks SET status = 'todo', reject_note = ?, submitted_at = NULL WHERE id = ?", [$note, $id]);
            notify((int)$t['assignee_id'], 'task', '업무가 반려됐어요', $me['name'] . ' · ' . $title, '/ws/task');
            break;
        case 'reopen':
            if ($t['status'] !== 'done' || !(($needs && can_review_task($t, $me)) || (!$needs && $mine) || is_superior_of($me, (int)$t['assignee_id']))) {
                fail('완료를 취소할 수 없어요.', 403);
            }
            q("UPDATE in_tasks SET status = 'todo', done_at = NULL WHERE id = ?", [$id]);
            break;
        case 'done':
            if ($needs || !$mine || $t['status'] === 'done') fail('바로 완료할 수 없는 업무예요. 완료 요청을 보내 주세요.');
            q("UPDATE in_tasks SET status = 'done', done_at = NOW(), submitted_at = NULL WHERE id = ?", [$id]);
            // 승인 없이 완료되는 프로젝트 업무는 배정한 사람에게 알림
            if ($t['assigner_id'] !== null && (int)$t['assigner_id'] !== $me['id']) {
                notify((int)$t['assigner_id'], 'task', '업무가 완료됐어요', $me['name'] . ' · ' . $title, '/ws/task');
            }
            break;
        case 'delete':
            $tp = task_public($t, $me);
            if (!$tp['can_delete']) fail('삭제할 권한이 없어요.', 403);
            q('DELETE FROM in_tasks WHERE id = ?', [$id]);
            return ['ok' => true, 'deleted' => true];
        default:
            fail('알 수 없는 작업이에요.');
    }
    return ['ok' => true, 'task' => task_public(task_row($id), $me)];
}

/**
 * 프로젝트 추가 · 수정 (대표, 그 팀 팀장, 만든 사람)
 *  stages: [{id?, name}] (id가 없으면 새 단계), current: 현재 단계 순서(0부터)
 *  require_review: 완료 승인 필요, edit_done: 완료한 업무 수정 (0 불가, 1 자기 업무만, 2 누구나)
 */
function api_project_save(array $me, array $in): array
{
    $id = int_in($in, 'id');
    $p = null;
    if ($id) {
        $p = q('SELECT * FROM in_projects WHERE id = ?', [$id])->fetch();
        if (!$p || !can_edit_project($p, $me)) fail('이 프로젝트를 수정할 권한이 없어요.', 403);
    } elseif ($me['role'] === 'member') {
        fail('팀장이나 대표만 프로젝트를 만들 수 있어요.', 403);
    }
    $name = str_in($in, 'name', 100);
    if ($name === '') fail('프로젝트 이름을 입력해 주세요.');
    $short = str_in($in, 'short_name', 20);
    $due = date_in($in, 'due', false);
    // 팀: 대표는 고를 수 있고, 팀장은 우리 팀 고정 (수정할 때는 원래 팀 유지)
    $teamId = is_ceo($me) ? (int_in($in, 'team_id') ?: null) : ($p ? ($p['team_id'] === null ? null : (int)$p['team_id']) : $me['team_id']);
    $archive = bool_in($in, 'archive');
    $requireReview = array_key_exists('require_review', $in) ? (bool_in($in, 'require_review') ? 1 : 0) : ($p ? (int)$p['require_review'] : 1);
    // 완료한 업무 수정: 0 = 불가, 1 = 자기 업무만, 2 = 누구나
    $allowEditDone = array_key_exists('edit_done', $in) ? max(0, min(2, int_in($in, 'edit_done'))) : ($p ? (int)$p['allow_edit_done'] : 0);

    // 단계: 1~50개, 각 20자 이하. 기존 단계는 id를 유지해서 업무 연결이 끊기지 않게
    $oldIds = $p ? stage_ids(stages_from_json($p['stages'])) : [];
    $stages = [];
    $used = [];
    foreach (is_array($in['stages'] ?? null) ? $in['stages'] : [] as $s) {
        $nm = is_array($s) ? ($s['name'] ?? '') : $s;
        $nm = is_string($nm) ? trim(mb_substr(preg_replace('/\s+/u', ' ', $nm) ?? '', 0, 20)) : '';
        if ($nm === '') continue;
        $sid = is_array($s) && is_string($s['id'] ?? null) ? substr(preg_replace('/[^A-Za-z0-9_-]/', '', $s['id']) ?? '', 0, 16) : '';
        if ($sid === '' || isset($used[$sid])) $sid = 's' . bin2hex(random_bytes(4));
        $used[$sid] = true;
        $stages[] = ['id' => $sid, 'name' => $nm];
    }
    if (!$stages) $stages = default_stages();
    if (count($stages) > MAX_STAGES) fail('단계는 ' . MAX_STAGES . '개까지 만들 수 있어요.');
    $curIdx = max(0, min(count($stages) - 1, int_in($in, 'current')));
    $current = $stages[$curIdx]['id'];
    $stagesJson = json_encode($stages, JSON_UNESCAPED_UNICODE);

    // 참여 인원: 활성 회원만
    $memberIds = array_values(array_intersect(int_list_in($in, 'member_ids', 200), array_keys(org_members())));

    $pdo = db();
    $pdo->beginTransaction();
    if ($id) {
        q(
            'UPDATE in_projects SET name = ?, short_name = ?, stages = ?, current_stage = ?, require_review = ?, allow_edit_done = ?,
                    due_date = ?, team_id = ?, archived_at = ' . ($archive ? 'NOW()' : 'NULL') . ' WHERE id = ?',
            [$name, $short ?: null, $stagesJson, $current, $requireReview, $allowEditDone, $due, $teamId, $id]
        );
        // 지운 단계에 있던 업무는 '단계 없음'으로
        $removed = array_values(array_diff($oldIds, stage_ids($stages)));
        if ($removed) {
            q('UPDATE in_tasks SET stage_id = NULL WHERE project_id = ? AND stage_id IN (' . in_list($removed) . ')', array_merge([$id], $removed));
        }
        $before = project_member_ids($id);
    } else {
        q(
            'INSERT INTO in_projects (team_id, name, short_name, stages, current_stage, require_review, allow_edit_done, due_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$teamId, $name, $short ?: null, $stagesJson, $current, $requireReview, $allowEditDone, $due, $me['id']]
        );
        $id = (int)$pdo->lastInsertId();
        $before = [];
    }
    $added = [];
    if (array_key_exists('member_ids', $in)) {
        q('DELETE FROM in_project_members WHERE project_id = ?', [$id]);
        foreach ($memberIds as $uid) {
            q('INSERT INTO in_project_members (project_id, user_id) VALUES (?, ?)', [$id, $uid]);
        }
        $added = array_values(array_diff($memberIds, $before, [$me['id']]));
    }
    $pdo->commit();

    if ($added) notify($added, 'task', '프로젝트에 참여하게 됐어요', $name . ' · ' . $me['name'] . ' 추가', '/ws/project/' . $id);
    return ['ok' => true, 'id' => $id];
}

function api_deadline_save(array $me, array $in): array
{
    if (!can_manage_company($me)) fail('대표나 관리자만 회사 마감을 등록할 수 있어요.', 403);
    $title = str_in($in, 'title', 200);
    if ($title === '') fail('내용을 입력해 주세요.');
    $due = date_in($in, 'due');
    q('INSERT INTO in_deadlines (title, description, due_date, created_by) VALUES (?, ?, ?, ?)', [$title, str_in($in, 'description', 255) ?: null, $due, $me['id']]);
    $others = array_values(array_filter(array_keys(org_members()), fn($id) => $id !== $me['id']));
    notify($others, 'deadline', '회사 마감이 등록됐어요', $title . ' · ' . date('n월 j일', strtotime($due)) . '까지', '/ws/task');
    return ['ok' => true];
}

function api_deadline_delete(array $me, array $in): array
{
    if (!can_manage_company($me)) fail('대표나 관리자만 지울 수 있어요.', 403);
    q('DELETE FROM in_deadlines WHERE id = ?', [int_in($in, 'id')]);
    return ['ok' => true];
}

function api_events(array $me, array $in): array
{
    $from = date_in($in, 'from');
    $to = date_in($in, 'to');
    return ['events' => events_between($me, $from, $to)];
}

/** 일정 추가: 전사 일정은 대표/관리자, 팀 일정은 그 팀 사람 누구나 */
function api_event_save(array $me, array $in): array
{
    $title = str_in($in, 'title', 200);
    if ($title === '') fail('일정 제목을 입력해 주세요.');
    $date = date_in($in, 'date');
    $time = str_in($in, 'time', 5);
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) fail('시간을 확인해 주세요.');
    $scope = (string)($in['scope'] ?? 'team');
    if ($scope === 'company') {
        if (!can_manage_company($me)) fail('전사 일정은 대표나 관리자만 등록할 수 있어요.', 403);
        $teamId = null;
    } else {
        $teamId = $me['team_id'];
        if (!$teamId) fail('소속 팀이 없어서 팀 일정을 만들 수 없어요.');
    }
    $color = in_array($in['color'] ?? '', ['primary', 'ok', 'warn', 'danger', 'leave'], true) ? $in['color'] : 'primary';
    q(
        'INSERT INTO in_events (title, place, starts_at, color, team_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [$title, str_in($in, 'place', 100) ?: null, "$date $time:00", $color, $teamId, $me['id']]
    );
    return ['ok' => true];
}

function api_event_delete(array $me, array $in): array
{
    $e = q('SELECT id, created_by FROM in_events WHERE id = ?', [int_in($in, 'id')])->fetch();
    if (!$e) fail('일정을 찾을 수 없어요.', 404);
    if ((int)$e['created_by'] !== $me['id'] && !can_manage_company($me)) fail('지울 권한이 없어요.', 403);
    q('DELETE FROM in_events WHERE id = ?', [(int)$e['id']]);
    return ['ok' => true];
}
