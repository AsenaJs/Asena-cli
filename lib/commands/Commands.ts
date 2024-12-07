import { Command } from 'commander';
import { Build } from './Build';
import { Create } from './Create';
import { Dev } from './Dev';
import { Init } from './Init';

export class Commands {

  private program = new Command();

  public constructor() {
    this.program.name('asena').description();

    this.program.addCommand(new Create().command());

    this.program.addCommand(new Build().command());

    this.program.addCommand(new Dev().command());

    this.program.addCommand(new Init().command());
  }

  public parse(argv: string[]) {
    this.program.parse(argv);

    return this.program;
  }

}
