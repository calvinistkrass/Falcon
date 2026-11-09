'use strict';
// Bestätigung durch den Nutzer: Windows Hello (PIN, Fingerabdruck, Gesicht) bzw. Touch ID auf dem Mac.

const { systemPreferences } = require('electron');
const { execFile } = require('child_process');

const GRACE_MS = 60_000; // nach erfolgreicher Bestätigung eine Minute nicht erneut fragen
let verifiedAt = 0;

// Ruft die WinRT-API UserConsentVerifier über PowerShell auf. Der Grund kommt über eine
// Umgebungsvariable, damit kein Text in das Skript eingesetzt werden muss.
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}
$verifier = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
$availability = Await ($verifier::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
if ($availability -ne 'Available') { Write-Output "unavailable:$availability"; exit 0 }
if ($env:FALCON_AUTH_CHECK -eq '1') { Write-Output "available"; exit 0 }
$result = Await ($verifier::RequestVerificationAsync($env:FALCON_AUTH_REASON)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
Write-Output "result:$result"
`;

function runWindows(reason, checkOnly = false) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      env: { ...process.env, FALCON_AUTH_REASON: reason, FALCON_AUTH_CHECK: checkOnly ? '1' : '0' },
      windowsHide: true,
      timeout: 120_000
    }, (err, stdout) => {
      const out = String(stdout || '').trim();
      if (out === 'available') return resolve({ ok: true });
      if (out.startsWith('result:')) {
        const r = out.slice(7);
        return resolve(r === 'Verified' ? { ok: true } : { ok: false, reason: r === 'Canceled' ? 'cancelled' : 'failed' });
      }
      if (out.startsWith('unavailable:')) return resolve({ ok: true, unavailable: out.slice(12) });
      // PowerShell oder WinRT nicht verfügbar (z. B. sehr alte Windows-Version): nicht blockieren
      resolve({ ok: true, unavailable: err ? err.message : 'unknown' });
    });
  });
}

async function verifyUser(reason) {
  if (Date.now() - verifiedAt < GRACE_MS) return { ok: true, cached: true };
  let result;
  if (process.platform === 'win32') {
    result = await runWindows(reason);
  } else if (process.platform === 'darwin' && systemPreferences.canPromptTouchID()) {
    try { await systemPreferences.promptTouchID(reason); result = { ok: true }; }
    catch { result = { ok: false, reason: 'cancelled' }; }
  } else {
    result = { ok: true, unavailable: 'platform' };
  }
  if (result.ok && !result.unavailable) verifiedAt = Date.now();
  return result;
}

/** Prüft ohne Dialog, ob eine Bestätigung auf diesem Gerät möglich ist. */
let availability = null;
async function isAvailable() {
  if (availability !== null) return availability;
  if (process.platform === 'win32') availability = !(await runWindows('', true)).unavailable;
  else if (process.platform === 'darwin') availability = systemPreferences.canPromptTouchID();
  else availability = false;
  return availability;
}

module.exports = { verifyUser, isAvailable };
