import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteTrip, listTrips } from '../api/travel-api.js';
import AppShell from '../components/AppShell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export default function TravelHistoryPage() {
  const [trips, setTrips] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listTrips()
      .then(setTrips)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleDelete() {
    setIsDeleting(true);
    setError('');
    try {
      await deleteTrip(pendingDelete.id);
      setTrips((current) => current.filter((trip) => trip.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AppShell>
      <main className="content-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Your journeys</p>
            <h1>Travel history</h1>
            <p>Past trips and the visas used for them, shown most recent first.</p>
          </div>
          <Link className="primary-link" to="/travel-history/new">Log a trip</Link>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading travel history…</p>}
        {!isLoading && trips.length === 0 && (
          <section className="empty-state">
            <h2>No trips logged yet</h2>
            <p>Add a trip after creating the visa used for that journey.</p>
          </section>
        )}

        <section className="trip-list" aria-live="polite">
          {trips.map((trip) => (
            <article className="trip-card" key={trip.id} data-trip-id={trip.id}>
              <div className="trip-date-block">
                <span>{formatDate(trip.entryDate)}</span>
                <span aria-hidden="true">→</span>
                <span>{formatDate(trip.exitDate)}</span>
              </div>
              <div className="trip-main">
                <span className="kind-badge">Past trip</span>
                <h2>{trip.countryVisited}</h2>
                <p>{trip.purpose}</p>
                <p className="visa-reference">
                  {trip.visaUsed
                    ? `Visa: ${trip.visaUsed.country} · ${trip.visaUsed.visaType} · ${trip.visaUsed.visaId}`
                    : 'The linked visa is no longer available.'}
                </p>
              </div>
              <div className="trip-actions">
                <Link to={`/travel-history/${trip.id}/edit`}>Edit</Link>
                <button type="button" onClick={() => setPendingDelete(trip)}>Delete</button>
              </div>
            </article>
          ))}
        </section>
      </main>
      {pendingDelete && (
        <ConfirmDialog
          documentName={`${pendingDelete.countryVisited} trip`}
          isDeleting={isDeleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </AppShell>
  );
}

