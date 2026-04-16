import { DocumentRecord } from "../lib/api";

type Props = {
  documents: DocumentRecord[];
  selectedDocumentIds: string[];
  onToggle: (id: string) => void;
};

export function DocumentsTable({ documents, selectedDocumentIds, onToggle }: Props) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="eyebrow">Corpus Visibility</p>
        <h2>Indexed sources</h2>
      </div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th scope="col">Use</th>
              <th scope="col">Title</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedDocumentIds.includes(document.id)}
                    onChange={() => onToggle(document.id)}
                  />
                </td>
                <td>
                  <strong>{document.title}</strong>
                  <div className="muted truncate">{document.source_uri}</div>
                </td>
                <td>{document.source_type}</td>
                <td>
                  <span className={`status-chip ${document.status}`}>{document.status}</span>
                </td>
                <td>{new Date(document.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {documents.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No materials ingested yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

