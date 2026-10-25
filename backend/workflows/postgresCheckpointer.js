// Rolevia AI · PostgreSQL Durable Checkpointer for LangGraph.js (Phase 2 & Phase 3)
// Architecture: Extends LangGraph MemorySaver with asynchronous PostgreSQL persistence
// into ApplicationEvent and thread-level state recovery, preserving multi-tenant isolation,
// preventing cross-tenant access, and enabling resilient state resumption across worker restarts.

const { MemorySaver } = require('@langchain/langgraph');
const prisma = require('../db');

class PostgresDurableCheckpointer extends MemorySaver {
  constructor(options = {}) {
    super();
    this.persistenceEnabled = options.persistenceEnabled !== false;
    this.db = options.db || prisma;
  }

  /**
   * Save checkpoint to in-memory state and persist full state snapshot to PostgreSQL
   */
  async put(config, checkpoint, metadata, newVersions) {
    const returnConfig = await super.put(config, checkpoint, metadata, newVersions);

    if (this.persistenceEnabled && config?.configurable?.thread_id) {
      try {
        const threadId = config.configurable.thread_id;
        const checkpointId = checkpoint.id;

        // Parse composite threadId: tenantId:userId:applicationId
        const parts = threadId.split(':');
        if (parts.length === 3) {
          const [tenantId, userId, applicationId] = parts;

          // Tenant-scoped database query
          const app = await this.db.application.findUnique({
            where: { id: applicationId },
            select: { id: true, tenantId: true, userId: true }
          });

          if (app && app.tenantId === tenantId) {
            await this.db.applicationEvent.create({
              data: {
                applicationId: app.id,
                fromStatus: 'LANGGRAPH_STATE',
                toStatus: 'CHECKPOINT_SAVED',
                eventType: 'LANGGRAPH_CHECKPOINT',
                payload: {
                  threadId,
                  checkpointId,
                  checkpointVersion: checkpoint.v,
                  checkpoint: {
                    v: checkpoint.v,
                    id: checkpoint.id,
                    ts: checkpoint.ts,
                    channel_values: checkpoint.channel_values || {},
                    channel_versions: checkpoint.channel_versions || {},
                    versions_seen: checkpoint.versions_seen || {}
                  },
                  metadata: metadata || {}
                }
              }
            });
          }
        }
      } catch (err) {
        // Non-blocking log to ensure graph execution is never stalled by telemetry
        console.warn('[PostgresCheckpointer] Checkpoint DB write warning:', err.message);
      }
    }

    return returnConfig;
  }

  /**
   * Recover full checkpoint tuple from PostgreSQL if thread is not in memory
   */
  async getTuple(config) {
    // 1. Check in-memory store first
    let tuple = await super.getTuple(config);
    if (tuple) return tuple;

    // 2. If not in memory (worker restart / new worker), recover from PostgreSQL
    if (this.persistenceEnabled && config?.configurable?.thread_id) {
      try {
        const threadId = config.configurable.thread_id;
        const parts = threadId.split(':');
        if (parts.length === 3) {
          const [tenantId, userId, applicationId] = parts;

          // Multi-tenant authorization barrier
          const app = await this.db.application.findUnique({
            where: { id: applicationId },
            select: { id: true, tenantId: true, userId: true }
          });

          if (!app) {
            return undefined;
          }

          if (app.tenantId !== tenantId) {
            const err = new Error(`Cross-tenant checkpoint access blocked: tenant mismatch for thread ${threadId}`);
            err.code = 'CROSS_TENANT_ACCESS_DENIED';
            throw err;
          }

          const latestEvent = await this.db.applicationEvent.findFirst({
            where: {
              applicationId,
              eventType: 'LANGGRAPH_CHECKPOINT'
            },
            orderBy: { createdAt: 'desc' }
          });

          if (latestEvent && latestEvent.payload) {
            const raw = latestEvent.payload.checkpoint || {};
            const recoveredCheckpoint = {
              v: raw.v || latestEvent.payload.checkpointVersion || 1,
              id: raw.id || latestEvent.payload.checkpointId,
              ts: raw.ts || latestEvent.createdAt.toISOString(),
              channel_values: raw.channel_values || {},
              channel_versions: raw.channel_versions || {},
              versions_seen: raw.versions_seen || {}
            };
            const recoveredMetadata = latestEvent.payload.metadata || {};

            // Hydrate into in-memory state so LangGraph state machine resumes cleanly
            await super.put(config, recoveredCheckpoint, recoveredMetadata);
            return await super.getTuple(config);
          }
        }
      } catch (err) {
        if (err.code === 'CROSS_TENANT_ACCESS_DENIED') throw err;
        console.warn('[PostgresCheckpointer] Checkpoint DB read warning:', err.message);
      }
    }

    return undefined;
  }

  /**
   * List checkpoints for thread
   */
  async *list(config, options) {
    // Yield in-memory items if present
    let yielded = false;
    for await (const t of super.list(config, options)) {
      yielded = true;
      yield t;
    }
    if (yielded) return;

    // Otherwise recover latest from DB and yield
    const recovered = await this.getTuple(config);
    if (recovered) {
      yield recovered;
    }
  }
}

module.exports = {
  PostgresDurableCheckpointer
};
