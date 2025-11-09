export type BillingInterval = 'monthly' | 'yearly';

export interface SubscriptionPlan {
    _id?: string;
    name: string;
    machineName: string;
    listPrice: number;
    logLimit?: number | null;
    projectLimit?: number | null;
    billingInterval: BillingInterval;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateSubscriptionPlanInput {
    name: string;
    machineName: string;
    listPrice: number;
    logLimit?: number | null;
    projectLimit?: number | null;
    billingInterval: BillingInterval;
}

export interface UpdateSubscriptionPlanInput {
    name?: string;
    listPrice?: number;
    logLimit?: number | null;
    projectLimit?: number | null;
    billingInterval?: BillingInterval;
}

export interface SubscriptionPlanEnrollment {
    _id?: string;
    userId: string;
    subscriptionPlan: string;
    price: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateSubscriptionPlanEnrollmentInput {
    userId: string;
    subscriptionPlan: string;
    price: number;
}

export interface UpdateSubscriptionPlanEnrollmentInput {
    subscriptionPlan?: string;
    price?: number;
}

export type SystemAdminRole = 'superuser' | 'editor' | 'viewer';

export interface SystemAdmin {
    _id?: string;
    name: string;
    email: string;
    password: string;
    role: SystemAdminRole;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateSystemAdminInput {
    name: string;
    email: string;
    password: string;
    role: SystemAdminRole;
}

export interface UpdateSystemAdminInput {
    name?: string;
    email?: string;
    password?: string;
    role?: SystemAdminRole;
}

