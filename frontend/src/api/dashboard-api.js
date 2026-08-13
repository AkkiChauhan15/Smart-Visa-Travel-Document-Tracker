import { apiRequest } from './client.js';

export async function getDashboard() {
  const data = await apiRequest('/dashboard');
  return data.dashboard;
}
