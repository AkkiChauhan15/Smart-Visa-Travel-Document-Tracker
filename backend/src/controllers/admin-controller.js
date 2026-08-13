import {
  getAdminStatistics,
  listAdminUsers,
  updateAdminUserStatus,
} from '../services/admin-service.js';

export async function listUsers(_req, res, next) {
  try {
    res.json({ users: await listAdminUsers() });
  } catch (error) {
    next(error);
  }
}

export async function updateUserStatus(req, res, next) {
  try {
    const user = await updateAdminUserStatus(req.user.id, req.params.id, req.body.status);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function getStatistics(_req, res, next) {
  try {
    res.json({ statistics: await getAdminStatistics() });
  } catch (error) {
    next(error);
  }
}
