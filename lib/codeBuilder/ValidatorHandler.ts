export class ValidatorHandler {
  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  /**
   * Adds a validator class with the @Middleware({ validator: true }) decorator
   * @param validatorName Name of the validator class
   */
  public addValidator(validatorName: string) {
    const validator = `\n@Middleware({ validator: true })\nexport class ${validatorName} extends ValidationService {\n\n}`;

    this._code = this._code + validator;

    return this;
  }

  /**
   * Adds example Zod schema validation methods to the validator
   * @param validatorName Name of the validator class
   */
  public addExampleSchema(validatorName: string) {
    const exampleSchema = `\t/**
\t * Validates JSON body data
\t * @returns Zod schema for request body validation
\t */
\tjson() {
\t\treturn z.object({
\t\t\tname: z.string().min(3, 'Name must be at least 3 characters'),
\t\t\temail: z.string().email('Invalid email format'),
\t\t});
\t}

\t/**
\t * Validates query parameters (optional)
\t * Uncomment to use query validation
\t */
\t// query() {
\t//   return z.object({
\t//     page: z.string().transform(Number).pipe(z.number().min(1)),
\t//     limit: z.string().transform(Number).pipe(z.number().max(100)),
\t//   });
\t// }

\t/**
\t * Validates URL parameters (optional)
\t * Uncomment to use param validation
\t */
\t// param() {
\t//   return z.object({
\t//     id: z.string().uuid('Invalid ID format'),
\t//   });
\t// }
`;

    // Find the closing brace of the validator class using a custom regex
    const escapedClassName = validatorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `@Middleware\\(\\{\\s*validator:\\s*true\\s*\\}\\)\\s*export\\s+class\\s+${escapedClassName}\\s+extends\\s+ValidationService\\s*\\{\\s*\\}`,
    );

    const match = regex.exec(this._code);

    if (!match) throw new Error('Validator class does not exist');

    // Find the position of the closing brace
    const matchEnd = match.index + match[0].length;
    const closingBraceIndex = matchEnd - 1;

    // Insert example schema before the closing brace
    this._code =
      this._code.substring(0, closingBraceIndex) +
      '\n' +
      exampleSchema +
      '\n' +
      this._code.substring(closingBraceIndex);

    return this;
  }

  public get code() {
    return this._code;
  }
}
