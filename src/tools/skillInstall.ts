import type { Tool } from '../types';
import { obj, str, safeName } from '../util';
import { installSkillFromUrl } from '../api/skills';

export const skillInstall: Tool<{ slug: string; owner?: string; name?: string }> = {
  description: 'Install an agent skill from ClawHub by slug (and optional owner).',
  params: obj({ slug: str, owner: str, name: str }, ['slug']),
  run: async ({ slug, owner, name }) => {
    let resolvedOwner = owner;
    if (!resolvedOwner) {
      const url = 'https://clawhub.ai/api/v1/search?q=' + encodeURIComponent(slug) + '&mode=exact&limit=20';
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Skill lookup failed: ${r.status}`);
      const data: any = await r.json();
      const rows = (Array.isArray(data.results) ? data.results : []).filter((x: any) => x.slug === slug);
      const best = rows.sort((a: any, b: any) => (b.downloads || 0) - (a.downloads || 0))[0];
      if (!best) throw new Error('Skill not found: ' + slug);
      resolvedOwner = best.ownerHandle || best.owner?.handle;
    }
    if (!resolvedOwner) throw new Error('Could not resolve skill owner: ' + slug);
    const fileUrl = 'https://clawhub.ai/api/v1/skills/' + encodeURIComponent(slug) + '/file?path=SKILL.md&owner=' + encodeURIComponent(resolvedOwner);
    const installed = await installSkillFromUrl(fileUrl, name || slug);
    return { installed: installed.installed, slug, owner: resolvedOwner };
  },
};
