<?php
define('IN_APP', true);
require __DIR__ . '/inc/config.php';

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$icons = BASE_PATH . '/assets/icons/';
echo json_encode([
    'id' => BASE_PATH . '/',
    'name' => APP_NAME,
    'short_name' => APP_SHORT_NAME,
    'lang' => 'ko',
    'start_url' => BASE_PATH . '/',
    'scope' => BASE_PATH . '/',
    'display' => 'standalone',
    'orientation' => 'any',
    'background_color' => '#ffffff',
    'theme_color' => THEME_COLOR,
    'icons' => [
        ['src' => $icons . 'icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => $icons . 'icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => $icons . 'maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
    ],
    'shortcuts' => [
        ['name' => '채팅', 'url' => BASE_PATH . '/chat.php', 'icons' => [['src' => $icons . 'icon-192.png', 'sizes' => '192x192']]],
        ['name' => '게시판', 'url' => BASE_PATH . '/boards.php', 'icons' => [['src' => $icons . 'icon-192.png', 'sizes' => '192x192']]],
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
