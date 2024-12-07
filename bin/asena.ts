#! /usr/bin/env bun
import { Commands } from '../lib/commands/Commands';

const program = new Commands();

program.parse(process.argv);
