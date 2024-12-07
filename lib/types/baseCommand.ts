import type { Command } from 'commander';

export interface BaseCommand {
  command: () => Command;
}
