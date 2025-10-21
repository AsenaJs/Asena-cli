import { Command } from 'commander';
import { Build } from './Build';
import { Create } from './Create';
import { Dev } from './Dev';
import { Generate } from './Generate';
import { Init } from './Init';

export class Commands {

  private program = new Command();

  public constructor() {
    this.program.name('asena');

    this.program.version('0.5.0');

    this.program.addCommand(new Create().command());

    this.program.addCommand(new Build().command());

    this.program.addCommand(new Dev().command());

    this.program.addCommand(new Init().command());

    this.program.addCommand(new Generate().command());
  }

  public parse(argv: string[]) {
    this.program.parse(argv);

    return this.program;
  }

}
