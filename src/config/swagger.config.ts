import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'KeepWatch API',
            version: '1.0.0',
            description: 'API documentation for KeepWatch - A logging and monitoring platform',
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: process.env.API_URL || 'http://localhost:3300',
                description: 'API Server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token obtained from /api/v1/auth endpoint',
                },
                apiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for project authentication',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string',
                            description: 'Firestore document ID',
                        },
                        name: {
                            type: 'string',
                            description: 'User name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address',
                        },
                        userId: {
                            type: 'string',
                            description: 'Unique machine-readable identifier (slug)',
                        },
                        company: {
                            type: 'string',
                            description: 'Company name',
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                    },
                },
                CreateUserInput: {
                    type: 'object',
                    required: ['name', 'email', 'password'],
                    properties: {
                        name: {
                            type: 'string',
                            description: 'User name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address',
                        },
                        password: {
                            type: 'string',
                            format: 'password',
                            description: 'User password',
                        },
                        company: {
                            type: 'string',
                            description: 'Company name',
                        },
                    },
                },
                UpdateUserInput: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'User name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address',
                        },
                        password: {
                            type: 'string',
                            format: 'password',
                            description: 'User password',
                        },
                        company: {
                            type: 'string',
                            description: 'Company name',
                        },
                    },
                },
                Project: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string',
                            description: 'Firestore document ID',
                        },
                        name: {
                            type: 'string',
                            description: 'Project name',
                        },
                        description: {
                            type: 'string',
                            description: 'Project description',
                        },
                        projectId: {
                            type: 'string',
                            description: 'User-friendly slug identifier',
                        },
                        users: {
                            type: 'array',
                            items: {
                                $ref: '#/components/schemas/ProjectUser',
                            },
                        },
                        apiKeys: {
                            type: 'array',
                            items: {
                                $ref: '#/components/schemas/ProjectApiKey',
                            },
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                    },
                },
                ProjectUser: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Firestore document ID',
                        },
                        role: {
                            type: 'string',
                            enum: ['viewer', 'editor', 'admin'],
                            description: 'User role in the project',
                        },
                    },
                },
                ProjectApiKey: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'API key ID',
                        },
                        key: {
                            type: 'string',
                            description: 'API key value',
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                        constraints: {
                            type: 'object',
                            description: 'Configuration that limits API key usage',
                        },
                    },
                },
                CreateProjectInput: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Project name',
                        },
                        description: {
                            type: 'string',
                            description: 'Project description',
                        },
                    },
                },
                UpdateProjectInput: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Project name',
                        },
                        description: {
                            type: 'string',
                            description: 'Project description',
                        },
                    },
                },
                Log: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string',
                            description: 'Firestore document ID',
                        },
                        level: {
                            type: 'string',
                            description: 'Log level (e.g., error, warn, info, debug)',
                        },
                        environment: {
                            type: 'string',
                            description: 'Environment name (e.g., production, staging, development)',
                        },
                        projectId: {
                            type: 'string',
                            description: 'Project slug identifier',
                        },
                        projectObjectId: {
                            type: 'string',
                            description: 'Firestore document ID of the project',
                        },
                        message: {
                            type: 'string',
                            description: 'Log message',
                        },
                        stackTrace: {
                            type: 'array',
                            items: {
                                type: 'object',
                            },
                            description: 'Stack trace information',
                        },
                        rawStackTrace: {
                            type: 'string',
                            description: 'Optional string representation of the original stack trace',
                        },
                        details: {
                            type: 'object',
                            description: 'Additional log details',
                        },
                        timestampMS: {
                            type: 'number',
                            description: 'UNIX timestamp in milliseconds',
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                    },
                },
                CreateLogInput: {
                    type: 'object',
                    required: ['level', 'environment', 'projectId', 'message'],
                    properties: {
                        level: {
                            type: 'string',
                            description: 'Log level (e.g., error, warn, info, debug)',
                        },
                        environment: {
                            type: 'string',
                            description: 'Environment name (e.g., production, staging, development)',
                        },
                        projectId: {
                            type: 'string',
                            description: 'Project slug identifier',
                        },
                        message: {
                            type: 'string',
                            description: 'Log message',
                        },
                        stackTrace: {
                            type: 'array',
                            items: {
                                type: 'object',
                            },
                            description: 'Stack trace information',
                        },
                        rawStackTrace: {
                            type: 'string',
                            description: 'Optional string representation of the original stack trace',
                        },
                        details: {
                            type: 'object',
                            description: 'Additional log details',
                        },
                        timestampMS: {
                            type: 'number',
                            description: 'UNIX timestamp in milliseconds. Optional - will be generated by the API if not provided.',
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Error message',
                        },
                        details: {
                            type: 'string',
                            description: 'Additional error details',
                        },
                    },
                },
                HealthResponse: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            description: 'API status message',
                        },
                        version: {
                            type: 'string',
                            description: 'API version',
                        },
                        environment: {
                            type: 'string',
                            description: 'Environment name',
                        },
                        timestamp: {
                            type: 'string',
                            format: 'date-time',
                        },
                        firestore: {
                            type: 'object',
                            properties: {
                                status: {
                                    type: 'string',
                                },
                                message: {
                                    type: 'string',
                                },
                            },
                        },
                        typesense: {
                            type: 'object',
                            properties: {
                                status: {
                                    type: 'string',
                                },
                                message: {
                                    type: 'string',
                                },
                            },
                        },
                        redis: {
                            type: 'object',
                            properties: {
                                status: {
                                    type: 'string',
                                },
                                caching: {
                                    type: 'string',
                                },
                                message: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                },
            },
        },
        tags: [
            {
                name: 'Health',
                description: 'Health check endpoints',
            },
            {
                name: 'Authentication',
                description: 'User authentication endpoints',
            },
            {
                name: 'Users',
                description: 'User management endpoints',
            },
            {
                name: 'Projects',
                description: 'Project management endpoints',
            },
            {
                name: 'Logs',
                description: 'Log management endpoints',
            },
        ],
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

