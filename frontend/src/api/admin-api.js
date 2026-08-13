import { apiRequest } from './client.js';

export async function listAdminUsers() {
  const data = await apiRequest('/admin/users');
  return data.users;
}

export async function getAdminStatistics() {
  const data = await apiRequest('/admin/statistics');
  return data.statistics;
}

export async function updateAdminUserStatus(userId, status) {
  const data = await apiRequest(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return data.user;
}
