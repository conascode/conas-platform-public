<?php
require __DIR__ . '/inc/bootstrap.php';

$u = require_login();
if ($u['status'] === 'active') {
    redirect('');
}

page_header('승인 대기', ['body' => 'auth', 'tabbar' => false]);
?>
<div class="auth-box center">
  <?php if ($u['status'] === 'pending'): ?>
    <div class="big-emoji" aria-hidden="true">⏳</div>
    <h2>승인을 기다리고 있어요</h2>
    <p class="muted"><?= e($u['name']) ?>님의 이용 신청이 접수되었어요.<br>관리자가 승인하면 바로 이용할 수 있어요.</p>
    <a class="btn btn-block" href="<?= e(url('pending.php')) ?>">새로고침</a>
  <?php else: ?>
    <div class="big-emoji" aria-hidden="true">🚫</div>
    <h2>이용이 중지된 계정이에요</h2>
    <p class="muted">관리자에게 문의해 주세요.</p>
  <?php endif; ?>
  <form method="post" action="<?= e(url('logout.php')) ?>">
    <?= csrf_field() ?>
    <button class="btn btn-ghost btn-block" type="submit">로그아웃</button>
  </form>
</div>
<?php
page_footer();
