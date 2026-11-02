import type { Tool } from '../types';
import { obj, str, fetchText, clip } from '../util';

export const webFetch: Tool<{ url: string }> = {
  description: 'Fetch a URL (HTTPS) and return its text content.',
  params: obj({ url: str }, ['url']),
  run: async ({ url }) => {
    const text = await fetchText(url);
    return { url, text: clip(text, 20000) };
  },
};
