import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field } from '../../components/ui';

// TODO(equipo): el contrato verifica por cert_id; qué mostrar en /verify sin id está sin definir.
// Decisión provisoria: pedir el identificador y navegar a /verify/:id.
export function VerifyLookup() {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = id.trim();
    if (v) navigate(`/verify/${encodeURIComponent(v)}`);
  }
  return (
    <form className="stack vf-lookup" onSubmit={submit}>
      <Field label="Identificador del certificado" value={id} onChange={(e) => setId(e.target.value)} help="Lo encontrás en el PDF o en el QR" autoComplete="off" />
      <div><Button type="submit" disabled={!id.trim()}>Buscar certificado</Button></div>
    </form>
  );
}
