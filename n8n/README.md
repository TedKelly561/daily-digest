# n8n version: health check + daily digest

`m2-health-check.json` is an n8n workflow you can import (Workflows → Import from file). It has two branches.

**Health check, every 15 minutes**

Schedule trigger → read the **Automations** sheet → read the **Automation Log** sheet → a Code node checks each automation → IF there are new problems → email the office and post to Slack `#ops-alerts`.

The Code node flags two kinds of problem:

- **Retries ran out.** The last log row is `failed` on attempt 4 (the first run plus 3 retries).
- **Missed heartbeat.** The automation should have run by now (its schedule plus 5 minutes of grace) and there's no log row. This catches automations that stop without ever throwing an error.

Paused automations aren't checked. Automations in shadow mode only log, so nothing is checked for them either. Workflow static data remembers what has already been alerted, so a person gets one message per problem, not one every 15 minutes.

**Daily digest, 6:30 AM**

Schedule trigger → **Settings** (`shadowMode`, `digestTo`) → read Jobs → read the run log → a Code node builds the HTML and plain-text digest → IF shadow mode → either log it or send it → write a row to the Automation Log, so the digest has a heartbeat of its own.

## Safety settings already in the file

- Every Google Sheets, SMTP and Slack node has **Retry on fail** set to 3 tries, 5 seconds apart.
- `settings.errorWorkflow` is a placeholder. Point it at a small "fail to a person" workflow (an Error Trigger node followed by an SMS or email node), so that if this workflow crashes, someone still hears about it.
- Failed executions are saved, so there's always a record of what went wrong.

## Before you turn it on

1. Replace `REPLACE_WITH_YOUR_SHEET_ID` in the five Google Sheets nodes, then connect your own Google Sheets, SMTP and Slack credentials. The credential IDs in the file are placeholders.
2. Change the `example.com` addresses to real ones.
3. Leave `shadowMode` set to `true` for the first week, and compare what it logs with what actually happened.
4. Set the error workflow, then activate the workflow.

The sheet columns are the same as in the Apps Script version. See the header comment in `../apps-script/daily-digest.gs`.
