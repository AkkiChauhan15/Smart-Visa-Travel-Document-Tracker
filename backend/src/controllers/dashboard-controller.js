import { getDashboardSummary } from '../services/dashboard-service.js';

export async function getDashboard(req, res, next) {
  try {
    res.json({ dashboard: await getDashboardSummary(req.user.id) });
  } catch (error) {
    next(error);
  }
}
