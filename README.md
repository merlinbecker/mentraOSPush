# mentraOSPush

A short demonstration how to webpush events to mentraOS and to G1 using Azure Functions v4 with Node.js.

## Prerequisites

- Node.js 18.0.0 or later
- Azure Functions Core Tools (for local development)
- Azure subscription (for deployment)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the local settings template:
   ```bash
   cp local.settings.json.template local.settings.json
   ```

4. Update `local.settings.json` with your specific configuration values if needed.

## Local Development

To run the function locally, you'll need Azure Functions Core Tools installed:

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

Then start the function app:

```bash
func start
```

The HTTP trigger function will be available at:
`http://localhost:7071/api/httpTrigger`

## Function Endpoints

### HTTP Trigger
- **URL**: `/api/httpTrigger`
- **Methods**: GET, POST
- **Description**: Main endpoint for handling webpush events

Example usage:
```bash
# GET request
curl "http://localhost:7071/api/httpTrigger?name=mentraOS"

# POST request
curl -X POST "http://localhost:7071/api/httpTrigger" -d "mentraOS"
```

## Project Structure

```
├── src/
│   ├── app.js                 # Main application entry point
│   └── functions/
│       └── httpTrigger.js     # HTTP trigger function
├── host.json                  # Azure Functions host configuration
├── local.settings.json        # Local development settings
├── local.settings.json.template # Template for local settings
└── package.json              # Node.js dependencies
```

## Deployment

To deploy to Azure, use the Azure CLI or Visual Studio Code Azure Functions extension.

With Azure CLI:
```bash
func azure functionapp publish <YOUR_FUNCTION_APP_NAME>
```

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Azure Functions v4
- **Language**: JavaScript
- **Trigger Type**: HTTP
- **Programming Model**: Azure Functions v4 (simplified)
