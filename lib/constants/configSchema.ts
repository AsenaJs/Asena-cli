/**
 * JSON Schema for .asena/config.json
 * Provides IDE autocomplete and validation support
 */
export const CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Asena CLI Configuration',
  description: 'Configuration file for AsenaJS CLI tool',
  type: 'object',
  properties: {
    $schema: {
      type: 'string',
      description: 'JSON Schema reference',
    },
    adapter: {
      type: 'string',
      enum: ['hono', 'ergenecore'],
      description: 'HTTP adapter to use for the project',
    },
    suffixes: {
      description: 'Configure component naming suffixes',
      oneOf: [
        {
          type: 'boolean',
          description: 'Enable/disable all suffixes globally (true = use defaults, false = no suffixes)',
        },
        {
          type: 'object',
          description: 'Granular control per component type',
          properties: {
            controller: {
              type: ['boolean', 'string'],
              description: 'Controller suffix (true = "Controller", false = none, string = custom)',
            },
            service: {
              type: ['boolean', 'string'],
              description: 'Service suffix (true = "Service", false = none, string = custom)',
            },
            middleware: {
              type: ['boolean', 'string'],
              description: 'Middleware suffix (true = "Middleware", false = none, string = custom)',
            },
            validator: {
              type: ['boolean', 'string'],
              description: 'Validator suffix (true = "Validator", false = none, string = custom)',
            },
            config: {
              type: ['boolean', 'string'],
              description: 'Config suffix (true = "Config", false = none, string = custom)',
            },
            websocket: {
              type: ['boolean', 'string'],
              description: 'WebSocket suffix (true = "Namespace", false = none, string = custom)',
            },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['adapter'],
  additionalProperties: false,
};
