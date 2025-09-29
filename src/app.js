const { app } = require('@azure/functions');

require('./functions/registerSession');
require('./functions/endSession');
require('./functions/statusApi');
require('./functions/dashboardPage');
require('./functions/mentraManifest');
require('./functions/githubWebhook');

module.exports = app;
