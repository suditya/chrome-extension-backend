// utils.js

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === "string" && regex.test(email.trim());
}

function extractSlug(url) {
  if (!url) return "";
  const match = String(url).match(/leetcode\.(?:com|cn)\/problems\/([^/?#]+)/i);
  return match ? match[1] : "";
}

module.exports = {
  escapeHtml,
  isValidEmail,
  extractSlug,
};

