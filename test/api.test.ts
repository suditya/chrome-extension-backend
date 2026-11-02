// test/api.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createApp } from '../src/app.ts';
import type { AppConfig } from '../src/config/index.ts';

// In-memory request & response simulator (Zero network sockets required)
function simulateRequest(app: any, options: { method: string; url: string; body?: any; query?: any }) {
  return new Promise<{ statusCode: number; body: string; json: () => any }>((resolve) => {
    const { method, url, body = {}, query = {} } = options;

    const req: any = new EventEmitter();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = { 'content-type': 'application/json' };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.body = body;
    req.query = query;

    const res: any = new EventEmitter();
    let statusCode = 200;
    let responseData = '';

    res.status = (code: number) => {
      statusCode = code;
      return res;
    };
    res.setHeader = () => {};
    res.getHeader = () => undefined;
    res.json = (data: any) => {
      responseData = JSON.stringify(data);
      res.emit('finish');
      resolve({ statusCode, body: responseData, json: () => JSON.parse(responseData) });
      return res;
    };
    res.send = (data: any) => {
      responseData = typeof data === 'string' ? data : JSON.stringify(data);
      res.emit('finish');
      resolve({ statusCode, body: responseData, json: () => JSON.parse(responseData) });
      return res;
    };
    res.end = () => {
      res.emit('finish');
      resolve({ statusCode, body: responseData, json: () => (responseData ? JSON.parse(responseData) : null) });
      return res;
    };

    app.handle(req, res);
  });
}

class MockApiReminderService {
  public reminders: any[] = [];

  async saveReminder(input: any) {
    if (!input.email || !input.problemLink || !input.problemTitle) {
      throw new Error('Missing required fields');
    }
    const id = `mock-id-${Date.now()}`;
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + 3);

    const doc = {
      _id: id,
      ...input,
      nextReviewAt,
      status: 'active',
      consecutiveIndependent: 0,
      reviewCount: 0,
    };
    this.reminders.push(doc);

    return {
      isNew: true,
      reminderId: id,
      nextReviewAt,
      message: 'Saved to Revision Queue!',
    };
  }

  async getUserQueue(email: string) {
    const userReminders = this.reminders.filter((r) => r.email === email);
    return {
      due: userReminders,
      upcoming: [],
      mastered: [],
      stats: {
        totalProblems: userReminders.length,
        dueCount: userReminders.length,
        masteredCount: 0,
        upcomingCount: 0,
        topicStats: {},
      },
    };
  }

  async recordReview(input: any) {
    return {
      message: 'Review Recorded!',
      reminderId: input.id || 'mock-id',
      problemTitle: 'Two Sum',
      problemLink: 'https://leetcode.com/problems/two-sum/',
      nextReviewAt: new Date(),
      nextIntervalDays: 7,
      consecutiveIndependent: 1,
      status: 'active',
      isMastered: false,
    };
  }

  async deleteReminder(id: string) {
    const idx = this.reminders.findIndex((r) => r._id === id);
    if (idx >= 0) {
      this.reminders.splice(idx, 1);
      return true;
    }
    return false;
  }
}

const testConfig: AppConfig = {
  port: 3000,
  nodeEnv: 'test',
  mongoUri: '',
  dbName: 'test',
  adminEmail: 'test@example.com',
  adminPass: 'pass',
  corsOrigin: '*',
  backendPublicUrl: 'http://localhost:3000',
  workerIntervalMs: 1000,
  leaseTimeoutMs: 5000,
};

test('API Integration: endpoints respond with expected contracts in-memory', async () => {
  const service = new MockApiReminderService();
  const app = createApp(service as any, testConfig);

  // 1. Health & Readiness Probes
  const healthzRes = await simulateRequest(app, { method: 'GET', url: '/healthz' });
  assert.strictEqual(healthzRes.statusCode, 200);
  assert.strictEqual(healthzRes.json().status, 'ok');

  const readyzRes = await simulateRequest(app, { method: 'GET', url: '/readyz' });
  assert.strictEqual(readyzRes.statusCode, 200);
  assert.strictEqual(readyzRes.json().ready, true);

  const healthRes = await simulateRequest(app, { method: 'GET', url: '/' });
  assert.strictEqual(healthRes.statusCode, 200);
  const healthData = healthRes.json();
  assert.strictEqual(healthData.status, 'healthy');

  // 2. Topics List
  const topicsRes = await simulateRequest(app, { method: 'GET', url: '/api/topics' });
  assert.strictEqual(topicsRes.statusCode, 200);
  const topicsData = topicsRes.json();
  assert.ok(Array.isArray(topicsData.topics));
  assert.ok(topicsData.topics.includes('Dynamic Programming'));

  // 3. Save Reminder
  const saveRes = await simulateRequest(app, {
    method: 'POST',
    url: '/api/reminders/save',
    body: {
      email: 'student@example.com',
      problemLink: 'https://leetcode.com/problems/two-sum/',
      problemTitle: 'Two Sum',
      topic: 'Arrays & Hashing',
      difficulty: 'Easy',
      initialDays: 3,
    },
  });
  assert.strictEqual(saveRes.statusCode, 200);
  const saveData = saveRes.json();
  assert.strictEqual(saveData.success, true);
  assert.ok(saveData.reminderId);

  // 4. Legacy endpoint backward compatibility
  const legacyRes = await simulateRequest(app, {
    method: 'POST',
    url: '/api/schedule-email',
    body: {
      email: 'student@example.com',
      problemLink: 'https://leetcode.com/problems/3sum/',
      problemName: '3Sum',
      afterDays: 7,
    },
  });
  assert.strictEqual(legacyRes.statusCode, 200);
  const legacyData = legacyRes.json();
  assert.strictEqual(legacyData.success, true);

  // 5. Get User Queue
  const queueRes = await simulateRequest(app, {
    method: 'GET',
    url: '/api/reminders?email=student@example.com',
    query: { email: 'student@example.com' },
  });
  assert.strictEqual(queueRes.statusCode, 200);
  const queueData = queueRes.json();
  assert.strictEqual(queueData.stats.totalProblems, 2);

  // 6. Record Review
  const reviewRes = await simulateRequest(app, {
    method: 'POST',
    url: '/api/reminders/review',
    body: {
      id: saveData.reminderId,
      outcome: 'easy',
    },
  });
  assert.strictEqual(reviewRes.statusCode, 200);
  const reviewData = reviewRes.json();
  assert.strictEqual(reviewData.consecutiveIndependent, 1);

  // 7. 1-Click Review Email Link
  const clickRes = await simulateRequest(app, {
    method: 'GET',
    url: `/api/reminders/review-click?id=${saveData.reminderId}&outcome=easy`,
    query: { id: saveData.reminderId, outcome: 'easy' },
  });
  assert.strictEqual(clickRes.statusCode, 200);
  assert.match(clickRes.body, /Review Recorded!/);

  // 8. Delete Reminder
  const delRes = await simulateRequest(app, {
    method: 'DELETE',
    url: `/api/reminders/${saveData.reminderId}`,
  });
  assert.strictEqual(delRes.statusCode, 200);
});
