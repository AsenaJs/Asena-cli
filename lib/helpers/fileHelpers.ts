import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDE_DIR_LIST } from '../constants';

export const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []): string[] => {
  try {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      const filePath = path.join(dirPath, file);

      if (fs.statSync(filePath).isDirectory() && !EXCLUDE_DIR_LIST.includes(file)) {
        getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    });

    return arrayOfFiles;
  } catch {
    throw new Error('Invalid sourceFolder, please check the .asenarc.json');
  }
};

export const getFileExtension = (filename: string) => {
  const parts = filename.split('.');
  const extension = parts.length > 1 ? parts.pop() : '';

  if (extension === 'js') {
    return '.js';
  } else if (extension === 'ts') {
    return '.ts';
  } else {
    throw new Error('Invalid file extension');
  }
};

export const readJson = (path: string) => {
  const file = fs.readFileSync(path, { encoding: 'utf-8' });

  return JSON.parse(file);
};

export const isAsenaConfigExists = () => {
  return fs.existsSync(`${process.cwd()}/.asenarc.json`);
};

export const changeFileExtensionToAsenaJs = (file: string) => {
  return path.format({
    ...path.parse(file),
    base: undefined,
    ext: '.asena.js',
  });
};

const trimPath = (path: string) => {
  const segments = path.split('/');

  if (segments[0] === '') {
    return '/';
  }

  const trimmedSegments = segments.slice(1);

  return '/' + trimmedSegments.join('/');
};

export const findBuildExecutable = (buildDir: string, rootFile: string): string => {
  if (rootFile === '/') {
    throw new Error('asena-cli can not find executable');
  }

  if (fs.existsSync(path.join(buildDir, rootFile))) {
    return path.join(buildDir, rootFile);
  } else {
    return findBuildExecutable(buildDir, trimPath(rootFile));
  }
};
