import RedisMock from 'ioredis-mock';

jest.mock('../database/firestore.connection', () => {
    const mockCollection = {
        add: jest.fn(),
        doc: jest.fn(),
        where: jest.fn(),
        get: jest.fn(),
        limit: jest.fn(),
    };

    return {
        getFirestore: jest.fn(() => ({
            collection: jest.fn(() => mockCollection),
        })),
        arrayUnion: jest.fn((value) => value),
        arrayRemove: jest.fn((value) => value),
    };
});

jest.mock('../services/redis.service', () => {
    const redisMock = new RedisMock();
    return {
        getCache: jest.fn(),
        setCache: jest.fn(),
        deleteCache: jest.fn(),
        getRedisClient: jest.fn(() => redisMock),
    };
});

jest.mock('../services/pubsub.service', () => ({
    publishMessage: jest.fn().mockResolvedValue('mock-message-id'),
    ensureTopicExists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/mail.service', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/usage.service', () => ({
    checkAndIncrementOwnerUsage: jest.fn().mockResolvedValue({
        allowed: true,
        current: 0,
    }),
    getBillingPeriod: jest.fn(),
    hasSentLimitEmail: jest.fn().mockResolvedValue(false),
    markLimitEmailSent: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    jest.clearAllMocks();
});
