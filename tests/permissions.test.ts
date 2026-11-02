import { describe, it, expect } from 'vitest';
import { decide } from '../src/api/permissions';
import { readFile } from '../src/tools/readFile';

describe('permissions', () => {
  it('allows safe reads', () => {
    const cfg = { rules: { '*': 'ask', read_file: 'allow' }, autoApprove: false };
    const d = decide(readFile, { path: 'package.json' }, cfg as any);
    expect(d.approve).toBe(true);
  });
});
