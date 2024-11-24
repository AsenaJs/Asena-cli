import fs from 'node:fs';

export const isAsenaConfigExists = () => {
  return fs.existsSync(`${process.cwd()}/.asenarc.json`);
};

export const readJson = (path: string) => {
  const file = fs.readFileSync(path, { encoding: 'utf-8' });

  return JSON.parse(file);
};
