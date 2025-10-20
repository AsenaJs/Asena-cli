import { Service } from '@asenajs/asena/server';

@Service('TestService')
export class TestService {

  public async test() {
    console.log('i am test service');
  }

}
