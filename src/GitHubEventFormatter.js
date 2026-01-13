/**
 * GitHubEventFormatter - Formats GitHub webhook events into reference cards
 * 
 * Responsibilities:
 * - Parse GitHub webhook payloads
 * - Format events into readable reference cards
 */
class GitHubEventFormatter {
  /**
   * Format a commit for display
   */
  static formatCommit(commit) {
    const id = commit.id ? commit.id.substring(0, 7) : 'unknown';
    const message = commit.message ? commit.message.split('\n')[0] : 'No message';
    const author = commit.author && commit.author.name ? commit.author.name : 'unknown';
    return `#${id} · ${message} (${author})`;
  }

  /**
   * Create a reference card from a GitHub event
   */
  static createCardFromEvent(event, payload) {
    const repo = payload.repository?.full_name || payload.repository?.name || 'repository';
    const sender = payload.sender?.login || 'unknown';
    
    switch (event) {
      case 'push':
        return this.formatPushEvent(payload, repo, sender);
      
      case 'pull_request':
        return this.formatPullRequestEvent(payload, repo, sender);
      
      case 'issues':
        return this.formatIssueEvent(payload, repo, sender);
      
      default:
        return this.formatGenericEvent(event, payload, repo, sender);
    }
  }

  /**
   * Format a push event
   */
  static formatPushEvent(payload, repo, sender) {
    const pusher = payload.pusher?.name || sender;
    const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
    const commitCount = payload.commits?.length || 0;
    const commits = (payload.commits || []).slice(0, 3).map(this.formatCommit);
    
    return {
      title: `${repo} · ${branch}`,
      body: [
        `${pusher} pushed ${commitCount} commit${commitCount === 1 ? '' : 's'}`,
        ...commits,
        payload.compare ? `Compare: ${payload.compare}` : ''
      ].filter(Boolean).join('\n'),
      durationSeconds: 15,
    };
  }

  /**
   * Format a pull request event
   */
  static formatPullRequestEvent(payload, repo, sender) {
    const pr = payload.pull_request || {};
    return {
      title: `PR #${payload.number} · ${pr.title || 'Pull Request'}`,
      body: [
        `${repo} ${payload.action} by ${sender}`,
        `State: ${pr.state}`,
        pr.html_url || ''
      ].filter(Boolean).join('\n'),
      durationSeconds: 15,
    };
  }

  /**
   * Format an issue event
   */
  static formatIssueEvent(payload, repo, sender) {
    const issue = payload.issue || {};
    return {
      title: `Issue #${issue.number} · ${issue.title || 'Issue'}`,
      body: [
        `${repo} ${payload.action} by ${sender}`,
        issue.html_url || ''
      ].filter(Boolean).join('\n'),
      durationSeconds: 15,
    };
  }

  /**
   * Format a generic event
   */
  static formatGenericEvent(event, payload, repo, sender) {
    return {
      title: `GitHub ${event}`,
      body: [
        `Repository: ${repo}`,
        `Action: ${payload.action || 'received'}`,
        `Sender: ${sender}`
      ].join('\n'),
      durationSeconds: 10,
    };
  }
}

module.exports = GitHubEventFormatter;
