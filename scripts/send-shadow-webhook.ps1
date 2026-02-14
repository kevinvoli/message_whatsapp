$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\message_whatsapp\.env'
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Count -ne 2) { return }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim("'").Trim('"')
    if (-not [string]::IsNullOrWhiteSpace($key) -and -not (Test-Path "Env:$key")) {
      Set-Item -Path "Env:$key" -Value $value
    }
  }
}

$channelId = $env:SHADOW_CHANNEL_ID
if ([string]::IsNullOrWhiteSpace($channelId)) {
  $channelId = 'e2e-shadow-channel'
}

$secretHeader = $env:WHAPI_WEBHOOK_SECRET_HEADER
if ([string]::IsNullOrWhiteSpace($secretHeader)) {
  $secretHeader = 'x-whapi-signature'
}

$secret = $env:WHAPI_WEBHOOK_SECRET_VALUE
if ([string]::IsNullOrWhiteSpace($secret)) {
  throw 'WHAPI_WEBHOOK_SECRET_VALUE is required in the environment.'
}

$endpoint = $env:SHADOW_WEBHOOK_URL
if ([string]::IsNullOrWhiteSpace($endpoint)) {
  $endpoint = 'http://localhost:3002/webhooks/whapi'
}

$payload = @{
  channel_id = $channelId
  event = @{ type = 'messages' }
  messages = @(@{
    id = "shadow-$([guid]::NewGuid().ToString('N'))"
    chat_id = '22507001234@s.whatsapp.net'
    from_me = $false
    from = '22507001234'
    from_name = 'Shadow Test'
    timestamp = [int][double]::Parse((Get-Date -UFormat %s))
    type = 'text'
    text = @{ body = 'Shadow mode test' }
  })
}

$body = $payload | ConvertTo-Json -Depth 6
$raw = [System.Text.Encoding]::UTF8.GetBytes($body)
$key = [Text.Encoding]::UTF8.GetBytes($secret)
$hmac = [System.Security.Cryptography.HMACSHA256]::new($key)
$hash = ($hmac.ComputeHash($raw) | ForEach-Object { $_.ToString('x2') }) -join ''
$signature = "sha256=$hash"

$headers = @{ $secretHeader = $signature }

Write-Host "POST $endpoint"
Write-Host "Header: $secretHeader"
Write-Host "Channel: $channelId"

$resp = Invoke-WebRequest -Method Post -Uri $endpoint -Headers $headers -Body $body -ContentType 'application/json'
Write-Host "StatusCode: $($resp.StatusCode)"
