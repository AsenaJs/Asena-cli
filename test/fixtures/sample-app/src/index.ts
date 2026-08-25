import { AsenaServerFactory } from '@asenajs/asena';
import { createHonoAdapter } from '@asenajs/hono-adapter';

const [adapter, logger] = createHonoAdapter(console);

const server = await AsenaServerFactory.create({
  adapter,
  logger,
  port: 3000,
});

await server.start();
