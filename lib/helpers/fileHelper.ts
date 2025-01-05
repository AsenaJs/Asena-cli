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
    throw new Error('Invalid sourceFolder, please check the asena-config.ts');
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

export const removeExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return fileName;
  }

  return fileName.substring(0, lastDotIndex);
};

export const simplifyPath = (path: string): string => {
  const parts = path.split('/');

  if (parts.length === 2) {
    return `/${parts[1]}`;
  }

  if (parts.length > 2) {
    return parts.slice(1).join('/');
  }

  return path;
};

export const changeFileExtensionToAsenaJs = (file: string) => {
  return path.format({
    ...path.parse(file),
    base: undefined,
    ext: '.asena.js',
  });
};
