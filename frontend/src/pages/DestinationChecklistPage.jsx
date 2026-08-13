import { useEffect, useState } from 'react';
import { listDestinationChecklists } from '../api/travel-api.js';
import AppShell from '../components/AppShell.jsx';
import SelectField from '../components/SelectField.jsx';

export default function DestinationChecklistPage() {
  const [checklists, setChecklists] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [referenceNotice, setReferenceNotice] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listDestinationChecklists()
      .then((data) => {
        setChecklists(data.destinationChecklists);
        setReferenceNotice(data.referenceNotice);
        setSelectedId(data.destinationChecklists[0]?.id ?? '');
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  const selected = checklists.find((checklist) => checklist.id === selectedId);
  const disclaimer = selected?.disclaimer ?? referenceNotice?.disclaimer;

  return (
    <AppShell>
      <main className="content-page checklist-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Planning reference</p>
            <h1>Destination checklist</h1>
            <p>Choose a destination to review example preparation prompts.</p>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading destination references…</p>}
        {!isLoading && selected && (
          <div className="checklist-layout">
            <aside className="destination-picker">
              <SelectField id="destination" label="Destination" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {checklists.map((checklist) => (
                  <option value={checklist.id} key={checklist.id}>{checklist.destinationCountry}</option>
                ))}
              </SelectField>
              <p>{checklists.length} static destination references available.</p>
            </aside>
            <section className="checklist-content" aria-live="polite">
              <div className="reference-warning" role="note" aria-label="Important reference data disclaimer">
                <strong>Not live-verified reference data</strong>
                <p>{disclaimer}</p>
                <p>Always check current official government and immigration sources before travel.</p>
              </div>
              <p className="eyebrow">Example preparation prompts</p>
              <h2>{selected.destinationCountry}</h2>
              <ul className="checklist-items">
                {selected.checklistItems.map((item) => (
                  <li key={item}><span aria-hidden="true">✓</span><span>{item}</span></li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}

