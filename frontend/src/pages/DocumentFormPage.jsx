import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getDocument, saveDocument } from '../api/document-api.js';
import AppShell from '../components/AppShell.jsx';
import FormField from '../components/FormField.jsx';
import SelectField from '../components/SelectField.jsx';

const MAX_UPLOAD_BYTES = Number.parseInt(import.meta.env.VITE_MAX_UPLOAD_BYTES ?? '5242880', 10);
const MAX_UPLOAD_MEGABYTES = Math.round((MAX_UPLOAD_BYTES / (1024 * 1024)) * 10) / 10;
const initialValues = {
  passportNumber: '', countryOfIssue: '', issueDate: '', expiryDate: '',
  country: '', visaType: '', validFrom: '', validUntil: '', entryType: 'single', visaId: '',
  documentType: '', file: null,
};

function validate(kind, values, isEditing) {
  const errors = {};
  if (kind === 'passport') {
    if (values.passportNumber.trim().length < 3) errors.passportNumber = 'Enter at least 3 characters';
    if (!values.countryOfIssue.trim()) errors.countryOfIssue = 'Country of issue is required';
    if (!values.issueDate) errors.issueDate = 'Issue date is required';
    if (!values.expiryDate) errors.expiryDate = 'Expiry date is required';
    if (values.issueDate && values.expiryDate && values.expiryDate <= values.issueDate) {
      errors.expiryDate = 'Expiry date must be after issue date';
    }
  } else if (kind === 'visa') {
    if (!values.country.trim()) errors.country = 'Country is required';
    if (!values.visaType.trim()) errors.visaType = 'Visa type is required';
    if (!values.validFrom) errors.validFrom = 'Valid from is required';
    if (!values.validUntil) errors.validUntil = 'Valid until is required';
    if (values.validFrom && values.validUntil && values.validUntil < values.validFrom) {
      errors.validUntil = 'Valid until cannot be before valid from';
    }
    if (!values.visaId.trim()) errors.visaId = 'Visa ID is required';
  } else {
    if (!values.documentType.trim()) errors.documentType = 'Document type is required';
    if (!isEditing && !values.file) errors.file = 'Choose a PDF, JPG, or PNG file';
    if (values.file && values.file.size > MAX_UPLOAD_BYTES) errors.file = `File must be ${MAX_UPLOAD_MEGABYTES} MB or smaller`;
    if (values.file && !['application/pdf', 'image/jpeg', 'image/png'].includes(values.file.type)) {
      errors.file = 'Only PDF, JPG, and PNG files are accepted';
    }
  }
  return errors;
}

function payloadFor(kind, values) {
  if (kind === 'passport') {
    return Object.fromEntries(['passportNumber', 'countryOfIssue', 'issueDate', 'expiryDate'].map((key) => [key, values[key]]));
  }
  if (kind === 'visa') {
    return Object.fromEntries(['country', 'visaType', 'validFrom', 'validUntil', 'entryType', 'visaId'].map((key) => [key, values[key]]));
  }
  const formData = new FormData();
  formData.set('documentType', values.documentType);
  formData.set('expiryDate', values.expiryDate || '');
  if (values.file) formData.set('file', values.file);
  return formData;
}

export default function DocumentFormPage() {
  const { kind: routeKind, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const initialKind = routeKind ?? searchParams.get('type') ?? 'passport';
  const [kind, setKind] = useState(initialKind);
  const [values, setValues] = useState(initialValues);
  const [existingFileName, setExistingFileName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validKind = useMemo(() => ['passport', 'visa', 'travel-document'].includes(kind), [kind]);

  useEffect(() => {
    if (!isEditing || !validKind) return;
    getDocument(kind, id)
      .then((document) => {
        setValues((current) => ({ ...current, ...document, expiryDate: document.expiryDate ?? '' }));
        setExistingFileName(document.originalFileName ?? '');
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, [id, isEditing, kind, validKind]);

  function updateValue(event) {
    const { name, value, files } = event.target;
    setValues((current) => ({ ...current, [name]: files ? files[0] ?? null : value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate(kind, values, isEditing);
    setFieldErrors(errors);
    setError('');
    if (Object.keys(errors).length) return;

    setIsSubmitting(true);
    try {
      await saveDocument(kind, id, payloadFor(kind, values));
      navigate('/documents', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.details) {
        setFieldErrors(Object.fromEntries(requestError.details.map((item) => [item.field, item.message])));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!validKind) {
    return <AppShell><main className="content-page"><div className="form-error">Unknown document type.</div></main></AppShell>;
  }

  return (
    <AppShell>
      <main className="content-page narrow-page">
        <Link className="back-link" to="/documents">← Back to documents</Link>
        <div className="page-heading compact-heading">
          <div>
            <p className="eyebrow">{isEditing ? 'Update record' : 'New record'}</p>
            <h1>{isEditing ? 'Edit document' : 'Add document'}</h1>
          </div>
        </div>

        <form className="document-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="form-error" role="alert">{error}</div>}
          {!isEditing && (
            <SelectField id="kind" label="Document category" value={kind} onChange={(event) => { setKind(event.target.value); setFieldErrors({}); }}>
              <option value="passport">Passport</option>
              <option value="visa">Visa</option>
              <option value="travel-document">Supporting document</option>
            </SelectField>
          )}
          {isLoading ? <p role="status">Loading document…</p> : (
            <>
              {kind === 'passport' && (
                <div className="form-grid">
                  <FormField id="passportNumber" label="Passport number" required value={values.passportNumber} error={fieldErrors.passportNumber} onChange={updateValue} />
                  <FormField id="countryOfIssue" label="Country of issue" required value={values.countryOfIssue} error={fieldErrors.countryOfIssue} onChange={updateValue} />
                  <FormField id="issueDate" label="Issue date" type="date" required value={values.issueDate} error={fieldErrors.issueDate} onChange={updateValue} />
                  <FormField id="expiryDate" label="Expiry date" type="date" required value={values.expiryDate} error={fieldErrors.expiryDate} onChange={updateValue} />
                </div>
              )}
              {kind === 'visa' && (
                <div className="form-grid">
                  <FormField id="country" label="Destination country" required value={values.country} error={fieldErrors.country} onChange={updateValue} />
                  <FormField id="visaType" label="Visa type" required value={values.visaType} error={fieldErrors.visaType} onChange={updateValue} />
                  <FormField id="visaId" label="Visa ID" required value={values.visaId} error={fieldErrors.visaId} onChange={updateValue} />
                  <SelectField id="entryType" label="Entry type" value={values.entryType} onChange={updateValue}>
                    <option value="single">Single entry</option>
                    <option value="multiple">Multiple entry</option>
                  </SelectField>
                  <FormField id="validFrom" label="Valid from" type="date" required value={values.validFrom} error={fieldErrors.validFrom} onChange={updateValue} />
                  <FormField id="validUntil" label="Valid until" type="date" required value={values.validUntil} error={fieldErrors.validUntil} onChange={updateValue} />
                </div>
              )}
              {kind === 'travel-document' && (
                <div className="form-grid">
                  <FormField id="documentType" label="Document type" required value={values.documentType} error={fieldErrors.documentType} onChange={updateValue} />
                  <FormField id="expiryDate" label="Expiry date (optional)" type="date" value={values.expiryDate} error={fieldErrors.expiryDate} onChange={updateValue} />
                  <div className="field file-field full-width">
                    <label htmlFor="file">{isEditing ? 'Replace file (optional)' : 'Supporting file'}</label>
                    {existingFileName && <p className="current-file">Current file: {existingFileName}</p>}
                    <input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required={!isEditing} aria-invalid={Boolean(fieldErrors.file)} onChange={updateValue} />
                    <small>PDF, JPG, or PNG. Maximum {MAX_UPLOAD_MEGABYTES} MB.</small>
                    {fieldErrors.file && <span className="field-error">{fieldErrors.file}</span>}
                  </div>
                </div>
              )}
              <div className="form-actions">
                <Link className="secondary-button" to="/documents">Cancel</Link>
                <button className="primary-button fit-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add document'}
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </AppShell>
  );
}
