import fs from 'node:fs';

export const isAsenaConfigExists = () => {
  return fs.existsSync(`${process.cwd()}/.asenarc.json`);
};

export const readJson = (path: string) => {
  const file = Bun.file(path, { type: 'application/json' });

  return file.json();
};
