# Guide: Fixing Integration Tests for Firestore

## Overview
The main codebase has been fully migrated to Firestore. Only the integration tests need ObjectId references removed.

## Files to Fix
1. `/src/__tests__/integration/projects-user-roles.test.ts`
2. `/src/__tests__/integration/projects-api-keys.test.ts`  
3. `/src/__tests__/integration/logs.test.ts`
4. `/src/__tests__/integration/redis.service.test.ts` (if it has ObjectId)

## Pattern to Replace

### OLD (MongoDB with ObjectId):
```typescript
const viewerObjectId = typeof viewerUser._id === 'string' 
    ? new ObjectId(viewerUser._id) 
    : viewerUser._id;

await request(app)
    .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
```

### NEW (Firestore with string IDs):
```typescript
await request(app)
    .put(`/api/v1/projects/${testProject.projectId}/users/${viewerUser._id}/role`)
```

## Step-by-Step Fix for Each Test File

### 1. Remove ObjectId import
```typescript
// Remove this line:
import { ObjectId } from 'mongodb';
```

### 2. Remove ObjectId conversions in test setup
```typescript
// OLD:
const adminObjectId = typeof adminUser._id === 'string' ? new ObjectId(adminUser._id) : adminUser._id;
testProject = await createTestProject({...}, adminObjectId);

// NEW:
testProject = await createTestProject({...}, adminUser._id);
```

### 3. Simplify ID comparisons
```typescript
// OLD:
const updatedUser = updatedProject?.users.find(u => u.id.toString() === viewerObjectId.toString());

// NEW:
const updatedUser = updatedProject?.users.find(u => u.id === viewerUser._id);
```

### 4. Direct string usage in API calls
```typescript
// OLD:
.put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)

// NEW:
.put(`/api/v1/projects/${testProject.projectId}/users/${viewerUser._id}/role`)
```

## Quick Fix Script

You can use search/replace with these patterns:

1. **Remove all ObjectId variable declarations:**
   - Find: `const \w+ObjectId = typeof \w+\._id === 'string' \? new ObjectId\(\w+\._id\) : \w+\._id;`
   - Delete these lines

2. **Replace `.toString()` on IDs:**
   - Find: `(\w+)ObjectId\.toString\(\)`
   - Replace: `$1User._id`

3. **Simplify comparisons:**
   - Find: `u\.id\.toString\(\) === (\w+)ObjectId\.toString\(\)`
   - Replace: `u.id === $1User._id`

## After Fixing

Run type check:
```bash
npm run type-check
```

Run tests:
```bash
npm test
```

## Example: Complete Before/After

### Before:
```typescript
it('should update role', async () => {
    const viewerObjectId = typeof viewerUser._id === 'string' 
        ? new ObjectId(viewerUser._id) 
        : viewerUser._id;

    const response = await request(app)
        .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
        .set('Authorization', createAuthHeader(adminToken))
        .send({ role: 'editor' })
        .expect(200);

    const updatedProject = await findProjectByProjectId(testProject.projectId);
    const updatedUser = updatedProject?.users.find(u => u.id.toString() === viewerObjectId.toString());
    expect(updatedUser?.role).toBe('editor');
});
```

### After:
```typescript
it('should update role', async () => {
    const response = await request(app)
        .put(`/api/v1/projects/${testProject.projectId}/users/${viewerUser._id}/role`)
        .set('Authorization', createAuthHeader(adminToken))
        .send({ role: 'editor' })
        .expect(200);

    const updatedProject = await findProjectByProjectId(testProject.projectId);
    const updatedUser = updatedProject?.users.find(u => u.id === viewerUser._id);
    expect(updatedUser?.role).toBe('editor');
});
```

Much cleaner! 🎉


