import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HARNESS_DIR } from './config';

/** 以 `{{key}}` 取代模板中的變數；未提供的變數換成空字串，避免把佔位符送給 agent。 */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''));
}

export function loadPrompt(name: 'implement'): string {
  return readFileSync(path.join(HARNESS_DIR, 'prompts', `${name}.md`), 'utf8');
}
