import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ documentName, isDeleting, onCancel, onConfirm }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog className="confirm-dialog" ref={dialogRef} onCancel={onCancel}>
      <p className="eyebrow">Confirm deletion</p>
      <h2>Delete this document?</h2>
      <p>
        <strong>{documentName}</strong> and any privately stored file will be permanently removed.
      </p>
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isDeleting}>Cancel</button>
        <button className="danger-button" type="button" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </dialog>
  );
}

