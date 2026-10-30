<?php
// Signs SimBrief API v1 requests on the server so the API key never reaches the browser.
// GET api/simbrief.php?api_req=<orig><dest><type><timestamp><outputpage>  ->  {"api_code": "..."}
header('Content-Type: application/json');
header('Cache-Control: no-store');

$config = @include __DIR__ . '/config.php';
$key = is_array($config) ? ($config['simbrief_api_key'] ?? '') : '';
if ($key === '' || $key === 'PASTE_YOUR_KEY_HERE') {
  http_response_code(503);
  echo json_encode(['error' => 'SimBrief API key not configured (api/config.php)']);
  exit;
}
$req = isset($_GET['api_req']) ? (string)$_GET['api_req'] : '';
if ($req === '' || strlen($req) > 512) {
  http_response_code(400);
  echo json_encode(['error' => 'api_req missing']);
  exit;
}
echo json_encode(['api_code' => md5($key . $req)]);
