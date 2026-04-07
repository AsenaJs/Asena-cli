import { Service } from '@asenajs/asena/decorators';

@Service('TestService')
export class TestService {
  public async test() {
    console.log('i am test service');
  }
}
