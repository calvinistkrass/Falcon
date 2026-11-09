'use strict';
// Lesezeichen im Netscape-HTML-Format (Chrome, Edge, Firefox, Opera) und als JSON – mit Ordnern.
//
// Ein Eintrag ist entweder ein Lesezeichen { title, url } oder ein Ordner { folder: true, title, children }.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const stripTags = (s) => unesc(String(s).replace(/<[^>]+>/g, '')).trim();

function count(list) {
  let n = 0;
  for (const item of list) n += item.folder ? count(item.children || []) : 1;
  return n;
}

function toHtml(tree) {
  const now = Math.floor(Date.now() / 1000);
  const render = (list, indent) => list.map((item) => {
    const pad = '    '.repeat(indent);
    if (item.folder) {
      return `${pad}<DT><H3 ADD_DATE="${now}">${esc(item.title)}</H3>\n${pad}<DL><p>\n${render(item.children || [], indent + 1)}${pad}</DL><p>\n`;
    }
    return `${pad}<DT><A HREF="${esc(item.url)}" ADD_DATE="${now}">${esc(item.title)}</A>\n`;
  }).join('');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${now}" PERSONAL_TOOLBAR_FOLDER="true">Falcon</H3>
    <DL><p>
${render(tree, 2)}    </DL><p>
</DL><p>
`;
}

/** Netscape-HTML einlesen; Inhalte des Lesezeichenleisten-Ordners kommen direkt in die oberste Ebene. */
function parseHtml(text) {
  const root = { folder: true, title: '', children: [] };
  const stack = [root];
  let pending = null; // Ordner, dessen <DL> als Nächstes kommt
  const re = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DL[^>]*>|<\/DL>|<A\s([^>]*)>([\s\S]*?)<\/A>/gi;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[0].slice(0, 4).toUpperCase();
    if (m[2] !== undefined) {
      pending = { folder: true, title: stripTags(m[2]) || 'Ordner', children: [], toolbar: /PERSONAL_TOOLBAR_FOLDER\s*=\s*"true"/i.test(m[1]) };
      stack[stack.length - 1].children.push(pending);
    } else if (tag.startsWith('<DL')) {
      if (pending) { stack.push(pending); pending = null; }
      else if (stack.length > 1 || root.children.length) stack.push(stack[stack.length - 1]); // unpaariges <DL>
    } else if (tag.startsWith('</DL')) {
      if (stack.length > 1) stack.pop();
    } else if (m[3] !== undefined) {
      const href = (m[3].match(/HREF\s*=\s*"([^"]+)"/i) || [])[1];
      if (!href) continue;
      const url = unesc(href);
      if (!/^https?:|^file:/i.test(url)) continue; // keine javascript:-Bookmarklets
      stack[stack.length - 1].children.push({ title: stripTags(m[4]) || url, url });
    }
  }
  // Lesezeichenleiste nach oben ziehen, leere Ordner entfernen
  const out = [];
  for (const item of root.children) {
    if (item.folder && item.toolbar) out.push(...item.children);
    else out.push(item);
  }
  const clean = (list) => list
    .map((i) => (i.folder ? { folder: true, title: i.title, children: clean(i.children) } : i))
    .filter((i) => !i.folder || i.children.length);
  return clean(out);
}

function parseJson(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.bookmarks || [];
  const norm = (items) => items.flatMap((b) => {
    if (!b || typeof b !== 'object') return [];
    if (b.folder || Array.isArray(b.children)) return [{ folder: true, title: String(b.title || 'Ordner'), children: norm(b.children || []) }];
    return b.url ? [{ title: String(b.title || b.url), url: String(b.url) }] : [];
  });
  return norm(list);
}

function parse(text) {
  const t = text.trim();
  return t.startsWith('[') || t.startsWith('{') ? parseJson(t) : parseHtml(text);
}

/** Importiertes in den Bestand einfügen: gleiche Adressen überspringen, gleichnamige Ordner zusammenführen. */
function merge(existing, imported) {
  const known = new Set();
  const collect = (list) => list.forEach((i) => (i.folder ? collect(i.children) : known.add(i.url)));
  collect(existing);
  let added = 0;
  const mergeInto = (target, items) => {
    for (const item of items) {
      if (item.folder) {
        let folder = target.find((x) => x.folder && x.title === item.title);
        if (!folder) { folder = { folder: true, title: item.title, children: [] }; target.push(folder); }
        mergeInto(folder.children, item.children);
      } else if (!known.has(item.url)) {
        known.add(item.url);
        target.push(item);
        added++;
      }
    }
  };
  const tree = JSON.parse(JSON.stringify(existing));
  mergeInto(tree, imported);
  return { tree, added, total: count(imported) };
}

module.exports = { toHtml, parse, merge, count };
