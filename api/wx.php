<?php
// Minimal same-origin proxy for aviationweather.gov (which does not send CORS headers).
// Only whitelisted endpoints are forwarded; responses are cached for a few minutes.
header('Content-Type: application/json');
$types = ['taf' => 'taf', 'metar' => 'metar', 'isigmet' => 'isigmet'];
$type = $_GET['type'] ?? '';
if (!isset($types[$type])) { http_response_code(400); echo '[]'; exit; }
$q = ['format' => 'json'];
if (!empty($_GET['ids'])) $q['ids'] = preg_replace('/[^A-Z0-9,]/', '', strtoupper($_GET['ids']));
$url = 'https://aviationweather.gov/api/data/' . $types[$type] . '?' . http_build_query($q);
$cache = sys_get_temp_dir() . '/rfb_wx_' . md5($url) . '.json';
if (is_file($cache) && time() - filemtime($cache) < 300) { readfile($cache); exit; }
$ctx = stream_context_create(['http' => ['timeout' => 8, 'header' => "User-Agent: RotaidemFlightBag/1.0\r\n"]]);
$body = @file_get_contents($url, false, $ctx);
if ($body === false) { http_response_code(502); echo '[]'; exit; }
@file_put_contents($cache, $body);
echo $body;
