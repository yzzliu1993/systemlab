/** 票券格式檢查（HARNESS_SPEC §2.3）與分支命名（§5）。 */

export const REQUIRED_SECTIONS = ['目標', '範圍', '驗收條件', '測試情境'] as const;

export interface TicketCheck {
  ok: boolean;
  missing: string[];
}

function headings(description: string): string[] {
  return description
    .split(/\r?\n/)
    .map((line) => /^#{1,6}\s+(.+?)\s*$/.exec(line)?.[1])
    .filter((h): h is string => h !== undefined);
}

/** 檢查必要段落是否存在，以及測試情境是否至少有一列 T 編號。 */
export function checkTicket(description: string | undefined): TicketCheck {
  const text = description ?? '';
  const found = headings(text);
  const missing: string[] = REQUIRED_SECTIONS.filter(
    (section) => !found.some((h) => h.startsWith(section)),
  );
  if (!missing.includes('測試情境') && !/^\|\s*T\d+\s*\|/m.test(text)) {
    missing.push('測試情境（至少一列 T1）');
  }
  return { ok: missing.length === 0, missing };
}

/**
 * 由 Linear 的 branchName（例：`you-12-roadmap-dag-layout`）產生
 * `<type>/<id>/<slug>`（例：`feat/you-12/roadmap-dag-layout`）。
 */
export function branchNameFor(
  identifier: string,
  linearBranchName: string,
  labelNames: string[],
  typeByLabel: Record<string, string>,
  defaultType: string,
): string {
  const id = identifier.toLowerCase();
  const type = labelNames.map((l) => typeByLabel[l]).find(Boolean) ?? defaultType;
  const tail = linearBranchName.split('/').pop() ?? '';
  const slug =
    tail
      .toLowerCase()
      .replace(new RegExp(`^${id}-?`), '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
      .replace(/-$/, '') || 'task';
  return `${type}/${id}/${slug}`;
}
