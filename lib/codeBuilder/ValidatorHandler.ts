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
    const exampleSchema = `  /**
   * Validates JSON body data
   * @returns Zod schema for request body validation
   */
  json() {
    return z.object({
      name: z.string().min(3, 'Name must be at least 3 characters'),
      email: z.string().email('Invalid email format'),
    });
  }

  /**
   * Validates query parameters (optional)
   * Uncomment to use query validation
   */
  // query() {
  //   return z.object({
  //     page: z.string().transform(Number).pipe(z.number().min(1)),
  //     limit: z.string().transform(Number).pipe(z.number().max(100)),
  //   });
  // }

  /**
   * Validates URL parameters (optional)
   * Uncomment to use param validation
   */
  // param() {
  //   return z.object({
  //     id: z.string().uuid('Invalid ID format'),
  //   });
  // }
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
