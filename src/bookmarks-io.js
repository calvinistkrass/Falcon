// Lesezeichen im Netscape-HTML-Format (kompatibel mit Chrome, Edge, Firefox, Opera) und JSON
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

function toHtml(bookmarks) {
  const now = Math.floor(Date.now() / 1000);
  const items = bookmarks
    .map((b) => `        <DT><A HREF="${esc(b.url)}" ADD_DATE="${now}">${esc(b.title)}</A>`)
    .join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${now}" PERSONAL_TOOLBAR_FOLDER="true">Falcon Lesezeichen</H3>
    <DL><p>
${items}
    </DL><p>
</DL><p>
`;
}

function parse(text) {
  const out = [];
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    const data = JSON.parse(t);
    const list = Array.isArray(data) ? data : data.bookmarks || [];
    for (const b of list) if (b && b.url) out.push({ title: String(b.title || b.url), url: String(b.url) });
  } else {
    const re = /<A\s[^>]*HREF\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/A>/gi;
    let m;
    while ((m = re.exec(text))) {
      const url = unesc(m[1]);
      if (!/^https?:|^file:/i.test(url)) continue; // keine javascript:-Bookmarklets
      out.push({ title: unesc(m[2].replace(/<[^>]+>/g, '')).trim() || url, url });
    }
  }
  return out;
}

module.exports = { toHtml, parse };
