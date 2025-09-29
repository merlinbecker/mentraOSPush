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
            <th>Actions</th>
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
              <td>
                <button 
                  @click="sendTestMessage(session.identifier)" 
                  :disabled="session.testLoading"
                  class="secondary outline"
                  style="font-size: 0.8rem; padding: 0.25rem 0.5rem;"
                >
                  <span x-show="!session.testLoading">🧪 Test</span>
                  <span x-show="session.testLoading">⏳</span>
                </button>
              </td>
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
          try {
            console.log('Loading dashboard data...');
            const response = await fetch('./status');
            console.log('Status response:', response.status, response.statusText);
            
            if (!response.ok) {
              console.error('Failed to load status:', response.status, response.statusText);
              return;
            }
            
            const data = await response.json();
            console.log('Received data:', data);
            
            this.sessions = data.sessions || [];
            this.recentPushes = data.recentPushes || [];
            
            // Add testLoading property to each session
            this.sessions.forEach(session => {
              session.testLoading = false;
            });
            
            console.log('Updated sessions:', this.sessions.length);
            console.log('Updated pushes:', this.recentPushes.length);
          } catch (error) {
            console.error('Error loading dashboard data:', error);
          }
        },
        async sendTestMessage(identifier) {
          try {
            // Find the session and set loading state
            const session = this.sessions.find(s => s.identifier === identifier);
            if (session) {
              session.testLoading = true;
            }

            console.log('Sending test message to: ' + identifier);
            const response = await fetch('./test-message/' + encodeURIComponent(identifier), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            });

            const result = await response.json();

            if (response.ok && result.success) {
              console.log('Test message sent successfully');
              // Show temporary success message
              this.showNotification('Test message sent successfully!', 'success');
              
              // Refresh data to update last activity
              setTimeout(() => this.load(), 1000);
            } else {
              console.error('Failed to send test message:', result.error);
              this.showNotification('Failed to send test message: ' + result.error, 'error');
            }
          } catch (error) {
            console.error('Error sending test message:', error);
            this.showNotification('Error: ' + error.message, 'error');
          } finally {
            // Reset loading state
            const session = this.sessions.find(s => s.identifier === identifier);
            if (session) {
              session.testLoading = false;
            }
          }
        },
        showNotification(message, type) {
          type = type || 'info';
          // Simple notification - you could enhance this with a toast library
          const style = type === 'success' ? 'color: green' : 
                       type === 'error' ? 'color: red' : 'color: blue';
          console.log('%c' + message, style);
          
          // Show browser notification if possible
          if (window.Notification && Notification.permission === 'granted') {
            new Notification('mentraOS Gateway', { body: message });
          }
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
