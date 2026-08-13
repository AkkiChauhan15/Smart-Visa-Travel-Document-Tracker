import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { getTrip, saveTrip } from '../api/travel-api.js';
import AppShell from '../components/AppShell.jsx';
import FormField from '../components/FormField.jsx';
import SelectField from '../components/SelectField.jsx';

const initialValues = {
  countryVisited: '',
  entryDate: '',
  exitDate: '',
  purpose: '',
  visaUsedId: '',
};

function validate(values) {
  const errors = {};
  if (!values.countryVisited.trim()) errors.countryVisited = 'Country visited is required';
  if (!values.entryDate) errors.entryDate = 'Entry date is required';
  if (!values.exitDate) errors.exitDate = 'Exit date is required';
  if (values.entryDate && values.exitDate && values.exitDate < values.entryDate) {
    errors.exitDate = 'Exit date cannot be before entry date';
  }
  if (!values.purpose.trim()) errors.purpose = 'Purpose is required';
  if (!values.visaUsedId) errors.visaUsedId = 'Select the visa used for this trip';
  return errors;
}

export default function TripFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const [values, setValues] = useState(initialValues);
  const [visas, setVisas] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest('/visas').then((data) => data.visas),
      isEditing ? getTrip(id) : Promise.resolve(null),
    ])
      .then(([visaRecords, trip]) => {
        setVisas(visaRecords);
        if (trip) setValues({
          countryVisited: trip.countryVisited,
          entryDate: trip.entryDate,
          exitDate: trip.exitDate,
          purpose: trip.purpose,
          visaUsedId: trip.visaUsedId ?? '',
        });
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, [id, isEditing]);

  function updateValue(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [event.target.name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    setError('');
    if (Object.keys(errors).length) return;

    setIsSubmitting(true);
    try {
      await saveTrip(id, values);
      navigate('/travel-history', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.details) {
        setFieldErrors(Object.fromEntries(requestError.details.map((item) => [item.field, item.message])));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <main className="content-page narrow-page">
        <Link className="back-link" to="/travel-history">← Back to travel history</Link>
        <div className="page-heading compact-heading">
          <div>
            <p className="eyebrow">{isEditing ? 'Update journey' : 'Past journey'}</p>
            <h1>{isEditing ? 'Edit trip' : 'Log a trip'}</h1>
          </div>
        </div>

        <form className="document-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="form-error" role="alert">{error}</div>}
          {isLoading ? <p role="status">Loading trip form…</p> : visas.length === 0 ? (
            <section className="empty-state compact-empty">
              <h2>Create a visa first</h2>
              <p>A trip must reference one of the visas owned by your account.</p>
              <Link className="primary-link" to="/documents/new?type=visa">Add a visa</Link>
            </section>
          ) : (
            <>
              <div className="form-grid">
                <FormField id="countryVisited" label="Country visited" required value={values.countryVisited} error={fieldErrors.countryVisited} onChange={updateValue} />
                <FormField id="purpose" label="Purpose of travel" required value={values.purpose} error={fieldErrors.purpose} onChange={updateValue} />
                <FormField id="entryDate" label="Entry date" type="date" required value={values.entryDate} error={fieldErrors.entryDate} onChange={updateValue} />
                <FormField id="exitDate" label="Exit date" type="date" required value={values.exitDate} error={fieldErrors.exitDate} onChange={updateValue} />
                <div className="full-width">
                  <SelectField id="visaUsedId" label="Visa used" required value={values.visaUsedId} error={fieldErrors.visaUsedId} onChange={updateValue}>
                    <option value="">Select one of your visas</option>
                    {visas.map((visa) => (
                      <option value={visa.id} key={visa.id}>{visa.country} · {visa.visaType} · {visa.visaId}</option>
                    ))}
                  </SelectField>
                </div>
              </div>
              <div className="form-actions">
                <Link className="secondary-button" to="/travel-history">Cancel</Link>
                <button className="primary-button fit-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Log trip'}
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </AppShell>
  );
}

