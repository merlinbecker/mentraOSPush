const { createHandler } = require('azure-function-express');
const app = require('./expressApp');

module.exports = createHandler(app);
