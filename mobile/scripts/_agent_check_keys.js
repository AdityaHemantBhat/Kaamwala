const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src');
const hi = fs.readFileSync(path.join(ROOT, 'translations', 'hi.ts'), 'utf8');
const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
const keys = new Set();
let m;
while ((m = re.exec(hi))) keys.add(m[1].replace(/\\'/g, "'"));

const candidates = [
  "Audit Search", "Search name, phone, or ID...", "No users found.", "Unknown",
  "Error", "Please provide a ban reason.", "Failed to ban user", "Failed to unban user",
  "Unban", "Ban User", "Overview", "BANNED", "Joined:", "Wallet:", "Jobs Done:",
  "Activity Timeline", "No logs found for this user.", "Successful Login", "Failed Login Attempt",
  "Reason:", "Unknown", "IP:", "Res:", "Ban", "Reason (Required)", "e.g. Fraudulent activity",
  "Ban Type", "Temporary", "Permanent", "Duration (Days)", "Ban IP Address",
  "Blocks devices using their last IP", "Cancel", "Confirm Ban",
  "Pending", "Accepted", "On Way", "In Progress", "Completed", "Cancelled", "Bookings",
  "All", "Active", "Service", "Customer", "Unassigned", "No bookings found", "Cancellations",
  "Paid", "Waived", "Refunded", "ALL", "No cancellation records found", "N/A", "Worker",
  "By", "Worker compensation", "held for review", "Waive Fee", "Refund",
  "Welcome,", "Admin", "Platform overview", "Total Revenue", "Users", "Workers",
  "Management", "Verifications", "Issues", "Market Pricing", "Risk & Anomalies", "Marketplace",
  "Revenue", "Withdrawals", "Support Tickets", "Guarantee Claims", "Worker Leads", "Super Admin",
  "Pending Verifications", "Location Pending", "Review",
  "Approved", "Rejected", "Booking", "Customer:", "Worker:", "photo(s) attached", "Review claim",
  "Resolution note (optional)", "e.g. Approved — part replaced free of charge", "Approve", "Reject",
  "No claims", "New Issue", "Canonical ID (e.g. TAP_INSTALLATION)", "Display Label",
  "Aliases (comma separated)", "Create", "No issues found", "Reject", "Promote", "Archive", "Reactivate",
  "Leads used", "At/over limit", "No workers found", "At limit", "Leads this month:", "Unlimited",
  "Failed to load audit logs.",
  "Guest", "Customer", "Wallet", "On The Way"
];
for (const c of candidates) {
  if (keys.has(c)) console.log('EXISTS: ' + JSON.stringify(c));
}
console.log('Total keys in hi.ts:', keys.size);
