export const convertToPascalCase = (str: string): string => {
  if (str.length < 1) {
    throw new Error('Invalid variable name length');
  }

  let formattedVariableName = '';

  const segmentedValue: string[] = str.startsWith('_') ? str.slice(1).split(/[_ -]/) : str.split(/[_ -]/);

  if (segmentedValue.length < 1) {
    throw new Error('Invalid variable name');
  }

  for (const variable of segmentedValue) {
    formattedVariableName += variable.charAt(0).toUpperCase() + variable.slice(1);
  }

  return formattedVariableName;
};
