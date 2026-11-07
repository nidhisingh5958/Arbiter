import type { FastifyPluginAsync } from 'fastify';
import { forbidden } from '../../lib/errors';
import { requireUser } from '../types';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: unknown };
}

/**
 * Agent tool registry plus a minimal MCP-compatible JSON-RPC endpoint (initialize, tools/list,
 * tools/call). MCP calls go through the same gateway, so the policy engine still gates money:
 * create_payout without a release grant and refund_capture from a non-human actor are denied.
 */
export const agentRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get('/agent/tools', async (req) => {
    requireUser(req);
    return ctx.gateway.list();
  });

  app.post('/mcp', async (req) => {
    const user = requireUser(req);
    if (user.role !== 'admin') throw forbidden('The MCP endpoint is restricted to admins');
    const rpc = (req.body ?? {}) as JsonRpcRequest;
    const id = rpc.id ?? null;
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result });

    switch (rpc.method) {
      case 'initialize':
        return reply({
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'arbiterai-payments', version: ctx.config.version },
          capabilities: { tools: {} },
        });
      case 'tools/list':
        return reply({ tools: ctx.gateway.list().map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
      case 'tools/call': {
        const outcome = await ctx.gateway.execute(String(rpc.params?.name ?? ''), rpc.params?.arguments ?? {}, { actor: `mcp:${user.id}` });
        return reply({
          content: [{ type: 'text', text: JSON.stringify(outcome.ok ? outcome.output : { error: outcome.error, denied: outcome.denied }) }],
          isError: !outcome.ok,
        });
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${rpc.method ?? '(none)'}` } };
    }
  });
};
