import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const openapi = {
    openapi: '3.0.3',
    info: {
      title: 'Maquinita Public API',
      version: '1.0.0',
      description: 'Operator-scoped API for machines, transactions, analytics, and command issuance.',
    },
    servers: [
      {
        url: `${origin}/api/v1`,
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API key',
          description: 'Use API keys generated in Settings > API. Requests pass through api-gateway.',
        },
      },
      parameters: {
        OperatorHeader: {
          name: 'x-operator-id',
          in: 'header',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Injected by API Gateway after validating API key.',
        },
      },
    },
    security: [{ ApiKeyBearer: [] }],
    paths: {
      '/machines': {
        get: {
          summary: 'List machines',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['fridge', 'pantry', 'freezer'] } },
          ],
          responses: {
            '200': { description: 'List of machines.' },
            '401': { description: 'Missing operator context.' },
          },
        },
      },
      '/machines/{id}': {
        get: {
          summary: 'Get machine detail',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Machine detail.' },
            '404': { description: 'Machine not found.' },
          },
        },
      },
      '/machines/{id}/inventory': {
        get: {
          summary: 'Get machine inventory by product',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Inventory counts and product stats.' },
          },
        },
      },
      '/machines/{id}/temperature': {
        get: {
          summary: 'Get machine current temperature and 24h history',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Temperature payload.' },
          },
        },
      },
      '/machines/{id}/commands': {
        post: {
          summary: 'Issue machine command',
          description: 'Requires commands/full API permission.',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type'],
                  properties: {
                    type: { type: 'string', enum: ['LOCKDOWN', 'REBOOT', 'UNLOCK'] },
                    payload: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Command accepted.' },
            '403': { description: 'Permission denied.' },
            '409': { description: 'Conflicting active command exists.' },
          },
        },
      },
      '/transactions': {
        get: {
          summary: 'List transactions',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'until', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'machine_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Paginated transactions.' },
          },
        },
      },
      '/transactions/{id}': {
        get: {
          summary: 'Get transaction detail',
          parameters: [
            { $ref: '#/components/parameters/OperatorHeader' },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Transaction detail.' },
            '404': { description: 'Transaction not found.' },
          },
        },
      },
      '/analytics/summary': {
        get: {
          summary: 'Get analytics summary for last 30 days',
          parameters: [{ $ref: '#/components/parameters/OperatorHeader' }],
          responses: {
            '200': { description: 'Aggregated KPIs and machine breakdown.' },
          },
        },
      },
    },
  };

  return NextResponse.json(openapi, { status: 200 });
}
