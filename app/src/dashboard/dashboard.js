// ─── Eunomia Dashboard ───
// Vanilla JS. No framework. No build step.

// ─── State ───
let ws = null;
let ceoTerminal = null;
let ceoFitAddon = null;
let workerTerminals = {};
let activeTerminal = 'ceo';
let paused = false;
let lastPromptTime = 0;
const PROMPT_COOLDOWN = 5000; // 5 seconds

// ─── WebSocket ───

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    showBanner('Connected to Eunomia', 'info');
    setTimeout(() => hideBanner(), 3000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (e) {
      console.error('Bad WS message:', e);
    }
  };

  ws.onclose = () => {
    showBanner('Disconnected — reconnecting...', 'warning');
    setTimeout(connectWs, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'terminal_output':
      handleTerminalOutput(msg.agentId, msg.data);
      break;
    case 'tasks_updated':
      renderTasks(msg.data);
      break;
    case 'agent_status':
      handleAgentStatus(msg.agentId, msg.data);
      break;
    case 'safety_alert':
      handleSafetyAlert(msg.data);
      break;
    case 'cost_update':
      handleCostUpdate(msg.data);
      break;
    case 'spawn_approval_request':
      handleSpawnApproval(msg.data);
      break;
  }
}

// ─── Terminal ───

function initTerminals() {
  ceoTerminal = new Terminal({
    theme: {
      background: '#0a0a0f',
      foreground: '#e4e4ef',
      cursor: '#6366f1',
      cursorAccent: '#0a0a0f',
      selectionBackground: 'rgba(99, 102, 241, 0.3)',
    },
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 1000,
    cursorBlink: true,
  });

  ceoFitAddon = new FitAddon.FitAddon();
  ceoTerminal.loadAddon(ceoFitAddon);
  ceoTerminal.open(document.getElementById('terminal-ceo'));
  ceoFitAddon.fit();

  ceoTerminal.writeln('\x1b[1;35m  Eunomia CEO Terminal\x1b[0m');
  ceoTerminal.writeln('\x1b[90m  Waiting for CEO agent to start...\x1b[0m\r\n');

  window.addEventListener('resize', () => {
    if (activeTerminal === 'ceo' && ceoFitAddon) {
      ceoFitAddon.fit();
    } else if (workerTerminals[activeTerminal]?.fitAddon) {
      workerTerminals[activeTerminal].fitAddon.fit();
    }
  });
}

function handleTerminalOutput(agentId, data) {
  if (!agentId || agentId === 'ceo') {
    if (ceoTerminal) ceoTerminal.write(data);
  } else {
    if (!workerTerminals[agentId]) {
      createWorkerTerminal(agentId);
    }
    workerTerminals[agentId].terminal.write(data);
  }
}

function createWorkerTerminal(agentId) {
  const container = document.createElement('div');
  container.id = `terminal-${agentId}`;
  container.style.display = 'none';
  container.style.height = '100%';
  document.querySelector('.terminal-main').appendChild(container);

  const terminal = new Terminal({
    theme: {
      background: '#0a0a0f',
      foreground: '#e4e4ef',
      cursor: '#22c55e',
    },
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 1000,
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);

  workerTerminals[agentId] = { terminal, fitAddon, container };

  // Add pill to worker bar
  addWorkerPill(agentId);
}

function addWorkerPill(agentId) {
  const bar = document.getElementById('worker-bar');
  const existing = document.getElementById(`pill-${agentId}`);
  if (existing) return;

  const pill = document.createElement('div');
  pill.className = 'worker-pill';
  pill.id = `pill-${agentId}`;
  pill.onclick = () => showWorkerTerminal(agentId);
  pill.innerHTML = `<span class="dot"></span>${agentId.slice(0, 12)}`;
  bar.appendChild(pill);
}

function showWorkerTerminal(agentId) {
  if (!workerTerminals[agentId]) return;

  // Hide current terminal
  document.getElementById('terminal-ceo').style.display = 'none';
  Object.values(workerTerminals).forEach(w => w.container.style.display = 'none');

  // Show selected
  workerTerminals[agentId].container.style.display = 'block';
  workerTerminals[agentId].fitAddon.fit();
  activeTerminal = agentId;

  // Update pills
  document.querySelectorAll('.worker-pill').forEach(p => p.classList.remove('active'));
  const pill = document.getElementById(`pill-${agentId}`);
  if (pill) pill.classList.add('active');

  // Show back button
  document.getElementById('back-to-ceo').style.display = 'block';
}

function showCeoTerminal() {
  Object.values(workerTerminals).forEach(w => w.container.style.display = 'none');
  document.getElementById('terminal-ceo').style.display = 'block';
  if (ceoFitAddon) ceoFitAddon.fit();
  activeTerminal = 'ceo';

  document.querySelectorAll('.worker-pill').forEach(p => p.classList.remove('active'));
  document.getElementById('back-to-ceo').style.display = 'none';
}

// ─── Tasks ───

function renderTasks(state) {
  const container = document.getElementById('tasks-container');
  if (!state || !state.tasks) return;

  const sections = { planned: [], active: [], done: [], failed: [] };
  state.tasks.forEach(t => sections[t.status]?.push(t));

  const labels = { planned: 'Planned', active: 'Active', done: 'Done', failed: 'Failed' };
  const checkmarks = { planned: '[ ]', active: '[~]', done: '[x]', failed: '[!]' };
  const checkClass = { planned: '', active: 'active', done: 'done', failed: 'failed' };

  let html = '';
  for (const [status, tasks] of Object.entries(sections)) {
    html += `<div class="tasks-section">`;
    html += `<div class="tasks-section-title">${labels[status]} (${tasks.length})</div>`;

    if (tasks.length === 0) {
      html += `<div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted);">No tasks</div>`;
    } else {
      for (const t of tasks) {
        const priorityClass = t.priority === 'critical' ? 'priority-critical' : t.priority === 'high' ? 'priority-high' : '';
        html += `
          <div class="task-item" data-id="${t.id}">
            <span class="task-checkbox ${checkClass[status]}">${checkmarks[status]}</span>
            <div class="task-body">
              <div class="task-title">${escapeHtml(t.title)}</div>
              <div class="task-meta">
                <span class="task-tag">${t.id}</span>
                <span class="task-tag model">${t.model}</span>
                <span class="task-tag ${priorityClass}">${t.priority}</span>
                <span class="task-tag">$${t.maxBudgetUsd.toFixed(2)}</span>
                ${t.tokenCost?.totalUsd > 0 ? `<span class="task-tag" style="color: var(--green);">$${t.tokenCost.totalUsd.toFixed(2)} actual</span>` : ''}
                ${t.notes ? `<span style="color: var(--text-muted);">${escapeHtml(t.notes)}</span>` : ''}
              </div>
            </div>
            <div class="task-actions">
              ${status === 'failed' ? `<button class="btn" onclick="retryTask('${t.id}')">Retry</button>` : ''}
              ${status === 'planned' ? `<button class="btn btn-danger" onclick="deleteTask('${t.id}')">Remove</button>` : ''}
              ${status === 'active' ? `<button class="btn btn-danger" onclick="failTask('${t.id}')">Stop</button>` : ''}
            </div>
          </div>`;
      }
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

async function addTask() {
  const input = document.getElementById('add-task-input');
  const title = input.value.trim();
  if (!title) return;

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  input.value = '';
}

async function retryTask(id) {
  await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'planned', notes: '' }),
  });
}

async function deleteTask(id) {
  await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done', notes: 'Removed by human' }),
  });
}

async function failTask(id) {
  // Find the worker for this task and kill it
  const agents = await (await fetch('/api/agents')).json();
  const worker = agents.find(a => a.taskId === id && a.role === 'worker');
  if (worker) {
    await fetch(`/api/agents/${worker.id}/kill`, { method: 'POST' });
  } else {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', notes: 'Stopped by human' }),
    });
  }
}

// ─── Status Tab ───

async function refreshStatus() {
  try {
    const [health, heartbeat, agents, safety] = await Promise.all([
      fetch('/health').then(r => r.json()),
      fetch('/api/heartbeat').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/safety').then(r => r.json()),
    ]);

    // CEO status
    document.getElementById('ceo-status-rows').innerHTML = `
      ${statusRow('Status', health.ceo.status, health.ceo.status === 'running' ? 'green' : 'amber')}
      ${statusRow('Model', health.ceo.model)}
      ${statusRow('Session Age', health.ceo.sessionAge)}
      ${statusRow('Tokens Today', health.ceo.tokensToday.toLocaleString())}
      ${statusRow('Cost Today', '$' + health.ceo.costToday.toFixed(2))}
      ${statusRow('Heartbeat', heartbeat.state + ' (' + heartbeat.intervalMinutes + 'min)')}
      ${statusRow('Next In', heartbeat.nextFireIn + 's')}
    `;

    // Workers
    const workers = agents.filter(a => a.role === 'worker');
    if (workers.length === 0) {
      document.getElementById('worker-status-rows').innerHTML =
        '<div style="padding: 4px 0; font-size: 13px; color: var(--text-muted);">No active workers</div>';
    } else {
      document.getElementById('worker-status-rows').innerHTML = workers.map(w => `
        ${statusRow(w.id.slice(0, 12), w.status, w.status === 'running' ? 'green' : 'amber')}
        ${w.taskId ? statusRow('  Task', w.taskId) : ''}
        ${w.info ? statusRow('  Cost', '$' + (w.info.costUsd || 0).toFixed(2)) : ''}
      `).join('');
    }

    // Cost
    document.getElementById('cost-status-rows').innerHTML = `
      ${statusRow('Today', '$' + health.budget.spent.toFixed(2), health.budget.percent >= 80 ? 'amber' : '')}
      ${statusRow('Budget', '$' + health.budget.limit.toFixed(2))}
      ${statusRow('Used', health.budget.percent.toFixed(1) + '%', health.budget.percent >= 80 ? 'amber' : health.budget.percent >= 100 ? 'red' : 'green')}
    `;

    // Safety
    document.getElementById('safety-status-rows').innerHTML = `
      ${statusRow('Paused', safety.paused ? 'Yes' : 'No', safety.paused ? 'amber' : 'green')}
      ${statusRow('Workers', health.workers.active + '/' + health.workers.max)}
      ${statusRow('Inactive', safety.inactiveMinutes + ' min')}
      ${statusRow('Budget', safety.budgetPercent.toFixed(0) + '%', safety.budgetPercent >= 80 ? 'amber' : 'green')}
      ${statusRow('Approvals Pending', safety.pendingApprovals.length.toString())}
    `;

    // Update status bar
    updateStatusBar(health, heartbeat);
    updateCostBadge(health.budget);
  } catch (e) {
    // Silently fail — will retry
  }
}

function statusRow(label, value, colorClass) {
  return `<div class="status-row">
    <span class="status-label">${label}</span>
    <span class="status-value ${colorClass || ''}">${value}</span>
  </div>`;
}

// ─── Status Bar ───

function updateStatusBar(health, heartbeat) {
  const dot = document.getElementById('ceo-dot');
  const state = document.getElementById('ceo-state');
  const workers = document.getElementById('worker-count');
  const cost = document.getElementById('status-cost');
  const hb = document.getElementById('heartbeat-info');
  const bar = document.getElementById('status-bar');

  // CEO state
  const ceoStatus = health.ceo.status;
  if (ceoStatus === 'running') {
    dot.className = 'dot green';
    state.textContent = heartbeat.state === 'paused' ? 'Paused' : heartbeat.nextFireIn > 0 ? `Waiting (${Math.ceil(heartbeat.nextFireIn / 60)}m)` : 'Thinking';
  } else {
    dot.className = 'dot amber';
    state.textContent = ceoStatus;
  }

  workers.textContent = `${health.workers.active} worker${health.workers.active !== 1 ? 's' : ''}`;
  cost.textContent = `$${health.budget.spent.toFixed(2)} today`;
  hb.textContent = `HB: ${heartbeat.intervalMinutes}m`;

  // Bar color
  bar.className = 'status-bar';
  if (health.budget.percent >= 100) bar.classList.add('danger');
  else if (health.budget.percent >= 80 || health.status === 'degraded') bar.classList.add('warning');
}

function updateCostBadge(budget) {
  const badge = document.getElementById('cost-badge');
  badge.textContent = `$${budget.spent.toFixed(2)}`;
  badge.className = 'cost-badge';
  if (budget.percent >= 100) badge.classList.add('danger');
  else if (budget.percent >= 80) badge.classList.add('warning');
}

// ─── Agent Status Events ───

function handleAgentStatus(agentId, data) {
  if (data.role === 'ceo' || !agentId.startsWith('worker-')) {
    // CEO status update
    return;
  }

  // Worker status
  const pill = document.getElementById(`pill-${agentId}`);
  if (pill) {
    const dot = pill.querySelector('.dot');
    if (data.status === 'running') dot.className = 'dot';
    else if (data.status === 'stopped') dot.className = 'dot stopped';
    else if (data.status === 'crashed') dot.className = 'dot failed';
  }
}

function handleSafetyAlert(data) {
  if (data.action === 'paused') {
    paused = true;
    document.getElementById('pause-btn').textContent = 'Resume';
    showBanner(`System paused${data.reason ? ': ' + data.reason : ''}`, 'warning');
  } else if (data.action === 'resumed') {
    paused = false;
    document.getElementById('pause-btn').textContent = 'Pause';
    hideBanner();
  }
}

function handleCostUpdate(data) {
  const badge = document.getElementById('cost-badge');
  badge.textContent = `$${data.dailySpend.toFixed(2)}`;
  badge.className = 'cost-badge';
  if (data.exhausted) badge.classList.add('danger');
  else if (data.warning) badge.classList.add('warning');
}

function handleSpawnApproval(data) {
  showBanner(
    `CEO wants to spawn worker for ${data.taskId}. <button class="btn btn-accent" onclick="approveSpawn('${data.taskId}')">Approve</button> <button class="btn btn-danger" onclick="rejectSpawn('${data.taskId}')">Reject</button>`,
    'info'
  );
}

// ─── Controls ───

async function sendPrompt() {
  const input = document.getElementById('prompt-input');
  const message = input.value.trim();
  if (!message) return;

  // Cooldown
  if (Date.now() - lastPromptTime < PROMPT_COOLDOWN) return;
  lastPromptTime = Date.now();

  await fetch('/api/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  input.value = '';
}

async function togglePause() {
  if (paused) {
    await fetch('/api/safety/resume', { method: 'POST' });
  } else {
    await fetch('/api/safety/pause', { method: 'POST' });
  }
}

async function stopAll() {
  if (!confirm('Stop all agents and shut down?')) return;
  showBanner('Shutting down...', 'danger');
  // Server will handle graceful shutdown
}

async function approveSpawn(taskId) {
  await fetch(`/api/safety/approve/${taskId}`, { method: 'POST' });
  hideBanner();
}

async function rejectSpawn(taskId) {
  await fetch(`/api/safety/reject/${taskId}`, { method: 'POST' });
  hideBanner();
}

// ─── Tabs ───

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'terminals') {
    if (activeTerminal === 'ceo' && ceoFitAddon) ceoFitAddon.fit();
    else if (workerTerminals[activeTerminal]?.fitAddon) workerTerminals[activeTerminal].fitAddon.fit();
  }

  if (tab === 'status') refreshStatus();
}

// ─── Banner ───

function showBanner(text, type) {
  const banner = document.getElementById('banner');
  banner.innerHTML = text;
  banner.className = 'banner visible';
  if (type === 'warning') banner.classList.add('warning');
  if (type === 'danger') banner.classList.add('danger');
}

function hideBanner() {
  document.getElementById('banner').className = 'banner';
}

// ─── Helpers ───

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ───

document.addEventListener('DOMContentLoaded', () => {
  initTerminals();
  connectWs();

  // Poll status every 5 seconds
  setInterval(refreshStatus, 5000);
  refreshStatus();

  // Fetch project name
  fetch('/health').then(r => r.json()).then(h => {
    // Will be populated from server
  }).catch(() => {});
});
