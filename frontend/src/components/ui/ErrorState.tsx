import { Alert } from './Alert';
import { Button } from './Button';

interface Props {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({ message, onRetry, retrying }: Props) {
  return (
    <div className="stack">
      <Alert tone="error">{message}</Alert>
      {onRetry && (
        <div>
          <Button variant="secondary" onClick={onRetry} loading={retrying} loadingLabel="Reintentando…">↻ Reintentar</Button>
        </div>
      )}
    </div>
  );
}
