const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

let currentProcess = null;
let logBuffer = [];
let clients = [];
let displayProcessesStarted = false;

const DISPLAY_NUMBER = process.env.PLAYWRIGHT_DISPLAY || ':99';
const VNC_PORT = Number(process.env.VNC_PORT || 5900);
const ENABLE_BROWSER_VIEWER = process.env.ENABLE_BROWSER_VIEWER === 'true';

const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(str) {
  return str.replace(ansiRegex, '');
}

function logSystem(message, details) {
  const line = `[SYSTEM] ${new Date().toISOString()} ${message}${details ? ` ${JSON.stringify(details)}` : ''}\n`;
  console.log(line.trim());
  broadcastLog(line);
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return Object.fromEntries(
    Object.entries(usage).map(([key, value]) => [key, `${Math.round(value / 1024 / 1024)}MB`]),
  );
}

function startDisplayProcesses() {
  if (!ENABLE_BROWSER_VIEWER || process.platform === 'win32' || displayProcessesStarted) {
    return;
  }

  displayProcessesStarted = true;
  process.env.DISPLAY = DISPLAY_NUMBER;
  console.log(`[display] Starting virtual display ${DISPLAY_NUMBER} for headed Chromium`);

  const displayCommands = [
    {
      label: 'Xvfb',
      cmd: 'Xvfb',
      args: [DISPLAY_NUMBER, '-screen', '0', '1366x768x24', '-ac', '+extension', 'RANDR'],
    },
    {
      label: 'fluxbox',
      cmd: 'fluxbox',
      args: [],
    },
    {
      label: 'x11vnc',
      cmd: 'x11vnc',
      args: ['-display', DISPLAY_NUMBER, '-forever', '-shared', '-nopw', '-rfbport', String(VNC_PORT)],
    },
  ];

  const spawnDisplayCommand = ({ label, cmd, args }) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, DISPLAY: DISPLAY_NUMBER },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', data => console.log(`[${label}] ${data.toString().trim()}`));
    child.stderr.on('data', data => console.log(`[${label}] ${data.toString().trim()}`));
    child.on('error', err => console.log(`[${label}] failed to start: ${err.message}`));
    child.on('close', code => console.log(`[${label}] exited with code ${code}`));
  };

  spawnDisplayCommand(displayCommands[0]);
  setTimeout(() => {
    displayCommands.slice(1).forEach(spawnDisplayCommand);
  }, 1200);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.css': 'text/css',
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    };

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function encodeWebSocketFrame(data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x82, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x82;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

function decodeWebSocketFrames(buffer, onFrame) {
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const masked = Boolean(secondByte & 0x80);
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;

    if (offset + frameLength > buffer.length) break;

    if (opcode === 0x8) {
      return buffer.subarray(offset + frameLength);
    }

    const mask = masked ? buffer.subarray(offset + headerLength, offset + headerLength + 4) : null;
    const payloadStart = offset + headerLength + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + payloadLength));

    if (mask) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    if (opcode === 0x2 || opcode === 0x1) {
      onFrame(payload);
    }

    offset += frameLength;
  }

  return buffer.subarray(offset);
}

function handleVncWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    req.headers['sec-websocket-protocol']?.includes('binary') ? 'Sec-WebSocket-Protocol: binary' : '',
    '',
    '',
  ].filter(Boolean).join('\r\n') + '\r\n\r\n');

  const vnc = net.createConnection({ host: '127.0.0.1', port: VNC_PORT });
  let pending = Buffer.alloc(0);

  socket.on('data', data => {
    pending = Buffer.concat([pending, data]);
    pending = decodeWebSocketFrames(pending, frame => vnc.write(frame));
  });

  vnc.on('data', data => socket.write(encodeWebSocketFrame(data)));
  vnc.on('error', () => socket.destroy());
  vnc.on('close', () => socket.destroy());
  socket.on('close', () => vnc.destroy());
  socket.on('error', () => vnc.destroy());
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
        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        logSystem('Received /run-test request', {
          requestId,
          flow: params.flow,
          platform: process.platform,
          cwd: __dirname,
        });

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
        logSystem('Wrote config/uiConfig.json', {
          requestId,
          configPath: path.join(configDir, 'uiConfig.json'),
          flow: params.flow,
          borrowerEmail: params.borrowerEmail,
          lenderEmail: params.lenderEmail,
          loanAmountMin: params.loanAmountMin,
          loanAmountMax: params.loanAmountMax,
          aprMin: params.aprMin,
          aprMax: params.aprMax,
          duration: params.duration,
          iterations: params.iterations,
        });

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
          CI: 'true',
          REALWORLD_WEB2_EMAIL: params.borrowerEmail || 'brooklyn@yopmail.com',
          REALWORLD_WEB2_PASSWORD: params.borrowerPassword || 'Test@1233333',
          REALWORLD_LENDER_EMAIL: params.lenderEmail || 'harish@yopmail.com',
          REALWORLD_LENDER_PASSWORD: params.lenderPassword || 'Test@1233333'
        };

        logSystem('Prepared Playwright credentials from UI config', {
          requestId,
          borrowerEmail: env.REALWORLD_WEB2_EMAIL,
          lenderEmail: env.REALWORLD_LENDER_EMAIL,
          borrowerPasswordProvided: Boolean(env.REALWORLD_WEB2_PASSWORD),
          lenderPasswordProvided: Boolean(env.REALWORLD_LENDER_PASSWORD),
        });

        const isWin = process.platform === 'win32';
        let cmd = '';
        let args = [];
        
        if (isWin) {
          cmd = 'npx.cmd';
          args = ['playwright', 'test', specFile, '--project=chromium', '--workers=1', '--reporter=line'];
        } else {
          cmd = 'npx';
          args = ['playwright', 'test', specFile, '--project=chromium', '--workers=1', '--reporter=line'];
        }
        
        logSystem('Starting Playwright process', {
          requestId,
          command: 'npx playwright test',
          specFile,
          project: 'chromium',
          headless: true,
          workers: 1,
          memoryBeforeLaunch: memorySnapshot(),
        });
        console.log(process.memoryUsage());
        broadcastLog(`Running command: npx playwright test ${specFile} --project=chromium --workers=1 --reporter=line\n`);
        if (!isWin && ENABLE_BROWSER_VIEWER) {
          broadcastLog(`Live Chromium viewer: /browser\n`);
        }

        currentProcess = spawn(cmd, args, { env, cwd: __dirname, shell: true });
        logSystem('Playwright child process spawned', {
          requestId,
          pid: currentProcess.pid,
          memoryAfterLaunch: memorySnapshot(),
        });
        console.log(process.memoryUsage());

        currentProcess.stdout.on('data', data => {
          broadcastLog(data.toString());
        });

        currentProcess.stderr.on('data', data => {
          broadcastLog(`[ERROR] ${data.toString()}`);
        });

        currentProcess.on('error', err => {
          logSystem('Failed to spawn Playwright', { requestId, message: err.message, stack: err.stack });
          broadcastLog(`[SYSTEM ERROR] Failed to spawn Playwright: ${err.message}\n`);
          currentProcess = null;
        });

        currentProcess.on('close', (code, signal) => {
          logSystem('Playwright process completed', { requestId, code, signal, memoryAfterCompletion: memorySnapshot() });
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

  if (req.url === '/browser') {
    if (!ENABLE_BROWSER_VIEWER) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>Browser Viewer Disabled</title></head>
        <body style="font-family: Arial, sans-serif; background: #111827; color: #f9fafb; padding: 32px;">
          <h1>Browser viewer disabled</h1>
          <p>Render is running Playwright in headless low-memory mode. Use logs, traces from a local run, or screenshots from a larger diagnostic build instead.</p>
        </body>
        </html>
      `);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Live Chromium</title>
        <style>
          html, body { margin: 0; height: 100%; background: #111827; }
          iframe { width: 100%; height: 100%; border: 0; display: block; }
        </style>
      </head>
      <body>
        <iframe src="/vnc/vnc.html?autoconnect=true&resize=scale&path=websockify"></iframe>
      </body>
      </html>
    `);
    return;
  }

  if (req.url && req.url.startsWith('/vnc/')) {
    const novncRoot = process.env.NOVNC_ROOT || '/usr/share/novnc';
    const requestedPath = decodeURIComponent(req.url.split('?')[0].replace('/vnc/', ''));
    const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(novncRoot, safePath || 'vnc.html');

    if (!filePath.startsWith(novncRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    serveFile(res, filePath);
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

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      platform: process.platform,
      display: process.env.DISPLAY || null,
      playwrightDisplay: DISPLAY_NUMBER,
      currentProcessPid: currentProcess?.pid || null,
      memory: memorySnapshot(),
      browserViewerEnabled: ENABLE_BROWSER_VIEWER,
    }));
    return;
  }

  // Not found fallbacks
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Endpoint Not Found');
});

const PORT = Number(process.env.PORT || 3000);
startDisplayProcesses();
server.listen(PORT, () => {
  console.log(`E2E Dashboard server is running on port ${PORT}`);
});

server.on('upgrade', (req, socket) => {
  if (req.url === '/websockify') {
    handleVncWebSocket(req, socket);
    return;
  }

  socket.destroy();
});
