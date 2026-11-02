import type { Tool } from '../types';
import { obj, str } from '../util';

export const skillSearch: Tool<{ query: string; limit?: number }> = {
  description: 'Search ClawHub for agent skills matching a task or topic.',
  params: obj({ query: str, limit: { type: 'number' } }, ['query']),
  run: async ({ query, limit }) => {
    const n = Math.min(Math.max(Number(limit) || 10, 1), 30);
    const url = 'https://clawhub.ai/api/v1/search?q=' + encodeURIComponent(query) + '&limit=' + n;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Skill search failed: ${r.status}`);
    const data: any = await r.json();
    const rows = Array.isArray(data.results) ? data.results : [];
    return {
      query,
      results: rows.map((x: any) => ({
        slug: x.slug,
        owner: x.ownerHandle || x.owner?.handle,
        name: x.displayName,
        summary: x.summary,
        downloads: x.downloads ?? x.metrics?.downloads,
        installs: x.installs ?? x.metrics?.installs,
        url: 'https://clawhub.ai' + (x.canonicalUrl || x.links?.canonical || ''),
      })),
    };
  },
};
