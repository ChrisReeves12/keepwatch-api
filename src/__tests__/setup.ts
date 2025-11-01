import { setupTestDatabase, cleanupTestDatabase, closeTestDatabase } from './helpers/db.helper';

// Replace Redis client with in-memory mock implementation for tests
jest.mock('ioredis', () => require('ioredis-mock'));

// Minimal Typesense client mock used by the application during tests
jest.mock('typesense', () => {
    const collectionsStore: Record<string, any> = {};

    class MockCollections {
        constructor(private name: string) {}

        private ensureCollection() {
            if (!collectionsStore[this.name]) {
                collectionsStore[this.name] = { schema: { name: this.name }, documents: {} };
            }
            return collectionsStore[this.name];
        }

        async retrieve() {
            const existing = collectionsStore[this.name];
            if (!existing) {
                const error: any = new Error('Collection not found');
                error.httpStatus = 404;
                throw error;
            }
            return existing.schema;
        }

        documents(id?: string) {
            if (id) {
                return {
                    delete: async () => {
                        const collection = collectionsStore[this.name];
                        if (collection?.documents) {
                            delete collection.documents[id];
                        }
                        return { success: true };
                    },
                };
            }

            return {
                create: async (document: any) => {
                    const collection = this.ensureCollection();
                    collection.documents = collection.documents || {};
                    const documentId = document.id || `${Date.now()}`;
                    collection.documents[documentId] = { ...document, id: documentId };
                    return document;
                },
                search: async (searchParams: any) => {
                    const collection = this.ensureCollection();
                    let documents = Object.values(collection.documents || {}) as any[];

                    // Parse filter_by clause (e.g., "projectId:xxx && level:error")
                    if (searchParams.filter_by) {
                        const filters = searchParams.filter_by.split(' && ');
                        filters.forEach((filter: string) => {
                            const [field, value] = filter.split(':');
                            if (field && value) {
                                documents = documents.filter((doc: any) => {
                                    const docValue = String(doc[field] || '');
                                    return docValue === value;
                                });
                            }
                        });
                    }

                    // Handle search query (q parameter) with simple boolean + wildcard support
                    if (searchParams.q && searchParams.q !== '*') {
                        const queryBy = searchParams.query_by || 'message';
                        const useBooleanAnd = !!searchParams.use_boolean_and;

                        // Tokenize on whitespace; ignore literal OR for safety
                        const rawTerms: string[] = String(searchParams.q)
                            .split(/\s+/)
                            .filter(Boolean)
                            .filter(t => t.toUpperCase() !== 'OR' && t.toUpperCase() !== 'AND');

                        const termMatchers = rawTerms.map(term => {
                            const lower = term.toLowerCase();
                            const startsWithWildcard = lower.startsWith('*');
                            const endsWithWildcard = lower.endsWith('*');
                            const core = lower.replace(/^\*/,'').replace(/\*$/,'');

                            return (text: string) => {
                                const value = text.toLowerCase();
                                if (startsWithWildcard && endsWithWildcard) {
                                    // *core*
                                    return value.includes(core);
                                } else if (startsWithWildcard) {
                                    // *core => endsWith
                                    return value.endsWith(core);
                                } else if (endsWithWildcard) {
                                    // core* => startsWith
                                    return value.startsWith(core);
                                } else {
                                    // contains
                                    return value.includes(core);
                                }
                            };
                        });

                        documents = documents.filter((doc: any) => {
                            const fieldValue = String(doc[queryBy] || '');
                            if (termMatchers.length === 0) return true;
                            if (useBooleanAnd) {
                                return termMatchers.every(match => match(fieldValue));
                            } else {
                                return termMatchers.some(match => match(fieldValue));
                            }
                        });
                    }

                    // Sort by timestampMS descending (most recent first)
                    documents.sort((a: any, b: any) => {
                        const aTime = a.timestampMS || 0;
                        const bTime = b.timestampMS || 0;
                        return bTime - aTime;
                    });

                    // Apply pagination
                    const page = searchParams.page || 1;
                    const perPage = searchParams.per_page || 50;
                    const startIndex = (page - 1) * perPage;
                    const endIndex = startIndex + perPage;
                    const paginatedDocuments = documents.slice(startIndex, endIndex);

                    // Format results
                    const hits = paginatedDocuments.map((doc: any) => ({ document: doc }));

                    return {
                        found: documents.length,
                        hits,
                    };
                },
            };
        }
    }

    class MockTypesenseClient {
        collections(name?: string) {
            if (name) {
                return new MockCollections(name);
            }
            return {
                create: async (schema: any) => {
                    collectionsStore[schema.name] = { schema, documents: {} };
                    return schema;
                },
            };
        }
    }

    return { Client: MockTypesenseClient };
});

/**
 * Global test setup - runs before all tests
 */
beforeAll(async () => {
    // Set Firestore emulator host for tests
    // Make sure the Firestore emulator is running via docker-compose
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.GOOGLE_CLOUD_PROJECT = 'keepwatch-test';
    
    // Set test environment variables if not already set
    if (!process.env.TYPESENSE_HOST) {
        process.env.TYPESENSE_HOST = 'localhost';
    }
    if (!process.env.TYPESENSE_PORT) {
        process.env.TYPESENSE_PORT = '8108';
    }
    if (!process.env.TYPESENSE_API_KEY) {
        process.env.TYPESENSE_API_KEY = 'typesense-dev-key';
    }
    process.env.USE_TYPESENSE = 'true';
    if (!process.env.REDIS_HOST) {
        process.env.REDIS_HOST = 'localhost';
    }
    if (!process.env.REDIS_PORT) {
        process.env.REDIS_PORT = '6379';
    }
    if (!process.env.REDIS_KEY_PREFIX) {
        process.env.REDIS_KEY_PREFIX = 'keepwatch-test';
    }
    if (process.env.USE_CACHE === undefined) {
        process.env.USE_CACHE = 'true';
    }
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
    }
    if (!process.env.JWT_EXPIRY) {
        process.env.JWT_EXPIRY = '7d';
    }

    await setupTestDatabase();
});

/**
 * Cleanup after each test
 */
afterEach(async () => {
    await cleanupTestDatabase();
});

/**
 * Global test teardown - runs after all tests
 */
afterAll(async () => {
    await closeTestDatabase();
});
