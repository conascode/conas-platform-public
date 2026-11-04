<?php
require __DIR__ . '/inc/bootstrap.php';

if (!is_post()) {
    redirect('me.php');
}
check_csrf();
logout_user();
redirect('login.php');
