import type { Tool } from '../types';
import { todoWrite } from './todoWrite';
import { artifactWrite } from './artifactWrite';
import { shell } from './shell';
import { runCode } from './runCode';
import { loadSkill } from './loadSkill';
import { installSkill } from './installSkill';
import { installPlugin } from './installPlugin';
import { sendEmail } from './sendEmail';
import { readFile } from './readFile';
import { listFiles } from './listFiles';
import { applyEdit } from './applyEdit';
import { memoryWrite } from './memoryWrite';
import { delegate } from './delegate';
import { grepTool } from './grep';
import { globTool } from './glob';
import { webSearch } from './webSearch';
import { webFetch } from './webFetch';
import { skillSearch } from './skillSearch';
import { skillInstall } from './skillInstall';

export const builtin: Record<string, Tool> = {
  todo_write: todoWrite,
  artifact_write: artifactWrite,
  shell,
  run_code: runCode,
  load_skill: loadSkill,
  install_skill: installSkill,
  install_plugin: installPlugin,
  send_email: sendEmail,
  read_file: readFile,
  list_files: listFiles,
  apply_edit: applyEdit,
  memory_write: memoryWrite,
  delegate,
  grep: grepTool,
  glob: globTool,
  web_search: webSearch,
  web_fetch: webFetch,
  skill_search: skillSearch,
  skill_install: skillInstall,
};
