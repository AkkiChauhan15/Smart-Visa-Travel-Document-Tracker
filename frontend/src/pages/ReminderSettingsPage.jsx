import { useEffect, useState } from 'react';
import { listReminderSettings, saveReminderSettings } from '../api/reminder-api.js';
import AppShell from '../components/AppShell.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function PreferenceEditor({ setting, onSaved }) {
  const [reminders, setReminders] = useState(setting.reminders);
  const [newDays, setNewDays] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const hasExpiry = Boolean(setting.expiryDate);

  function toggle(index) {
    setReminders((current) =>
      current.map((reminder, itemIndex) =>
        itemIndex === index ? { ...reminder, enabled: !reminder.enabled } : reminder,
      ),
    );
  }

  function updateDays(index, value) {
    setReminders((current) =>
      current.map((reminder, itemIndex) =>
        itemIndex === index ? { ...reminder, daysBefore: value } : reminder,
      ),
    );
  }

  function remove(index) {
    setReminders((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addThreshold() {
    const daysBefore = Number(newDays);
    if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 3650) {
      setError('Enter a whole number between 0 and 3650.');
      return;
    }
    if (reminders.some((reminder) => Number(reminder.daysBefore) === daysBefore)) {
      setError('That threshold is already listed.');
      return;
    }
    if (reminders.length >= 10) {
      setError('A document can have at most 10 thresholds.');
      return;
    }
    setReminders((current) => [...current, { daysBefore, enabled: true }]);
    setNewDays('');
    setError('');
  }

  async function handleSave() {
    const normalized = reminders.map((reminder) => ({
      daysBefore: Number(reminder.daysBefore),
      enabled: Boolean(reminder.enabled),
    }));
    if (
      normalized.length === 0 ||
      normalized.some((reminder) => !Number.isInteger(reminder.daysBefore) || reminder.daysBefore < 0 || reminder.daysBefore > 3650) ||
      new Set(normalized.map((reminder) => reminder.daysBefore)).size !== normalized.length
    ) {
      setError('Use 1–10 unique whole-number thresholds between 0 and 3650 days.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const saved = await saveReminderSettings(setting.kind, setting.documentId, normalized);
      setReminders(saved.reminders);
      onSaved(saved);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="reminder-card" data-kind={setting.kind}>
      <div className="reminder-card-heading">
        <div>
          <span className="kind-badge">{setting.kind.replace('-', ' ')}</span>
          <h2>{setting.label}</h2>
          <p>{hasExpiry ? `Expires ${setting.expiryDate}` : 'No expiry date is stored.'}</p>
        </div>
        <StatusBadge status={setting.status} />
      </div>

      {hasExpiry ? (
        <>
          <div className="threshold-list">
            {reminders.map((reminder, index) => (
              <div className="threshold-row" key={reminder.id ?? `new-${index}`}>
                <label className="toggle-control">
                  <input type="checkbox" checked={reminder.enabled} onChange={() => toggle(index)} />
                  <span>{reminder.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
                <label>
                  <span className="visually-hidden">Days before expiry</span>
                  <input
                    type="number"
                    min="0"
                    max="3650"
                    value={reminder.daysBefore}
                    onChange={(event) => updateDays(index, event.target.value)}
                  />
                  <span>days before</span>
                </label>
                <button type="button" onClick={() => remove(index)} disabled={reminders.length === 1}>Remove</button>
              </div>
            ))}
          </div>
          <div className="add-threshold">
            <label htmlFor={`new-days-${setting.documentId}`}>Add threshold</label>
            <input
              id={`new-days-${setting.documentId}`}
              type="number"
              min="0"
              max="3650"
              placeholder="e.g. 14"
              value={newDays}
              onChange={(event) => setNewDays(event.target.value)}
            />
            <button className="secondary-button" type="button" onClick={addThreshold}>Add</button>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="primary-button fit-button" type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </>
      ) : (
        <p className="muted-note">Add an expiry date to this record before configuring reminders.</p>
      )}
    </article>
  );
}

export default function ReminderSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listReminderSettings()
      .then(setSettings)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  function updateSaved(saved) {
    setSettings((current) =>
      current.map((setting) => (setting.documentId === saved.documentId ? saved : setting)),
    );
  }

  return (
    <AppShell>
      <main className="content-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Email timing</p>
            <h1>Reminder settings</h1>
            <p>Defaults are 90, 60, and 30 days. Changes here control status windows and scheduled email delivery.</p>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading reminder preferences…</p>}
        {!isLoading && settings.length === 0 && <p className="empty-state">Add a travel document to configure reminders.</p>}
        <section className="reminder-grid">
          {settings.map((setting) => (
            <PreferenceEditor key={`${setting.kind}-${setting.documentId}`} setting={setting} onSaved={updateSaved} />
          ))}
        </section>
      </main>
    </AppShell>
  );
}

