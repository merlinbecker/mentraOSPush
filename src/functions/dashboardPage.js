const { app } = require('@azure/functions');

const picoCdn = 'https://unpkg.com/@picocss/pico@2.0.6/css/pico.min.css';
const alpineCdn = 'https://cdn.jsdelivr.net/npm/alpinejs@3.13.5/dist/cdn.min.js';

app.http('dashboardPage', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard',
  handler: async () => {
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mentraOS GitHub Gateway</title>
  <link rel="stylesheet" href="${picoCdn}" />
  <script defer src="${alpineCdn}"></script>
</head>
<body>
  <main class="container" x-data="dashboard()" x-init="load()">
    <section>
      <h1>mentraOS GitHub Gateway</h1>
      <p>This dashboard shows the currently connected G1 glasses sessions and the latest webhook deliveries.</p>
      <button @click="load" class="contrast">Refresh</button>
    </section>
    <section>
      <h2>Connected Glasses <span x-text="sessions.length"></span></h2>
      <div x-show="sessions.length === 0">No active sessions.</div>
      <table role="grid" x-show="sessions.length > 0">
        <thead>
          <tr>
            <th>Identifier</th>
            <th>Device ID</th>
            <th>Owner</th>
            <th>Connected</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="session in sessions" :key="session.identifier">
            <tr>
              <td x-text="session.identifier"></td>
              <td x-text="session.deviceId"></td>
              <td x-text="session.ownerId || '—'"></td>
              <td x-text="formatDate(session.connectedAt)"></td>
              <td x-text="formatDate(session.lastActivityAt)"></td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Recent Pushes</h2>
      <div x-show="recentPushes.length === 0">No webhook deliveries received.</div>
      <template x-for="entry in recentPushes" :key="entry.timestamp">
        <article class="grid">
          <header>
            <strong x-text="entry.title"></strong>
            <p x-text="entry.event"></p>
          </header>
          <p x-text="entry.summary"></p>
          <footer>
            <small x-text="formatDate(entry.timestamp)"></small>
          </footer>
        </article>
      </template>
    </section>
  </main>
  <script>
    function dashboard() {
      return {
        sessions: [],
        recentPushes: [],
        async load() {
          const response = await fetch('../status');
          if (!response.ok) {
            console.error('Failed to load status');
            return;
          }
          const data = await response.json();
          this.sessions = data.sessions || [];
          this.recentPushes = data.recentPushes || [];
        },
        formatDate(value) {
          if (!value) return '—';
          try {
            return new Date(value).toLocaleString();
          } catch (error) {
            return value;
          }
        },
      };
    }
  </script>
</body>
</html>`;

    return {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    };
  },
});
