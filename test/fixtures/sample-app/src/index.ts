import { AsenaServerFactory } from '@asenajs/asena';
import { HonoAdapter } from '@asenajs/hono-adapter';

const adapter = new HonoAdapter();

const server = await AsenaServerFactory.create({
  adapter: adapter,
  port: 3000,
});

await server.start();
