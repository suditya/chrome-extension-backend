// src/modules/notifications/emailTemplate.ts
import type { ReminderNotificationPayload, SendEmailOptions } from './types.ts';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildReminderEmail(payload: ReminderNotificationPayload): SendEmailOptions {
  const {
    reminderId,
    recipientEmail,
    problemTitle,
    problemLink,
    topic,
    difficulty,
    consecutiveIndependent,
    publicUrlBase,
    adminEmail,
  } = payload;

  const safeTitle = escapeHtml(problemTitle);
  const safeTopic = escapeHtml(topic);
  const safeDifficulty = escapeHtml(difficulty);
  const safeLink = encodeURI(problemLink);

  const difficultyColor =
    difficulty.toLowerCase() === 'easy'
      ? '#00b8a3'
      : difficulty.toLowerCase() === 'hard'
      ? '#ff2d55'
      : '#ffc01e';

  const subject = `SRS Due: Solve "${problemTitle}" (${topic}) 🧠`;

  const failedUrl = `${publicUrlBase}/api/reminders/review-click?id=${reminderId}&outcome=again`;
  const hintsUrl = `${publicUrlBase}/api/reminders/review-click?id=${reminderId}&outcome=with_hints`;
  const easyUrl = `${publicUrlBase}/api/reminders/review-click?id=${reminderId}&outcome=easy`;

  const text = `LeetCode Spaced Repetition Reminder
Problem: ${problemTitle}
Topic: ${topic} | Difficulty: ${difficulty}
Streak: ${consecutiveIndependent} independent solves

1. Re-solve the problem:
${safeLink}

2. Log your performance with 1 click:
- Couldn't solve (Review tomorrow): ${failedUrl}
- Solved with hints (Review in 3 days): ${hintsUrl}
- Solved independently (Review in 7-30 days): ${easyUrl}

Consistent revision beats cramming every single time!`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeetCode Revision OS</title>
  <style>
    body { background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 20px; }
    .card { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 32px 28px; border: 1px solid #e2e8f0; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-topic { background-color: #ede9fe; color: #6d28d9; }
    .title { color: #1e293b; font-size: 22px; font-weight: 700; margin: 12px 0 16px 0; }
    .streak { background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #334155; margin-bottom: 24px; }
    .btn-main { display: block; width: 100%; text-align: center; background-color: #ffa116; color: #ffffff !important; padding: 13px 0; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 28px; }
    .action-btn { display: block; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .btn-again { background-color: #fef2f2; color: #b91c1c !important; border: 1px solid #fecaca; }
    .btn-hints { background-color: #fefce8; color: #a16207 !important; border: 1px solid #fef08a; }
    .btn-easy { background-color: #f0fdf4; color: #15803d !important; border: 1px solid #bbf7d0; }
    .footer { font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <span class="badge badge-topic">${safeTopic}</span>
      <span class="badge" style="background-color: ${difficultyColor}; color: #ffffff;">${safeDifficulty}</span>
    </div>
    <h2 class="title">${safeTitle}</h2>
    <div class="streak">
      🔥 <strong>Consecutive Independent Solves:</strong> ${consecutiveIndependent}
      ${consecutiveIndependent >= 2 ? ' — <em>1 more to Mastered!</em>' : ''}
    </div>
    <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="btn-main">
      Solve Problem on LeetCode ↗
    </a>
    <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; text-transform: uppercase;">
      Log Review Outcome (1-Click):
    </div>
    <a href="${failedUrl}" target="_blank" class="action-btn btn-again">
      🔴 Couldn't solve &bull; <span style="font-weight: normal;">Schedule review for Tomorrow</span>
    </a>
    <a href="${hintsUrl}" target="_blank" class="action-btn btn-hints">
      🟡 Solved with hints &bull; <span style="font-weight: normal;">Schedule review in 3 days</span>
    </a>
    <a href="${easyUrl}" target="_blank" class="action-btn btn-easy">
      🟢 Solved independently &bull; <span style="font-weight: normal;">Push next review to 7–30 days</span>
    </a>
    <div class="footer">LeetSRS Revision OS &bull; Systematic Mastery</div>
  </div>
</body>
</html>`;

  return {
    to: recipientEmail,
    from: adminEmail,
    subject,
    text,
    html,
  };
}

