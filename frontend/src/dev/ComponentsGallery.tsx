import {
  Alert, Button, Card, EmptyState, ErrorState, Field, FileDropzone, SegmentedProgress, SkeletonList,
  CertStatusBadge, BatchStatusBadge, VerifyResultBadge, Table, Topbar,
} from '../components/ui';

const counts = { total: 48, pending: 13, processing: 2, issued: 31, failed: 2 };
const rows = [
  { id: '1', name: 'Camila Ferreyra', status: 'ISSUED' as const, attempts: 1 },
  { id: '2', name: 'Joaquín Ibarra', status: 'FAILED' as const, attempts: 3 },
];

/** Galería de componentes para desarrollo (equivale a design/Main.dc.html). */
export function ComponentsGallery() {
  return (
    <>
      <Topbar nav={[{ to: '/', label: 'Lotes' }, { to: '/nuevo', label: 'Nuevo lote' }]} user={{ name: 'Marcos Quiroga', roleLabel: 'Operador' }} onLogout={() => {}} />
      <main className="page">
        <h1 className="disp page-title">Sistema de componentes</h1>
        <div className="row">
          <Button>Ingresar</Button><Button variant="secondary">Reintentar</Button><Button variant="ghost">Cerrar sesión</Button>
          <Button loading loadingLabel="Ingresando…">Ingresar</Button><Button disabled>Emitir certificados</Button>
        </div>
        <Field label="Email" placeholder="nombre@instituto.edu.ar" />
        <Field label="Nombre del curso" error="Ingresá el nombre del curso." />
        <div className="row">
          <CertStatusBadge status="PENDING" /><CertStatusBadge status="PROCESSING" /><CertStatusBadge status="ISSUED" />
          <CertStatusBadge status="PENDING" attempts={2} /><CertStatusBadge status="FAILED" />
          <BatchStatusBadge status="IN_PROGRESS" /><BatchStatusBadge status="COMPLETED" /><BatchStatusBadge status="COMPLETED_WITH_ERRORS" />
        </div>
        <div className="row">
          <VerifyResultBadge outcome="VALID" /><VerifyResultBadge outcome="ALTERED" />
          <VerifyResultBadge outcome="NOT_FOUND" /><VerifyResultBadge outcome="UNAVAILABLE" />
        </div>
        <Alert tone="info">El progreso se actualiza solo.</Alert>
        <Alert tone="success">El lote se emitió completo.</Alert>
        <Alert tone="warn">No se pudo actualizar; se muestran los últimos datos.</Alert>
        <ErrorState message="No se pudo cargar la lista de lotes." onRetry={() => {}} />
        <SegmentedProgress counts={counts} legend />
        <Card flush>
          <Table
            caption="Alumnos"
            rows={rows}
            rowKey={(r) => r.id}
            rowClass={(r) => (r.status === 'FAILED' ? 'fail' : undefined)}
            columns={[
              { key: 'n', header: 'Alumno', render: (r) => r.name },
              { key: 's', header: 'Estado', render: (r) => <CertStatusBadge status={r.status} /> },
              { key: 'a', header: 'Intentos', render: (r) => r.attempts },
            ]}
          />
        </Card>
        <FileDropzone accept=".pdf" maxBytes={5 * 1024 * 1024} title="Arrastrá tu PDF acá" hint="Solo .pdf · máximo 5 MB" onFile={() => {}} />
        <SkeletonList label="Cargando lotes…" />
        <EmptyState title="Todavía no hay lotes" description="Cargá un CSV de alumnos para emitir los primeros certificados." />
      </main>
    </>
  );
}
