const { app } = require('@azure/functions');

require('./functions/registerSession');
require('./functions/endSession');
require('./functions/statusApi');
require('./functions/dashboardPage');
require('./functions/mentraManifest');
require('./functions/webhookAlias');  // Alias für /api/webhook
require('./functions/githubWebhook');
require('./functions/sendTestMessage');

module.exports = app;
