function formatCommit(commit) {
  const id = commit.id ? commit.id.substring(0, 7) : 'unknown';
  const message = commit.message ? commit.message.split('\n')[0] : 'No message';
  const author = commit.author && commit.author.name ? commit.author.name : 'unknown';
  return `#${id} · ${message} (${author})`;
}

function buildPushCard(payload) {
  const repo = payload.repository?.full_name || payload.repository?.name || 'repository';
  const pusher = payload.pusher?.name || payload.sender?.login || 'unknown';
  const branch = payload.ref?.replace('refs/heads/', '') || payload.ref;
  const commitCount = payload.commits?.length || 0;
  const title = `${repo} · ${branch || 'push'}`;
  const bodyLines = [
    `${pusher} pushed ${commitCount} commit${commitCount === 1 ? '' : 's'}.`,
  ];
  if (payload.compare) {
    bodyLines.push(`Compare: ${payload.compare}`);
  }
  const commitLines = (payload.commits || []).slice(0, 3).map(formatCommit);
  bodyLines.push(...commitLines);
  return {
    title,
    body: bodyLines.join('\n'),
    durationSeconds: 10,
  };
}

function buildPullRequestCard(payload) {
  const repo = payload.repository?.full_name || 'repository';
  const action = payload.action || 'updated';
  const number = payload.number ? `#${payload.number}` : '';
  const pr = payload.pull_request || {};
  const title = pr.title || 'Pull request';
  const bodyLines = [
    `${repo} ${number} ${action} by ${payload.sender?.login || 'unknown'}.`,
    `State: ${pr.state}`,
  ];
  if (pr.html_url) {
    bodyLines.push(pr.html_url);
  }
  return {
    title: `PR · ${title}`,
    body: bodyLines.join('\n'),
    durationSeconds: 10,
  };
}

function buildIssueCard(payload) {
  const action = payload.action || 'updated';
  const issue = payload.issue || {};
  const repo = payload.repository?.full_name || 'repository';
  const bodyLines = [
    `${repo} issue #${issue.number} ${action} by ${payload.sender?.login || 'unknown'}.`,
  ];
  if (issue.title) {
    bodyLines.push(issue.title);
  }
  if (issue.html_url) {
    bodyLines.push(issue.html_url);
  }
  return {
    title: 'Issue Notification',
    body: bodyLines.join('\n'),
    durationSeconds: 10,
  };
}

function createCardFromEvent(event, payload) {
  switch (event) {
    case 'push':
      return buildPushCard(payload);
    case 'pull_request':
      return buildPullRequestCard(payload);
    case 'issues':
      return buildIssueCard(payload);
    default:
      return {
        title: `GitHub ${event}`,
        body: [
          `Action: ${payload.action || 'received'}`,
          `Sender: ${payload.sender?.login || 'unknown'}`,
        ].join('\n'),
        durationSeconds: 10,
      };
  }
}

module.exports = {
  createCardFromEvent,
};
