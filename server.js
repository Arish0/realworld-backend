const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let currentProcess = null;
let logBuffer = [];
let clients = [];

const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(str) {
  return str.replace(ansiRegex, '');
}

// Broadcast log line to all connected SSE clients
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

const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE Stream Endpoint
  if (req.url === '/stream-logs') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    // Catch-up client with existing logs
    logBuffer.forEach(line => {
      res.write(`data: ${JSON.stringify({ text: line })}\n\n`);
    });

    clients.push(res);

    req.on('close', () => {
      clients = clients.filter(c => c !== res);
    });
    return;
  }

  // Trigger Test Run Endpoint
  if (req.method === 'POST' && req.url === '/run-test') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const params = JSON.parse(body);

        if (currentProcess) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'A test is already running!' }));
          return;
        }

        // Create config directory if it does not exist
        const configDir = path.join(__dirname, 'config');
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir);
        }
        
        // Write uiConfig.json
        fs.writeFileSync(path.join(configDir, 'uiConfig.json'), JSON.stringify(params, null, 2));

        // Select spec file based on chosen flow
        let specFile = '';
        switch (params.flow) {
          case 'requestLoan':
            specFile = 'tests/ui/requestLoanUi.spec.ts';
            break;
          case 'lendLoan':
            specFile = 'tests/ui/lendLoanUi.spec.ts';
            break;
          case 'requestAndLend':
            specFile = 'tests/ui/requestAndLendUi.spec.ts';
            break;
          case 'counterRecounter':
            specFile = 'tests/ui/counterRecounterUi.spec.ts';
            break;
          case 'repayment':
            specFile = 'tests/repayment/repayment.spec.ts';
            break;
          default:
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid flow selected!' }));
            return;
        }

        logBuffer = [];
        broadcastLog(`=== STARTING TEST FLOW: ${params.flow} ===\n`);
        broadcastLog(`Environment configured and config/uiConfig.json updated.\n`);

        // Set environment variables for Playwright
        const env = {
          ...process.env,
          REALWORLD_WEB2_EMAIL: params.borrowerEmail || '',
          REALWORLD_WEB2_PASSWORD: params.borrowerPassword || '',
          REALWORLD_LENDER_EMAIL: params.lenderEmail || '',
          REALWORLD_LENDER_PASSWORD: params.lenderPassword || ''
        };

        const isWin = process.platform === 'win32';
        let cmd = '';
        let args = [];
        
        if (isWin) {
          cmd = 'npx.cmd';
          args = ['playwright', 'test', specFile, '--headed'];
        } else {
          // On Linux (Render), run headed browser inside X virtual framebuffer
          cmd = 'xvfb-run';
          args = ['npx', 'playwright', 'test', specFile, '--headed'];
        }
        
        broadcastLog(`Running command: ${isWin ? 'npx' : 'xvfb-run npx'} ${specFile} --headed\n`);

        currentProcess = spawn(cmd, args, { env, cwd: __dirname, shell: true });

        currentProcess.stdout.on('data', data => {
          broadcastLog(data.toString());
        });

        currentProcess.stderr.on('data', data => {
          broadcastLog(`[ERROR] ${data.toString()}`);
        });

        currentProcess.on('error', err => {
          broadcastLog(`[SYSTEM ERROR] Failed to spawn Playwright: ${err.message}\n`);
          currentProcess = null;
        });

        currentProcess.on('close', code => {
          broadcastLog(`\n=== TEST COMPLETED WITH CODE: ${code} ===\n`);
          currentProcess = null;
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Test run initiated!' }));
      } catch (err) {
        console.error('Error in /run-test handler:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // Stop / Terminate Running Test Endpoint
  if (req.method === 'POST' && req.url === '/stop-test') {
    if (currentProcess) {
      if (process.platform === 'win32') {
        require('child_process').exec(`taskkill /pid ${currentProcess.pid} /T /F`);
      } else {
        currentProcess.kill();
      }
      broadcastLog('\n=== TEST RUN EXPLICITLY TERMINATED BY USER ===\n');
      currentProcess = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Test run aborted successfully.' }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'No test is currently running.' }));
    }
    return;
  }

  // Serving console page for iframe
  if (req.url === '/console') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            background: #0d1117;
            color: #c9d1d9;
            font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
            padding: 15px;
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
            overflow-y: scroll;
            height: 100vh;
            box-sizing: border-box;
          }
          pre {
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .system { color: #58a6ff; font-weight: bold; }
          .error { color: #ff7b72; }
          .success { color: #3fb950; }
          .normal { color: #8b949e; }
        </style>
      </head>
      <body>
        <pre id="output">Console waiting for test execution...</pre>
        <script>
          const output = document.getElementById('output');
          let eventSource = new EventSource('/stream-logs');
          
          eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (output.textContent === 'Console waiting for test execution...') {
              output.textContent = '';
            }
            
            const span = document.createElement('span');
            let text = data.text;
            
            if (text.includes('=== STARTING') || text.includes('=== TEST COMPLETED') || text.includes('=== TEST EXPLICITLY')) {
              span.className = 'system';
            } else if (text.includes('[ERROR]') || text.includes('[SYSTEM ERROR]') || text.includes('failed') || text.includes('Error:')) {
              span.className = 'error';
            } else if (text.includes('successfully') || text.includes('SUCCESS') || text.includes('completed successfully')) {
              span.className = 'success';
            } else {
              span.className = 'normal';
            }
            
            span.textContent = text;
            output.appendChild(span);
            window.scrollTo(0, document.body.scrollHeight);
          };
        </script>
      </body>
      </html>
    `);
    return;
  }

  // Serving main index.html dashboard
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Dashboard HTML file not found!');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
    return;
  }

  // API Sample Data Endpoint
  if (req.method === 'GET' && req.url === '/api/sample-data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'success',
      message: 'Sample data endpoint. More data structures will be defined later.',
      timestamp: new Date().toISOString(),
      sampleData: {
        scenarios: [
          { id: 'requestLoan', name: 'Loan Request Cases Update & Cancellation' },
          { id: 'requestAndLend', name: 'Loan Request & Acceptance' },
          { id: 'counterRecounter', name: 'Loan Counter/Re-Counter Negotiation' },
          { id: 'repayment', name: 'Loan Full Repayment (6 Phases)' }
        ],
        lenderEmailDefault: 'harish@yopmail.com',
        borrowerEmailDefault: 'brooklyn@yopmail.com'
      }
    }));
    return;
  }

  // Not found fallbacks
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Endpoint Not Found');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`E2E Dashboard server is running at http://localhost:${PORT}`);
});
