
# Alain's Functionalpatterns Progress

This project is a dynamic, data-driven progress site that renders charts and the latest video per exercise by fetching a single grouped CSV. A small Node.js Express server (`server.js`) serves the frontend and helps build a manifest and proxy remote CSVs exported from Google Sheets / Google Drive.

## Overview

- Frontend: `index.html` and `app.js` fetch a manifest from `GET /api/exercises`, then fetch the grouped CSV (typically proxied at `/data.csv`) and render charts per exercise.
- Server: `server.js` fetches the CSV at `DATA_SOURCE_URL` (when configured) and builds the manifest; if the remote CSV is unavailable, the server falls back to a local `data.csv` file.

## How data flows

1. If `DATA_SOURCE_URL` is set, `server.js` fetches that single grouped CSV and parses it. It groups rows by the `exercise` column and builds the `/api/exercises` manifest. Manifest entries include `key`, `file` (typically `/data.csv`), `url`, and optional metadata `label` and `units` discovered from CSV rows.
2. If fetching/parsing `DATA_SOURCE_URL` fails, the server falls back to a local `data.csv` file in the project root (if present) and builds the manifest from that single file.
3. The frontend fetches the manifest and then fetches the grouped CSV (proxied at `/data.csv`) and groups rows client-side by exercise to render charts and set the latest video iframe per exercise.

## Google Sheets / Drive specifics

- Typical `DATA_SOURCE_URL` values are Google Sheets export URLs:
  - `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=csv&gid=0`
  - Drive direct download: `https://drive.google.com/uc?export=download&id=<FILE_ID>`
- `server.js` contains helper functions for listing files in a public Google Drive folder using a `GDRIVE_API_KEY` and for fetching spreadsheets as CSV, but those helpers are not used by the primary `DATA_SOURCE_URL` flow.

## CSV format (single grouped CSV)

- Recommended header: `exercise,ts,value,units,youtubeId,label`
- `exercise`: grouping key (e.g., `broad_jump`).
- `ts` (or `date` or `timestamp`): ISO date or timestamp; rows are sorted chronologically before rendering.
- `value`: numeric measurement.
- `units`: optional human-readable units string used in chart labels.
- `youtubeId`: optional; include a full YouTube URL for reliable embedding (client accepts several YouTube URL forms).

## Server endpoints

- `GET /api/exercises` — JSON manifest of exercises (array items: `{key,file,url,label,units}`)
- `GET /data.csv` — proxy for the configured `DATA_SOURCE_URL` (if set and reachable)
- Static files — `index.html`, `app.js`, `styles.css`, and `data.csv` (if present locally)

## Notes

- The runtime data path is a single grouped CSV (remote via `DATA_SOURCE_URL` or local `data.csv`).

## Environment variables

- `DATA_SOURCE_URL` — optional. URL to a grouped CSV (Google Sheets export URL is common). When set, the server will fetch this CSV and build the manifest.
- `GDRIVE_API_KEY` — optional. Drive API key used by Drive-folder listing helpers (not used by the default grouped-CSV flow).

## Run locally

Prereqs: Node.js installed.

1. Install dependencies:

```powershell
npm install
```

2. Start the app:

```powershell
npm start
```

To run with a `DATA_SOURCE_URL` inline in PowerShell:

```powershell
$env:DATA_SOURCE_URL='https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=0'; npm start
```

## Troubleshooting

- If the frontend logs `No exercise sections found and no server manifest available`, ensure the server is running and `GET /api/exercises` returns a non-empty manifest, or add a `data.csv` file to the project root.
- If the grouped Google Sheets CSV fails to parse, confirm the export URL and that the sheet is publicly accessible (or accessible from the server environment). The server falls back to `data.csv` on failure.

## Adding data

- Add or edit a grouped `data.csv` (or set `DATA_SOURCE_URL` to point to a Google Sheet export).

---

If you'd like, I can commit this README change, start the server locally and show logs, or add a sample `data.csv` file to the repo — tell me which you'd like next.
