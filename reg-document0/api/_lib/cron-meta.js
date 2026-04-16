/**
 * Vercel Cron definitions (paths + schedules). Keep in sync with `vercel.json` → `crons`.
 * @type {{ path: string; schedule: string; description: string }[]}
 */
export const VERCEL_CRONS = [
  {
    path: "/api/cron-rebuild",
    schedule: "0 7 * * 0",
    description: "Weekly index rebuild (Sunday 07:00 UTC)",
  },
];
