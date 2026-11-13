// Farben und Abstände wie in Falcon auf dem PC
export const C = {
  bg: '#0b0b0e',
  bg2: '#111116',
  surface: '#16161c',
  raised: '#1f1f27',
  line: 'rgba(255,255,255,0.08)',
  line2: 'rgba(255,255,255,0.14)',
  text: '#ededf1',
  text2: '#a6a6b2',
  text3: '#6f6f7c',
  accent: '#7c6cff',
  accentSoft: 'rgba(124,108,255,0.16)',
  blue: '#3b9eff',
  gold: '#f5b544',
  goldSoft: 'rgba(245,181,68,0.14)',
  green: '#3dd68c',
  danger: '#f0585b'
};
export const R = { sm: 8, md: 12, lg: 18, xl: 24 };

export const ENGINES: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q='
};

export function toUrl(input: string, engine = 'google') {
  const s = input.trim();
  if (!s) return '';
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(s)) return s;
  if (!/\s/.test(s) && /^[^\s/?#]+\.[a-z]{2,63}(:\d+)?([/?#].*)?$/i.test(s)) return `https://${s}`;
  return (ENGINES[engine] || ENGINES.google) + encodeURIComponent(s);
}
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const favicon = (url: string, size = 64) => `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(hostOf(url))}`;
