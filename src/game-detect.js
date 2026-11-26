'use strict';
/*
 * Spiel-Erkennung für den automatischen Game Mode (nur Windows).
 * Ein Spiel = das Fenster im Vordergrund gehört einem anderen Programm und füllt den ganzen Bildschirm
 * (randloses Vollbild oder exklusives Vollbild) – außer Browsern, Video-Playern und dem Desktop selbst.
 * Nur Fenster-Infos über user32/kernel32 (koffi), keine Bildschirminhalte.
 */

const path = require('path');

const NOT_GAMES = new Set([
  'explorer.exe', 'falcon.exe', 'electron.exe', 'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'opera_gx.exe', 'vivaldi.exe',
  'vlc.exe', 'mpc-hc.exe', 'mpc-hc64.exe', 'potplayermini64.exe', 'wmplayer.exe', 'video.ui.exe', 'microsoft.media.player.exe', 'applicationframehost.exe',
  'powerpnt.exe', 'obs64.exe', 'discord.exe', 'spotify.exe', 'searchhost.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe', 'lockapp.exe',
  'textinputhost.exe', 'screenclippinghost.exe', 'snippingtool.exe', 'taskmgr.exe', 'code.exe', 'windowsterminal.exe', 'mstsc.exe', 'steamwebhelper.exe'
]);
const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

let api = null;
function load() {
  if (api !== null) return api;
  api = false;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const RECT = koffi.struct('FALCON_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const MONITORINFO = koffi.struct('FALCON_MONITORINFO', { cbSize: 'uint32', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32' });
    api = {
      RECT, MONITORINFO,
      GetForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hWnd, _Out_ FALCON_RECT *rect)'),
      MonitorFromWindow: user32.func('void * __stdcall MonitorFromWindow(void *hWnd, uint32 flags)'),
      GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(void *hMon, _Inout_ FALCON_MONITORINFO *info)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(void *hWnd, _Out_ uint16 *name, int max)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hWnd)'),
      OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
      QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *h, uint32 flags, _Out_ uint16 *name, _Inout_ uint32 *size)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *h)')
    };
  } catch (e) {
    console.warn('Spiel-Erkennung nicht verfügbar:', e.message);
    api = false;
  }
  return api;
}

const wide = (buf, n) => Buffer.from(buf.buffer, buf.byteOffset, n * 2).toString('utf16le');

/** { game: 'spiel.exe' } wenn gerade ein Spiel im Vordergrund läuft, sonst null */
function foregroundGame() {
  const a = load();
  return a ? check(a.GetForegroundWindow()) : null;
}
/** Ist dieses Fenster ein Spiel im Vollbild? */
function check(hwnd) {
  const a = load();
  if (!a) return null;
  try {
    if (!hwnd || !a.IsWindowVisible(hwnd)) return null;
    const cls = new Uint16Array(64);
    const n = a.GetClassNameW(hwnd, cls, 64);
    if (DESKTOP_CLASSES.has(wide(cls, n))) return null;
    const pid = [0];
    a.GetWindowThreadProcessId(hwnd, pid);
    if (!pid[0] || pid[0] === process.pid) return null;
    const rect = {};
    if (!a.GetWindowRect(hwnd, rect)) return null;
    const mon = a.MonitorFromWindow(hwnd, 2 /* MONITOR_DEFAULTTONEAREST */);
    const info = { cbSize: 40, rcMonitor: {}, rcWork: {}, dwFlags: 0 };
    if (!mon || !a.GetMonitorInfoW(mon, info)) return null;
    const m = info.rcMonitor;
    const full = rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
    if (!full) return null;
    const h = a.OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid[0]);
    if (!h) return null;
    let exe = '';
    try {
      const name = new Uint16Array(520);
      const size = [520];
      if (a.QueryFullProcessImageNameW(h, 0, name, size)) exe = path.basename(wide(name, size[0])).toLowerCase();
    } finally { a.CloseHandle(h); }
    if (!exe || NOT_GAMES.has(exe)) return null;
    return { game: exe };
  } catch {
    return null;
  }
}

/** Alle `everyMs` prüfen; onChange(game | null) bei Wechsel. Gibt eine Stopp-Funktion zurück. */
function watch(onChange, everyMs = 4000) {
  if (!load()) return () => {};
  let current = null;
  let misses = 0;
  const timer = setInterval(() => {
    const g = foregroundGame();
    if (g) { misses = 0; if (current !== g.game) { current = g.game; onChange(g.game); } return; }
    // Alt+Tab zum Browser o. Ä.: erst nach 3 Fehlversuchen (≈ 12 s) als „Spiel beendet“ werten
    if (current && ++misses >= 3) { current = null; misses = 0; onChange(null); }
  }, everyMs);
  return () => clearInterval(timer);
}

module.exports = { foregroundGame, watch, supported: () => !!load(), _check: check };
