#! /usr/bin/env bun
import { Command } from 'commander';
import { buildCommand, createCommand, devCommand, initCommand } from '../lib/commands';

const program = new Command();

program.name('asena').description('');

program.addCommand(buildCommand);

program.addCommand(createCommand);

program.addCommand(initCommand);

program.addCommand(devCommand);

program.parse(process.argv);
