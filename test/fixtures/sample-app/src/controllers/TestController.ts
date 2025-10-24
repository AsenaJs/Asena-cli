import { Controller } from '@asenajs/asena/server';
import { Get } from '@asenajs/asena/web';
import type { Context } from '@asenajs/hono-adapter';

@Controller({ path: '/test' })
export class TestController {
  @Get({ path: '/' })
  public async index(context: Context) {
    return context.send({ message: 'test controller' });
  }
}
