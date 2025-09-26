const { app } = require('@azure/functions');

app.http('httpTrigger', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('HTTP trigger function processed a request.');

        // Get query parameters and body
        const name = request.query.get('name') || (await request.text()) || 'World';

        // Example response for mentraOS push events
        const response = {
            message: `Hello, ${name}! This Azure Function is ready to handle webpush events.`,
            timestamp: new Date().toISOString(),
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers.entries())
        };

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(response, null, 2)
        };
    }
});