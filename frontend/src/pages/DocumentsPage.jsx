import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteDocument, listAllDocuments } from '../api/document-api.js';
import { downloadApiFile } from '../api/client.js';
import AppShell from '../components/AppShell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const kindLabels = { passport: 'Passport', visa: 'Visa', 'travel-document': 'Supporting document' };

function documentTitle(document) {
  if (document.kind === 'passport') return document.passportNumber;
  if (document.kind === 'visa') return `${document.country} · ${document.visaType}`;
  return document.documentType;
}

function documentDetails(document) {
  if (document.kind === 'passport') {
    return [`Issued by ${document.countryOfIssue}`, `Issue date ${document.issueDate}`, `Expiry date ${document.expiryDate}`];
  }
  if (document.kind === 'visa') {
    return [`Visa ID ${document.visaId}`, `${document.entryType} entry`, `${document.validFrom} — ${document.validUntil}`];
  }
  return [document.originalFileName, document.expiryDate ? `Expiry date ${document.expiryDate}` : 'No expiry date'];
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    listAllDocuments()
      .then(setDocuments)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleDelete() {
    setIsDeleting(true);
    setError('');
    try {
      await deleteDocument(pendingDelete.kind, pendingDelete.id);
      setDocuments((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDownload(document) {
    setError('');
    try {
      const { blob, fileName } = await downloadApiFile(`/travel-documents/${document.id}/file`);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <AppShell>
      <main className="content-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Private records</p>
            <h1>Travel documents</h1>
            <p>Passports, visas, and supporting files attached to your account.</p>
          </div>
          <Link className="primary-link" to="/documents/new">Add document</Link>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading your documents…</p>}
        {!isLoading && documents.length === 0 && (
          <section className="empty-state">
            <h2>No documents yet</h2>
            <p>Add a passport, visa, or private supporting file to begin.</p>
          </section>
        )}

        <section className="document-grid" aria-live="polite">
          {documents.map((document) => (
            <article className="document-card" key={`${document.kind}-${document.id}`} data-kind={document.kind}>
              <div>
                <div className="badge-row">
                  <span className={`kind-badge kind-${document.kind}`}>{kindLabels[document.kind]}</span>
                  <StatusBadge status={document.status} />
                </div>
                <h2>{documentTitle(document)}</h2>
                <ul>
                  {documentDetails(document).map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </div>
              <div className="card-actions">
                {document.kind === 'travel-document' && (
                  <button type="button" onClick={() => handleDownload(document)}>Download</button>
                )}
                <Link to={`/documents/${document.kind}/${document.id}/edit`}>Edit</Link>
                <button className="delete-action" type="button" onClick={() => setPendingDelete(document)}>Delete</button>
              </div>
            </article>
          ))}
        </section>
      </main>
      {pendingDelete && (
        <ConfirmDialog
          documentName={documentTitle(pendingDelete)}
          isDeleting={isDeleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </AppShell>
  );
}
