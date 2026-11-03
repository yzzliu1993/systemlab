import { LinearClient } from '@linear/sdk';

export const LABELS = {
  working: 'agent:working',
  awaitingMerge: 'awaiting-merge',
  needsHuman: 'needs-human',
  specNeeded: 'spec-needed',
  agentProposed: 'agent-proposed',
  decomposed: 'decomposed',
  draft: 'draft',
} as const;

export interface Ticket {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  branchName: string;
  stateName: string;
  labelNames: string[];
}

/** Orchestrator 用的 Linear 操作；只封裝 harness 需要的部分。 */
export class Linear {
  private readonly client: LinearClient;
  private readonly teamName: string;
  private teamId: string | undefined;
  private readonly labelIds = new Map<string, string>();
  private readonly stateIds = new Map<string, string>();

  constructor(apiKey: string, teamName: string) {
    this.client = new LinearClient({ apiKey });
    this.teamName = teamName;
  }

  async getTicket(identifier: string): Promise<Ticket> {
    const issue = await this.client.issue(identifier);
    const [state, labels] = await Promise.all([issue.state, issue.labels()]);
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
      url: issue.url,
      branchName: issue.branchName,
      stateName: state?.name ?? '',
      labelNames: labels.nodes.map((l) => l.name),
    };
  }

  private async getTeamId(): Promise<string> {
    if (this.teamId) return this.teamId;
    const teams = await this.client.teams({ filter: { name: { eq: this.teamName } } });
    const team = teams.nodes[0];
    if (!team) throw new Error(`找不到 Linear team：${this.teamName}`);
    this.teamId = team.id;
    return team.id;
  }

  private async stateId(name: string): Promise<string> {
    const cached = this.stateIds.get(name);
    if (cached) return cached;
    const teamId = await this.getTeamId();
    const states = await this.client.workflowStates({
      filter: { team: { id: { eq: teamId } }, name: { eq: name } },
    });
    const state = states.nodes[0];
    if (!state) throw new Error(`找不到 Linear 狀態：${name}`);
    this.stateIds.set(name, state.id);
    return state.id;
  }

  private async labelId(name: string): Promise<string> {
    const cached = this.labelIds.get(name);
    if (cached) return cached;
    const labels = await this.client.issueLabels({ filter: { name: { eq: name } } });
    const label = labels.nodes[0];
    if (!label) throw new Error(`找不到 Linear 標籤：${name}（請先依 HARNESS_SPEC §11.3 建立）`);
    this.labelIds.set(name, label.id);
    return label.id;
  }

  async setState(ticket: Ticket, stateName: string): Promise<void> {
    if (ticket.stateName === stateName) return;
    await this.client.updateIssue(ticket.id, { stateId: await this.stateId(stateName) });
    ticket.stateName = stateName;
  }

  async addLabel(ticket: Ticket, name: string): Promise<void> {
    if (ticket.labelNames.includes(name)) return;
    await this.client.issueAddLabel(ticket.id, await this.labelId(name));
    ticket.labelNames.push(name);
  }

  async removeLabel(ticket: Ticket, name: string): Promise<void> {
    if (!ticket.labelNames.includes(name)) return;
    await this.client.issueRemoveLabel(ticket.id, await this.labelId(name));
    ticket.labelNames = ticket.labelNames.filter((l) => l !== name);
  }

  async comment(ticket: Ticket, body: string): Promise<void> {
    await this.client.createComment({ issueId: ticket.id, body });
  }

  /** 把票指派給 API key 的擁有者（你），讓 Linear 發通知（HARNESS_SPEC §3.4）。 */
  async assignToMe(ticket: Ticket): Promise<void> {
    const viewer = await this.client.viewer;
    await this.client.updateIssue(ticket.id, { assigneeId: viewer.id });
  }
}
