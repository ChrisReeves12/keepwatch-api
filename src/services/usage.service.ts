import moment from 'moment';
import { getRedisClient, prefixKey, isCachingEnabled } from './redis.service';

/**
 * Billing period information
 */
export interface BillingPeriod {
    start: Date;
    end: Date;
    periodKey: string; // YYYYMMDD format of the period start date
}

/**
 * Result of checking and incrementing usage
 */
export interface UsageCheckResult {
    allowed: boolean;
    current: number;
}

/**
 * User quota information
 */
export interface UserQuota {
    logUsage: {
        current: number;
        limit: number;
        remaining: number;
        percentUsed: number;
    };
    billingPeriod: {
        start: string; // ISO date string
        end: string; // ISO date string
        daysRemaining: number;
    };
}

/**
 * Calculate the billing period for a user based on their createdAt date.
 * The billing month is anchored to the day of the month when the user was created.
 * 
 * @param createdAt - The date when the user account was created
 * @returns Billing period information with start, end, and periodKey
 */
export function getBillingPeriod(createdAt: Date): BillingPeriod {
    // Use moment UTC to ensure consistent timezone handling
    const createdMoment = moment.utc(createdAt);
    const createdDay = createdMoment.date(); // Day of month (1-31)

    const now = moment.utc();
    const currentYear = now.year();
    const currentMonth = now.month(); // 0-indexed (0-11)

    // Calculate the start of the current billing period
    let periodStart = moment.utc([currentYear, currentMonth, createdDay]);

    // If the created day doesn't exist in the current month (e.g., Feb 30),
    // use the last day of the month
    if (!periodStart.isValid() || periodStart.date() !== createdDay) {
        periodStart = moment.utc([currentYear, currentMonth]).endOf('month');
    }

    // If we've already passed the anchor day this month, the period started on that day
    // Otherwise, the period started on the anchor day of the previous month
    if (now.date() < createdDay) {
        periodStart = periodStart.subtract(1, 'month');
        // Recalculate in case the day doesn't exist in the previous month
        if (!periodStart.isValid() || periodStart.date() !== createdDay) {
            periodStart = moment.utc([currentYear, currentMonth - 1]).endOf('month');
        }
    }

    // Calculate the end of the billing period (start of next period)
    const periodEnd = moment.utc(periodStart).add(1, 'month');

    // Format period key as YYYYMMDD
    const periodKey = periodStart.format('YYYYMMDD');

    return {
        start: periodStart.toDate(),
        end: periodEnd.toDate(),
        periodKey,
    };
}

/**
 * Redis Lua script for atomic check and increment of usage counter.
 * Returns [allowed (0 or 1), current_count]
 */
const CHECK_AND_INCREMENT_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
if cur + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
    return {0, cur}
end
local newv = redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
if tonumber(ARGV[3]) and tonumber(ARGV[3]) > 0 then
    redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]))
end
return {1, newv}
`;

/**
 * Check and increment owner usage for logging in an atomic operation.
 * Uses Redis Lua script to ensure atomicity.
 * 
 * @param ownerId - The Firestore document ID of the owner
 * @param createdAt - The date when the owner account was created
 * @param increment - The amount to increment (typically 1)
 * @param limit - The monthly limit for this owner
 * @returns Usage check result indicating if the operation was allowed and current count
 */
export async function checkAndIncrementOwnerUsage(
    ownerId: string,
    createdAt: Date,
    increment: number,
    limit: number
): Promise<UsageCheckResult> {
    if (!isCachingEnabled()) {
        // If Redis is disabled, allow the operation (for development/testing)
        console.warn('⚠️  Redis caching is disabled, allowing usage without quota check');
        return { allowed: true, current: 0 };
    }

    const client = getRedisClient();
    if (!client) {
        console.warn('⚠️  Redis client not available, allowing usage without quota check');
        return { allowed: true, current: 0 };
    }

    try {
        const period = getBillingPeriod(createdAt);
        const now = moment.utc();
        const periodEnd = moment.utc(period.end);

        // Calculate TTL in milliseconds (time until period ends, plus a small buffer)
        const ttlMs = Math.max(0, periodEnd.diff(now)) + 60000; // Add 1 minute buffer

        // Construct the Redis key for the usage counter
        const usageKey = prefixKey(`usage:logging:owner:${ownerId}:period:${period.periodKey}`);

        // Execute the Lua script atomically
        const result = await client.eval(
            CHECK_AND_INCREMENT_SCRIPT,
            1, // Number of keys
            usageKey, // KEYS[1]
            increment.toString(), // ARGV[1] - increment amount
            limit.toString(), // ARGV[2] - limit
            Math.floor(ttlMs).toString() // ARGV[3] - TTL in milliseconds
        ) as [number, number];

        const allowed = result[0] === 1;
        const current = result[1];

        return { allowed, current };
    } catch (error) {
        console.error('❌ Error checking/incrementing owner usage:', error);
        // On error, allow the operation to avoid blocking legitimate requests
        return { allowed: true, current: 0 };
    }
}

/**
 * Check if limit email has been sent for a billing period
 * 
 * @param ownerId - The Firestore document ID of the owner
 * @param periodKey - The billing period key (YYYYMMDD format)
 * @returns true if email has been sent, false otherwise
 */
export async function hasSentLimitEmail(ownerId: string, periodKey: string): Promise<boolean> {
    if (!isCachingEnabled()) {
        return false;
    }

    const client = getRedisClient();
    if (!client) {
        return false;
    }

    try {
        const emailFlagKey = prefixKey(`usage:logging:owner:${ownerId}:period:${periodKey}:email-sent`);
        const value = await client.get(emailFlagKey);
        return value === '1';
    } catch (error) {
        console.error('❌ Error checking limit email flag:', error);
        return false;
    }
}

/**
 * Mark that limit email has been sent for a billing period
 * 
 * @param ownerId - The Firestore document ID of the owner
 * @param periodKey - The billing period key (YYYYMMDD format)
 */
export async function markLimitEmailSent(ownerId: string, periodKey: string): Promise<void> {
    if (!isCachingEnabled()) {
        return;
    }

    const client = getRedisClient();
    if (!client) {
        return;
    }

    try {
        const emailFlagKey = prefixKey(`usage:logging:owner:${ownerId}:period:${periodKey}:email-sent`);

        // Set the flag with TTL matching the billing period end
        // We'll use a longer TTL (e.g., 35 days) to ensure it persists through the period
        const ttlSeconds = 35 * 24 * 60 * 60; // 35 days in seconds

        await client.setex(emailFlagKey, ttlSeconds, '1');
    } catch (error) {
        console.error('❌ Error marking limit email as sent:', error);
    }
}

/**
 * Get current usage count for an owner in the current billing period
 * 
 * @param ownerId - The Firestore document ID of the owner
 * @param periodKey - The billing period key (YYYYMMDD format)
 * @returns Current usage count or 0 if not found
 */
export async function getCurrentUsage(ownerId: string, periodKey: string): Promise<number> {
    if (!isCachingEnabled()) {
        return 0;
    }

    const client = getRedisClient();
    if (!client) {
        return 0;
    }

    try {
        const usageKey = prefixKey(`usage:logging:owner:${ownerId}:period:${periodKey}`);
        const value = await client.get(usageKey);
        return value ? parseInt(value, 10) : 0;
    } catch (error) {
        console.error('❌ Error getting current usage:', error);
        return 0;
    }
}

/**
 * Get user quota information including usage and billing period details
 * 
 * @param ownerId - The Firestore document ID of the owner
 * @param createdAt - The date when the owner account was created
 * @param limit - The monthly log limit
 * @returns User quota information
 */
export async function getUserQuota(
    ownerId: string,
    createdAt: Date,
    limit: number
): Promise<UserQuota> {
    const period = getBillingPeriod(createdAt);
    const current = await getCurrentUsage(ownerId, period.periodKey);
    const remaining = Math.max(0, limit - current);
    const percentUsed = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;

    const now = moment.utc();
    const periodEnd = moment.utc(period.end);
    const daysRemaining = Math.max(0, periodEnd.diff(now, 'days'));

    return {
        logUsage: {
            current,
            limit,
            remaining,
            percentUsed: Math.round(percentUsed * 100) / 100, // Round to 2 decimal places
        },
        billingPeriod: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            daysRemaining,
        },
    };
}

