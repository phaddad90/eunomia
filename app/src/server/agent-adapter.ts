import { randomUUID } from 'crypto';
import type { SessionConfig, AgentSession, SessionInfo, AgentStatus, AgentRole } from './types.js';
import type { Logger } from 'pino';

/**
 * AgentAdapter — thin wrapper around Claude Agent SDK (V2 preview).
 *
 * If the SDK V2 API changes, only this file needs updating.
 * Fallback: reimplement against the CLI with node-pty.
 *
 * For now, this wraps the SDK's query() function with streaming input mode
 * to keep sessions alive for multi-turn interaction.
 */

interface StreamEvent {
  type: string;
  data?: string;
  [key: string]: unknown;
}

// SDK import — dynamic to handle missing dependency gracefully
let sdkAvailable = false;
let queryFn: ((opts: unknown) => AsyncGenerator<unknown>) | null = null;

async function loadSdk(): Promise<boolean> {
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query as unknown as typeof queryFn;
    sdkAvailable = true;
    return true;
  } catch {
    return false;
  }
}

// Model name mapping
function resolveModelId(model: string): string {
  const map: Record<string, string> = {
    'opus': 'claude-opus-4-6',
    'sonnet': 'claude-sonnet-4-6',
    'haiku': 'claude-haiku-4-5-20251001',
  };
  return map[model] || model;
}

export class AgentAdapter {
  private sessions = new Map<string, AgentSession>();
  private messageQueues = new Map<string, Array<{ message: string; resolve: () => void }>>();
  private outputCallbacks = new Map<string, (data: string) => void>();
  private logger: Logger;
  private sdkLoaded = false;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async init(): Promise<void> {
    this.sdkLoaded = await loadSdk();
    if (this.sdkLoaded) {
      this.logger.info('Claude Agent SDK loaded successfully');
    } else {
      this.logger.warn('Claude Agent SDK not available — running in demo mode (no real agents)');
    }
  }

  isAvailable(): boolean {
    return this.sdkLoaded;
  }

  // ─── Spawn ───

  async spawnSession(
    role: AgentRole,
    config: SessionConfig,
    onOutput?: (data: string) => void,
    taskId?: string,
  ): Promise<AgentSession> {
    const id = `${role}-${randomUUID().slice(0, 8)}`;
    const sessionId = randomUUID();

    const session: AgentSession = {
      id,
      role,
      taskId,
      config,
      status: 'starting',
      sessionId,
      process: null,
      info: {
        sessionId,
        status: 'starting',
        model: config.model,
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: 0,
        startedAt: new Date().toISOString(),
        runtime: 0,
      },
    };

    this.sessions.set(id, session);
    if (onOutput) {
      this.outputCallbacks.set(id, onOutput);
    }

    if (!this.sdkLoaded) {
      // Demo mode: simulate agent
      session.status = 'running';
      session.info.status = 'running';
      if (onOutput) {
        onOutput(`[Eunomia] Agent ${id} started in demo mode (SDK not available)\r\n`);
        onOutput(`[Eunomia] Model: ${config.model} | CWD: ${config.cwd}\r\n`);
        onOutput(`[Eunomia] To enable real agents, install @anthropic-ai/claude-agent-sdk\r\n\r\n`);
      }
      this.logger.info({ agentId: id, role, model: config.model }, 'Agent spawned (demo mode)');
      return session;
    }

    // Real SDK session
    try {
      session.status = 'running';
      session.info.status = 'running';
      this.runSdkSession(session, config, onOutput);
      this.logger.info({ agentId: id, role, model: config.model, cwd: config.cwd }, 'Agent spawned');
    } catch (err) {
      session.status = 'crashed';
      session.info.status = 'crashed';
      this.logger.error({ agentId: id, err }, 'Failed to spawn agent');
      if (onOutput) {
        onOutput(`[Eunomia] Failed to spawn agent: ${err}\r\n`);
      }
    }

    return session;
  }

  private async runSdkSession(
    session: AgentSession,
    config: SessionConfig,
    onOutput?: (data: string) => void,
  ): Promise<void> {
    if (!queryFn) return;

    const messageQueue: Array<{ message: string; resolve: () => void }> = [];
    this.messageQueues.set(session.id, messageQueue);

    // Build the prompt generator that yields messages as they arrive
    const self = this;
    async function* generateMessages() {
      // First message — cold-start or initial prompt
      const coldStartPrompt = session.role === 'ceo'
        ? 'Read your SOUL.md, GOALS.md, MEMORY.md, and TASKS.md. You are the CEO agent. Introduce yourself briefly and check the task board.'
        : `You are a worker agent. Read your SOUL.md for instructions. Complete the assigned task and write all output to the output/ directory in your working directory.`;

      yield {
        type: 'user' as const,
        message: { role: 'user' as const, content: coldStartPrompt },
      };

      // Subsequent messages — wait for them to be queued
      while (session.status === 'running') {
        if (messageQueue.length > 0) {
          const { message, resolve } = messageQueue.shift()!;
          yield {
            type: 'user' as const,
            message: { role: 'user' as const, content: message },
          };
          resolve();
        } else {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    try {
      const options: Record<string, unknown> = {
        model: resolveModelId(config.model),
        cwd: config.cwd,
        additionalDirectories: config.additionalDirectories,
        permissionMode: config.permissionMode || 'auto',
        persistSession: config.persistSession,
        includePartialMessages: true,
        allowDangerouslySkipPermissions: true,
      };

      if (config.disallowedTools?.length) {
        options.disallowedTools = config.disallowedTools;
      }
      if (config.allowedTools?.length) {
        options.allowedTools = config.allowedTools;
      }
      if (config.maxBudgetUsd) {
        options.maxBudgetUsd = config.maxBudgetUsd;
      }
      if (config.maxTurns) {
        options.maxTurns = config.maxTurns;
      }
      if (config.mcpServers) {
        options.mcpServers = config.mcpServers;
      }
      if (config.canUseTool) {
        options.canUseTool = config.canUseTool;
      }

      for await (const message of queryFn({
        prompt: generateMessages(),
        options,
      }) as AsyncGenerator<Record<string, unknown>>) {
        this.handleSdkMessage(session, message, onOutput);
      }
    } catch (err) {
      if (session.status === 'running') {
        session.status = 'crashed';
        session.info.status = 'crashed';
        self.logger.error({ agentId: session.id, err }, 'Agent session crashed');
        if (onOutput) {
          onOutput(`\r\n[Eunomia] Agent crashed: ${err}\r\n`);
        }
      }
    }
  }

  private handleSdkMessage(
    session: AgentSession,
    message: Record<string, unknown>,
    onOutput?: (data: string) => void,
  ): void {
    const type = message.type as string;

    if (type === 'stream_event') {
      const event = message.event as Record<string, unknown>;
      if (event?.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (delta?.type === 'text_delta' && delta.text) {
          if (onOutput) onOutput(delta.text as string);
        }
      }
    }

    if (type === 'assistant') {
      const content = message.content as string;
      if (content && onOutput) {
        onOutput(content + '\r\n');
      }
    }

    if (type === 'result') {
      const result = message as Record<string, unknown>;
      if (result.total_cost_usd) {
        session.info.costUsd = result.total_cost_usd as number;
      }
      if (result.usage) {
        const usage = result.usage as Record<string, number>;
        session.info.tokensInput = usage.input_tokens || 0;
        session.info.tokensOutput = usage.output_tokens || 0;
      }
      session.info.runtime = Date.now() - new Date(session.info.startedAt).getTime();
    }
  }

  // ─── Message Sending ───

  async sendMessage(agentId: string, message: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session || session.status !== 'running') {
      throw new Error(`Agent ${agentId} is not running`);
    }

    if (!this.sdkLoaded) {
      // Demo mode: echo the message
      const cb = this.outputCallbacks.get(agentId);
      if (cb) {
        cb(`\r\n> ${message}\r\n`);
        cb(`[Demo] Received message. SDK not available for real processing.\r\n\r\n`);
      }
      return;
    }

    const queue = this.messageQueues.get(agentId);
    if (!queue) throw new Error(`No message queue for agent ${agentId}`);

    return new Promise((resolve) => {
      queue.push({ message, resolve });
    });
  }

  // ─── Kill ───

  async killSession(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) return;

    session.status = 'stopped';
    session.info.status = 'stopped';
    session.info.runtime = Date.now() - new Date(session.info.startedAt).getTime();

    const cb = this.outputCallbacks.get(agentId);
    if (cb) {
      cb(`\r\n[Eunomia] Agent ${agentId} stopped.\r\n`);
    }

    this.outputCallbacks.delete(agentId);
    this.messageQueues.delete(agentId);
    this.logger.info({ agentId }, 'Agent killed');
  }

  // ─── Info ───

  getSession(agentId: string): AgentSession | undefined {
    return this.sessions.get(agentId);
  }

  getSessionInfo(agentId: string): SessionInfo | undefined {
    const session = this.sessions.get(agentId);
    if (!session) return undefined;
    session.info.runtime = Date.now() - new Date(session.info.startedAt).getTime();
    return { ...session.info };
  }

  getActiveSessions(role?: AgentRole): AgentSession[] {
    const all = Array.from(this.sessions.values());
    const active = all.filter((s) => s.status === 'running' || s.status === 'starting');
    return role ? active.filter((s) => s.role === role) : active;
  }

  getActiveWorkerCount(): number {
    return this.getActiveSessions('worker').length;
  }

  getCeoSession(): AgentSession | undefined {
    return Array.from(this.sessions.values()).find(
      (s) => s.role === 'ceo' && (s.status === 'running' || s.status === 'starting'),
    );
  }

  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  // ─── Cleanup ───

  async killAllWorkers(): Promise<void> {
    const workers = this.getActiveSessions('worker');
    for (const worker of workers) {
      await this.killSession(worker.id);
    }
  }

  async shutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'starting') {
        await this.killSession(session.id);
      }
    }
  }
}
