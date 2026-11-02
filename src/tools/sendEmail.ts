import type { Tool } from '../types';
import { obj, str } from '../util';
import fs from 'fs';
import path from 'path';
import { EXP } from '../store';

export const sendEmail: Tool<Json> = {
  description: 'Send an email. Needs approval.',
  params: obj({ to: str, subject: str, body: str }, ['to', 'subject', 'body']),
  risky: true,
  run: (a) => ({ sent: false, note: 'Stub: connect your email provider.', ...a }),
};

type Json = Record<string, any>;
