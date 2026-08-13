import { apiRequest } from './client.js';

const resourceMap = {
  passport: { path: '/passports', key: 'passport' },
  visa: { path: '/visas', key: 'visa' },
  'travel-document': { path: '/travel-documents', key: 'travelDocument' },
};

export function getResource(kind) {
  const resource = resourceMap[kind];
  if (!resource) throw new Error('Unknown document type');
  return resource;
}

export async function listAllDocuments() {
  const [passportData, visaData, travelDocumentData] = await Promise.all([
    apiRequest('/passports'),
    apiRequest('/visas'),
    apiRequest('/travel-documents'),
  ]);
  return [
    ...passportData.passports,
    ...visaData.visas,
    ...travelDocumentData.travelDocuments,
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getDocument(kind, id) {
  const resource = getResource(kind);
  const data = await apiRequest(`${resource.path}/${id}`);
  return data[resource.key];
}

export async function saveDocument(kind, id, payload) {
  const resource = getResource(kind);
  const data = await apiRequest(`${resource.path}${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  });
  return data[resource.key];
}

export function deleteDocument(kind, id) {
  return apiRequest(`${getResource(kind).path}/${id}`, { method: 'DELETE' });
}

