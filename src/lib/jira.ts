import type { ExtractedBlocker } from './types';

type CreateJiraBlockerTicketInput = {
  summary: string;
  description: string;
  priority: ExtractedBlocker['priority'];
};

type CreateJiraBlockerTicketResult = { id: string; key: string; self: string };

function adfDoc(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

async function postIssue(fields: Record<string, unknown>): Promise<Response> {
  const host = process.env.JIRA_HOST_NAME;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!host || !email || !token) {
    throw new Error('JIRA_HOST_NAME, JIRA_USER_EMAIL, and JIRA_API_TOKEN must be set');
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return fetch(`https://${host}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
}

/**
 * Creates a Jira issue for a spoken blocker. `priority` is attempted first;
 * Jira frequently rejects it with a 400 naming the field (it's often not on
 * the project's create screen) — on that specific failure we retry once
 * without `priority`, folding it into the summary instead, rather than
 * failing the whole extraction.
 */
export async function createJiraBlockerTicket({
  summary,
  description,
  priority,
}: CreateJiraBlockerTicketInput): Promise<CreateJiraBlockerTicketResult> {
  const projectKey = process.env.JIRA_PROJECT_KEY;
  if (!projectKey) throw new Error('JIRA_PROJECT_KEY must be set');
  const issueType = process.env.JIRA_ISSUE_TYPE || 'Task';

  const baseFields = {
    project: { key: projectKey },
    issuetype: { name: issueType },
    description: adfDoc(description),
  };

  let res = await postIssue({
    ...baseFields,
    summary: `[AUTOMATED BLOCKER] ${summary}`,
    priority: { name: priority },
  });

  if (res.status === 400) {
    const body: { errors?: Record<string, string> } | null = await res.json().catch(() => null);
    const priorityRejected = Boolean(body?.errors && 'priority' in body.errors);

    if (!priorityRejected) {
      throw new Error(`Jira create issue failed (400): ${JSON.stringify(body)}`);
    }

    // ponytail: priority not on the create screen — retry once without it,
    // prefix the summary with priority instead, so one flaky field never
    // kills a ticket.
    res = await postIssue({
      ...baseFields,
      summary: `[AUTOMATED BLOCKER][${priority}] ${summary}`,
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jira create issue failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { id: data.id, key: data.key, self: data.self };
}
