// emailTemplate.js
const { escapeHtml } = require("./utils");

/**
 * Generates an interactive Spaced Repetition reminder email with one-click review links.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.from - Sender email
 * @param {string} options.problemName - Problem title
 * @param {string} options.problemLink - Problem URL
 * @param {string} options.topic - Problem topic category
 * @param {string} options.difficulty - Easy/Medium/Hard
 * @param {number} options.consecutiveIndependent - Consecutive independent solve streak
 * @param {string} options.reviewUrlBase - Base URL for review clicks
 * @param {string} options.reminderId - MongoDB ID of the reminder
 * @returns {Object} Nodemailer mail options
 */
function createReminderEmail({
  to,
  from,
  problemName,
  problemLink,
  topic = "General",
  difficulty = "Medium",
  consecutiveIndependent = 0,
  reviewUrlBase = "https://chrome-extension-backend-cvc3.onrender.com",
  reminderId,
}) {
  const safeName = escapeHtml(problemName);
  const safeLink = encodeURI(problemLink);
  const safeTopic = escapeHtml(topic);
  const safeDifficulty = escapeHtml(difficulty);

  const difficultyColor =
    difficulty.toLowerCase() === "easy"
      ? "#00b8a3"
      : difficulty.toLowerCase() === "hard"
      ? "#ff2d55"
      : "#ffc01e";

  const subject = `SRS Due: Solve "${problemName}" (${topic}) 🧠`;

  const failedUrl = `${reviewUrlBase}/api/reminders/review-click?id=${reminderId}&outcome=failed`;
  const hintsUrl = `${reviewUrlBase}/api/reminders/review-click?id=${reminderId}&outcome=hints`;
  const independentUrl = `${reviewUrlBase}/api/reminders/review-click?id=${reminderId}&outcome=independent`;

  const text = `LeetCode Spaced Repetition Reminder
Problem: ${problemName}
Topic: ${topic} | Difficulty: ${difficulty}
Streak: ${consecutiveIndependent} independent solves

1. Solve the problem:
${safeLink}

2. Log your outcome with one click:
- Couldn't solve (Review tomorrow): ${failedUrl}
- Solved with hints (Review in 3 days): ${hintsUrl}
- Solved independently (Review in 7+ days): ${independentUrl}

Consistent revision beats cramming every single time!`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeetCode Spaced Repetition</title>
  <style>
    body {
      background-color: #f7f9fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      padding: 32px 28px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }
    .badge-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-topic {
      background-color: #ede9fe;
      color: #6d28d9;
    }
    .badge-diff {
      color: #ffffff;
    }
    .title {
      color: #1e293b;
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px 0;
    }
    .lead {
      color: #475569;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .streak-box {
      background-color: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #334155;
      margin-bottom: 24px;
    }
    .action-btn-main {
      display: block;
      width: 100%;
      text-align: center;
      background-color: #ffa116;
      color: #ffffff !important;
      padding: 13px 0;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 28px;
      box-shadow: 0 2px 4px rgba(255, 161, 22, 0.2);
    }
    .outcomes-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .outcome-btn {
      display: block;
      padding: 10px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      transition: background-color 0.2s;
    }
    .outcome-failed {
      background-color: #fef2f2;
      color: #b91c1c !important;
      border: 1px solid #fecaca;
    }
    .outcome-hints {
      background-color: #fefce8;
      color: #a16207 !important;
      border: 1px solid #fef08a;
    }
    .outcome-independent {
      background-color: #f0fdf4;
      color: #15803d !important;
      border: 1px solid #bbf7d0;
    }
    .footer {
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
      border-top: 1px solid #f1f5f9;
      padding-top: 16px;
      margin-top: 28px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge-bar">
      <span class="badge badge-topic">${safeTopic}</span>
      <span class="badge badge-diff" style="background-color: ${difficultyColor};">${safeDifficulty}</span>
    </div>

    <h2 class="title">${safeName}</h2>

    <p class="lead">
      It is time for your spaced repetition review! Solve it again without looking at solutions first to build lasting neural pathways.
    </p>

    <div class="streak-box">
      🔥 <strong>Current Mastery Streak:</strong> ${consecutiveIndependent} consecutive independent solve(s)
      ${consecutiveIndependent >= 2 ? " — <em>1 more to Mastered!</em>" : ""}
    </div>

    <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="action-btn-main">
      Solve Problem on LeetCode ↗
    </a>

    <div class="outcomes-title">After solving, log your outcome with 1 click:</div>

    <a href="${failedUrl}" target="_blank" class="outcome-btn outcome-failed">
      🔴 Couldn't solve &bull; <span style="font-weight: normal;">Schedule review for Tomorrow (1 day)</span>
    </a>

    <a href="${hintsUrl}" target="_blank" class="outcome-btn outcome-hints">
      🟡 Solved with hints &bull; <span style="font-weight: normal;">Schedule review in 3 days</span>
    </a>

    <a href="${independentUrl}" target="_blank" class="outcome-btn outcome-independent">
      🟢 Solved independently &bull; <span style="font-weight: normal;">Push next review to 7–30 days</span>
    </a>

    <div class="footer">
      LeetCode Spaced Repetition Assistant &bull; Systematic mastery over mindless grinding.
    </div>
  </div>
</body>
</html>`;

  return {
    from,
    to,
    subject,
    text,
    html,
  };
}

module.exports = {
  createReminderEmail,
};
