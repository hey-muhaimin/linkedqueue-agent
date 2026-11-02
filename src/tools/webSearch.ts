import type { Tool } from '../types';
import { obj, str, clip } from '../util';

export const webSearch: Tool<{ query: string; limit?: number }> = {
  description: 'Search the web and return titles, URLs, and snippets.',
  params: obj({ query: str, limit: { type: 'number' } }, ['query']),
  run: async ({ query, limit }) => {
    const n = Math.min(Math.max(Number(limit) || 8, 1), 20);
    const url = 'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&format=rss&count=' + n;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Search failed: ${r.status}`);
    const xml = await r.text();
    const items: { title: string; url: string; snippet: string }[] = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) && items.length < n) {
      const block = m[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim();
      const desc = (block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
      if (title && link) items.push({ title, url: link, snippet: clip(desc, 300) });
    }
    return { query, results: items };
  },
};
