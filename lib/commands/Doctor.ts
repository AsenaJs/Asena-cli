import { Command } from 'commander';
import { exitCodeFor, runDoctor } from '../doctor';
import type { CheckResult } from '../types';
import type { BaseCommand } from '../types/baseCommand';

export class Doctor implements BaseCommand {
  public command() {
    return new Command('doctor')
      .description('Checks the current project for common static configuration mistakes')
      .option('--json', 'Print the results as a JSON array instead of lines')
      .action(async (options: { json?: boolean }) => {
        const results = await runDoctor(process.cwd());

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          for (const result of results) {
            printResult(result);
          }
        }

        process.exitCode = exitCodeFor(results);
      });
  }
}

const printResult = (result: CheckResult) => {
  console.log(`${result.ok ? '✓' : '✗'} ${result.name} — ${result.detail}`);

  if (!result.ok && result.hint) {
    console.log(`  hint: ${result.hint}`);
  }
};
