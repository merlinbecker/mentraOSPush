# mentraOSPush

Gateway Azure Function that receives GitHub webhooks and relays them to mentraOS G1 glasses as reference cards. The app also exposes the mandatory mentraOS application manifest and an in-memory session registry for connected glasses.

## Architecture at a Glance

```
GitHub Webhook  ─┐              ┌─>  mentraOS Reference Card API
                 ├─> Azure Function (Node.js) ─┤
mentraOS G1 App ─┘              └─>  Dashboard (PicoCSS + Alpine.js)
```

1. A G1 device registers itself with an identifier via `POST /api/sessions`.
2. The identifier is shared with the GitHub repository webhook configuration (`https://<app>/api/github/{identifier}`).
3. Incoming GitHub events are verified, normalised into mentraOS reference card payloads and forwarded to the registered session.
4. Deliveries and sessions are tracked in memory and surfaced through a lightweight dashboard at `/api/dashboard`.

> **Note**: The session store is in-memory only. Restarting the function app clears all registrations. The code is structured so a Cosmos DB or Storage Table implementation can replace the current store later.

## Prerequisites

- Node.js 18.0.0 or later
- Azure Functions Core Tools v4 (for local development)
- Azure subscription (for deployment)
- A mentraOS API endpoint (base URL or direct push URL) and credential (access token or API key)

## Configuration

Environment variables (`local.settings.json` for local runs):

| Key | Description |
| --- | --- |
| `GITHUB_WEBHOOK_SECRET` | Optional shared secret used to validate GitHub webhook payloads. |
| `MENTRA_REFERENCE_CARD_PATH` | Optional override for the reference card endpoint path appended to a session `baseUrl`. Defaults to `/api/v1/reference-cards`. |

## mentraOS Session Flow

1. **Retrieve manifest** – `GET /api/manifest` responds with metadata describing the gateway and its capabilities.
2. **Register session** – `POST /api/sessions` with JSON body:
   ```json
   {
     "identifier": "team-octocats",
     "deviceId": "G1-42",
     "ownerId": "octocat",
     "baseUrl": "https://mentraos.example.com",
     "accessToken": "<mentra-token>"
   }
   ```
   The response includes the GitHub webhook URL (`/api/github/{identifier}`).
3. **Webhook delivery** – Configure GitHub to POST to the provided webhook URL with the same shared secret configured in the function app.
4. **Session cleanup** – `DELETE /api/sessions/{identifier}` when the glasses disconnect.

The identifier associates webhook deliveries with the owning glasses. Future persistence can be introduced by swapping the session store implementation in `src/services/sessionStore.js`.

## GitHub Webhook Support

- Signature validation via `X-Hub-Signature-256` when a secret is configured.
- Events formatted into mentraOS reference cards:
  - `push` (includes branch, compare URL and up to three commits)
  - `pull_request` updates
  - `issues` updates
  - Other events fall back to a generic card containing the action and sender.
- Each accepted delivery is tracked in memory and surfaced to the dashboard and status API.

## Endpoints

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/manifest` | mentraOS application manifest. |
| `POST` | `/api/sessions` | Register a G1 session with identifier, device and mentraOS connection details. |
| `DELETE` | `/api/sessions/{identifier}` | Remove a registered session. |
| `POST` | `/api/github/{identifier}` | GitHub webhook receiver; relays payload to the associated session. |
| `GET` | `/api/status` | JSON summary of sessions and last three deliveries. |
| `GET` | `/api/dashboard` | PicoCSS/Alpine.js dashboard visualising sessions and deliveries. |

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy and adjust local settings:
   ```bash
   cp local.settings.json.template local.settings.json
   ```
3. Populate `local.settings.json` with the environment variables listed above.

## Local Development

Install Azure Functions Core Tools v4 if not already present:

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

Run the function app locally:

```bash
func start
```

- Dashboard: `http://localhost:7071/api/dashboard`
- Status API: `http://localhost:7071/api/status`

## Project Structure

```
├── src/
│   ├── app.js                         # Function registrations
│   ├── functions/
│   │   ├── dashboardPage.js           # PicoCSS/Alpine dashboard
│   │   ├── endSession.js              # DELETE /api/sessions/{identifier}
│   │   ├── githubWebhook.js           # GitHub webhook receiver
│   │   ├── mentraManifest.js          # mentraOS manifest
│   │   ├── registerSession.js         # POST /api/sessions
│   │   └── statusApi.js               # GET /api/status
│   ├── services/
│   │   ├── mentraClient.js            # Reference card delivery helper
│   │   └── sessionStore.js            # In-memory session & push store
│   └── utils/
│       └── githubFormatter.js         # GitHub event → reference card mapper
├── host.json
├── local.settings.json.template
└── package.json
```

## Deployment

Publish the function app using the Azure Functions tooling of your choice. Example with the Azure CLI:

```bash
func azure functionapp publish <YOUR_FUNCTION_APP_NAME>
```

## Next Steps

- Replace the in-memory store with Cosmos DB, Azure Cache for Redis or Table Storage for durability.
- Extend webhook support to additional providers (e.g., Azure DevOps) while reusing the mentraOS delivery pipeline.
- Add authentication for the dashboard and status API before exposing them publicly.
