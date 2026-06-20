const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const WORKFLOW_ID = process.env.GITHUB_WORKFLOW_ID || 'playwright.yml';
const GITHUB_API = 'https://api.github.com';
const DEFAULT_BRANCH = process.env.GITHUB_REF || 'main';

let logBuffer = [];
let clients = [];
const testRuns = new Map();

const flowToSpec = {
  requestLoan: 'tests/ui/requestLoanUi.spec.ts',
  lendLoan: 'tests/ui/lendLoanUi.spec.ts',
  requestAndLend: 'tests/ui/requestAndLendUi.spec.ts',
  counterRecounter: 'tests/ui/counterRecounterUi.spec.ts',
  repayment: 'tests/repayment/repayment.spec.ts',
};

//test
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(str) {
  return str.replace(ansiRegex, '');
}

function broadcastLog(data) {
  const cleanData = stripAnsi(data);
  logBuffer.push(cleanData);
  if (logBuffer.length > 5000) {
    logBuffer.shift();
  }
  clients.forEach(res => {
    res.write(`data: ${JSON.stringify({ text: cleanData })}\n\n`);
  });
}

function logSystem(message, details) {
  const line = `[SYSTEM] ${new Date().toISOString()} ${message}${details ? ` ${JSON.stringify(details)}` : ''}\n`;
  console.log(line.trim());
  broadcastLog(line);
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function requireGithubConfig() {
  const missing = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'].filter(name => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing GitHub configuration: ${missing.join(', ')}`);
  }
}

async function githubRequest(pathname, options = {}) {
  requireGithubConfig();

  const response = await fetch(`${GITHUB_API}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'realworld-e2e-runner',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${data?.message || text}`);
  }

  return data;
}

function repoPath(pathname) {
  return `/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}${pathname}`;
}

function sanitizeConfig(params) {
  return {
    flow: params.flow,
    borrowerEmail: params.borrowerEmail,
    borrowerPassword: params.borrowerPassword,
    lenderEmail: params.lenderEmail,
    lenderPassword: params.lenderPassword,
    loanAmountMin: params.loanAmountMin,
    loanAmountMax: params.loanAmountMax,
    aprMin: params.aprMin,
    aprMax: params.aprMax,
    duration: params.duration,
    iterations: params.iterations,
  };
}

function publicRun(run) {
  return {
    runId: run.runId,
    trackingId: run.trackingId,
    workflowRunId: run.workflowRunId,
    status: run.status,
    conclusion: run.conclusion,
    flow: run.flow,
    specFile: run.specFile,
    htmlUrl: run.htmlUrl,
    logsUrl: run.logsUrl,
    artifacts: run.artifacts || [],
    message: run.message,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

async function dispatchWorkflow(run) {
  await githubRequest(repoPath(`/actions/workflows/${WORKFLOW_ID}/dispatches`), {
    method: 'POST',
    body: JSON.stringify({
      ref: process.env.GITHUB_WORKFLOW_REF || DEFAULT_BRANCH,
      inputs: {
        request_id: run.trackingId,
        flow: run.flow,
        spec_file: run.specFile,
        ui_config_json: JSON.stringify(run.uiConfig),
      },
    }),
  });
}

async function findWorkflowRun(run) {
  const created = encodeURIComponent(`>=${run.createdAt}`);
  const data = await githubRequest(
    repoPath(`/actions/workflows/${WORKFLOW_ID}/runs?event=workflow_dispatch&created=${created}&per_page=20`),
  );

  return data.workflow_runs?.find(item => item.display_title?.includes(run.trackingId)) || null;
}

async function refreshRun(run) {
  if (!run.workflowRunId) {
    const workflowRun = await findWorkflowRun(run);
    if (!workflowRun) {
      run.status = 'queued';
      run.updatedAt = new Date().toISOString();
      return run;
    }

    run.workflowRunId = workflowRun.id;
    run.runId = String(workflowRun.id);
  }

  const workflowRun = await githubRequest(repoPath(`/actions/runs/${run.workflowRunId}`));
  run.status = workflowRun.status;
  run.conclusion = workflowRun.conclusion;
  run.htmlUrl = workflowRun.html_url;
  run.logsUrl = workflowRun.logs_url;
  run.updatedAt = new Date().toISOString();
  return run;
}

async function getArtifacts(run) {
  await refreshRun(run);
  if (!run.workflowRunId) {
    return [];
  }

  const data = await githubRequest(repoPath(`/actions/runs/${run.workflowRunId}/artifacts`));
  run.artifacts = (data.artifacts || []).map(artifact => ({
    id: artifact.id,
    name: artifact.name,
    sizeInBytes: artifact.size_in_bytes,
    expired: artifact.expired,
    createdAt: artifact.created_at,
    updatedAt: artifact.updated_at,
    archiveDownloadUrl: artifact.archive_download_url,
  }));
  run.updatedAt = new Date().toISOString();
  return run.artifacts;
}

async function cancelRun(run) {
  await refreshRun(run);
  if (!run.workflowRunId) {
    run.status = 'cancelled';
    run.conclusion = 'cancelled';
    run.updatedAt = new Date().toISOString();
    return run;
  }

  await githubRequest(repoPath(`/actions/runs/${run.workflowRunId}/cancel`), { method: 'POST' });
  run.status = 'cancelled';
  run.conclusion = 'cancelled';
  run.updatedAt = new Date().toISOString();
  return run;
}

function getRun(runId) {
  return testRuns.get(runId) || [...testRuns.values()].find(run => String(run.workflowRunId) === String(runId));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.url === '/stream-logs') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      logBuffer.forEach(line => {
        res.write(`data: ${JSON.stringify({ text: line })}\n\n`);
      });

      clients.push(res);
      req.on('close', () => {
        clients = clients.filter(client => client !== res);
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/run-test') {
      const params = await readBody(req);
      const specFile = flowToSpec[params.flow];

      if (!specFile) {
        json(res, 400, { success: false, message: 'Invalid flow selected!' });
        return;
      }

      const trackingId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const run = {
        runId: trackingId,
        trackingId,
        workflowRunId: null,
        status: 'queued',
        conclusion: null,
        flow: params.flow,
        specFile,
        uiConfig: sanitizeConfig(params),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artifacts: [],
      };

      testRuns.set(trackingId, run);
      logBuffer = [];
      logSystem('Received /run-test request', {
        trackingId,
        flow: run.flow,
        specFile: run.specFile,
      });

      await dispatchWorkflow(run);
      logSystem('Dispatched GitHub Actions workflow', {
        trackingId,
        workflow: WORKFLOW_ID,
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
      });

      for (let attempt = 0; attempt < 5 && !run.workflowRunId; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await refreshRun(run);
      }

      json(res, 200, {
        success: true,
        message: run.workflowRunId
          ? `GitHub Actions workflow started: ${run.workflowRunId}`
          : `GitHub Actions workflow dispatched. Tracking id: ${trackingId}`,
        ...publicRun(run),
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/test-status/')) {
      const runId = decodeURIComponent(req.url.replace('/test-status/', ''));
      const run = getRun(runId);
      if (!run) {
        json(res, 404, { success: false, message: 'Unknown run id' });
        return;
      }

      await refreshRun(run);
      if (run.status === 'completed') {
        await getArtifacts(run);
      }

      json(res, 200, { success: true, ...publicRun(run) });
      return;
    }


    if (req.method === 'GET' && req.url?.startsWith('/test-logs/')) {
      const runId = decodeURIComponent(req.url.replace('/test-logs/', ''));
      const run = getRun(runId);
      if (!run) {
        json(res, 404, { success: false, message: 'Unknown run id' });
        return;
      }

      const logs = await getRunLogs(run);
      json(res, 200, {
        success: true,
        runId: run.runId,
        workflowRunId: run.workflowRunId,
        status: run.status,
        conclusion: run.conclusion,
        summary: logs.summary,
        fullText: logs.fullText.slice(-120000),
        files: logs.files,
      });
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/test-results/')) {
      const runId = decodeURIComponent(req.url.replace('/test-results/', ''));
      const run = getRun(runId);
      if (!run) {
        json(res, 404, { success: false, message: 'Unknown run id' });
        return;
      }

      await refreshRun(run);
      await getArtifacts(run);
      json(res, 200, { success: true, ...publicRun(run) });
      return;
    }

    if (req.method === 'POST' && req.url === '/stop-test') {
      const latestRun = [...testRuns.values()].reverse().find(run => !['completed', 'cancelled'].includes(run.status));
      if (!latestRun) {
        json(res, 400, { success: false, message: 'No test is currently running.' });
        return;
      }

      await cancelRun(latestRun);
      logSystem('GitHub Actions workflow cancellation requested', {
        runId: latestRun.runId,
        workflowRunId: latestRun.workflowRunId,
      });
      json(res, 200, { success: true, message: 'Cancellation requested.', ...publicRun(latestRun) });
      return;
    }

    if (req.url === '/browser') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>GitHub Actions Runner</title></head>
        <body style="font-family: Arial, sans-serif; background: #111827; color: #f9fafb; padding: 32px;">
          <h1>GitHub Actions execution enabled</h1>
          <p>Playwright now runs in GitHub Actions. Use the dashboard status and workflow artifact links for results.</p>
        </body>
        </html>
      `);
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      json(res, 200, {
        status: 'ok',
        service: 'RealWorld E2E Backend API',
        executionProvider: 'github-actions',
        message: 'Backend API is running. Use the Vercel frontend for the dashboard.',
        endpoints: ['/health', '/run-test', '/test-status/:runId', '/test-results/:runId', '/test-logs/:runId'],
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/sample-data') {
      json(res, 200, {
        status: 'success',
        message: 'Sample data endpoint. More data structures will be defined later.',
        timestamp: new Date().toISOString(),
        sampleData: {
          scenarios: [
            { id: 'requestLoan', name: 'Loan Request Cases Update & Cancellation' },
            { id: 'requestAndLend', name: 'Loan Request & Acceptance' },
            { id: 'counterRecounter', name: 'Loan Counter/Re-Counter Negotiation' },
            { id: 'repayment', name: 'Loan Full Repayment (6 Phases)' },
          ],
          lenderEmailDefault: 'harish@yopmail.com',
          borrowerEmailDefault: 'brooklyn@yopmail.com',
        },
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        executionProvider: 'github-actions',
        githubConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO),
        workflow: WORKFLOW_ID,
        activeRuns: testRuns.size,
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Endpoint Not Found');
  } catch (err) {
    console.error('Request handler error:', err);
    logSystem('Request handler error', { message: err.message });
    json(res, 500, { success: false, message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`E2E Dashboard server is running on port ${PORT}`);
});


