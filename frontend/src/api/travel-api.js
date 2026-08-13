import { apiRequest } from './client.js';

export async function listTrips() {
  const data = await apiRequest('/travel-history');
  return data.trips;
}

export async function getTrip(id) {
  const data = await apiRequest(`/travel-history/${id}`);
  return data.trip;
}

export async function saveTrip(id, trip) {
  const data = await apiRequest(`/travel-history${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(trip),
  });
  return data.trip;
}

export function deleteTrip(id) {
  return apiRequest(`/travel-history/${id}`, { method: 'DELETE' });
}

export async function listDestinationChecklists() {
  return apiRequest('/destination-checklists');
}

export async function getDestinationChecklist(id) {
  return apiRequest(`/destination-checklists/${id}`);
}

