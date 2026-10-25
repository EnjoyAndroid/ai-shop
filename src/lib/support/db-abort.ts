import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/db";
import { logWarn } from "@/lib/logger";

const globals = globalThis as unknown as { supportCancellationClient?: PrismaClient };

// Reserve two connections for cancellation, independently of the busy query pool.
function cancellationClient(): PrismaClient {
  if (!globals.supportCancellationClient) {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("connection_limit", "2");
    url.searchParams.set("pool_timeout", "1");
    url.searchParams.set("connect_timeout", "2");
    url.searchParams.set("socket_timeout", "2");
    globals.supportCancellationClient = new PrismaClient({
      datasources: { db: { url: url.toString() } }, log: [],
    });
  }
  return globals.supportCancellationClient;
}

export async function disconnectSupportCancellationClient() {
  await globals.supportCancellationClient?.$disconnect();
  globals.supportCancellationClient = undefined;
}

/** Only signalled support reads use the cancellation transaction. Ordinary callers
 * keep their original query/cache path. No business writes belong in operation.
 */
export async function withSupportDbAbort<T>(
  signal: AbortSignal | undefined,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  reader: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<T> {
  if (!signal) return operation(prisma);
  signal.throwIfAborted();
  return reader.$transaction(async tx => {
    signal.throwIfAborted();
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const marker = `support-read:${randomUUID()}`;
    // Database-enforced fallback still works if the cancellation connection fails.
    await tx.$queryRaw`
      SELECT set_config('statement_timeout', '3000', true),
             set_config('lock_timeout', '1000', true),
             set_config('application_name', ${marker}, true)
    `;
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    let cancelling: Promise<unknown> | undefined;
    const cancel = () => {
      cancelling ??= Promise.resolve().then(() => cancellationClient().$queryRaw`
        SELECT pg_cancel_backend(pid)
        FROM pg_stat_activity
        WHERE pid = ${pid}::int AND application_name = ${marker}
          AND datname = current_database() AND usename = current_user
      `).catch(() => {
        // Never print SQL, the connection URL or raw driver errors.
        logWarn("support query cancellation", "Cancellation unavailable; database timeouts remain active.");
      });
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      signal.throwIfAborted();
      const result = await operation(tx);
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener("abort", cancel);
      // Keep ownership until cancellation settles; a late cancel must not target
      // another request after the pool reuses this connection. The unique marker
      // also excludes a backend whose transaction expired before cleanup.
      await cancelling;
    }
  }, { maxWait: 2000, timeout: 15000 });
}
