import {
  Alert, Button, Card, EmptyState, ErrorState, Field, FileDropzone, SegmentedProgress, SkeletonList,
  CertStatusBadge, BatchStatusBadge, VerifyResultBadge, Table, Topbar,
  Avatar, Chip, Cover, LevelMeter, ProgressRing, SectionCard, Timeline, TimelineItem,
} from '../components/ui';
import { avatarDataUri } from '../api/mock/avatars';
import { COVER_STYLES } from '../api/profileUtils';

const counts = { total: 48, pending: 13, processing: 2, issued: 31, failed: 2 };
const rows = [
  { id: '1', name: 'Camila Ferreyra', status: 'ISSUED' as const, attempts: 1 },
  { id: '2', name: 'Joaquín Ibarra', status: 'FAILED' as const, attempts: 3 },
];

/** Galería de componentes para desarrollo (equivale a design/Main.dc.html). */
export function ComponentsGallery() {
  return (
    <>
      <Topbar nav={[{ to: '/', label: 'Inicio' }, { to: '/dev/components', label: 'Lotes' }, { to: '/nuevo', label: 'Nuevo lote' }, { to: '/perfil', label: 'Mi perfil' }, { to: '/directorio', label: 'Directorio' }]} user={{ name: 'Marcos Quiroga', roleLabel: 'Operador' }} onLogout={() => {}} />
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

        <h2 className="disp">Perfiles</h2>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {(['sm', 'md', 'lg', 'xl'] as const).map((z) => <Avatar key={z} size={z} name="Camila Ferreyra" src={avatarDataUri('Camila Ferreyra')} ring={z === 'xl'} />)}
          <Avatar size="lg" name="Marcos Quiroga" src="/no-existe.png" />
        </div>
        <div className="row">
          <Chip>Python</Chip><Chip tone="brand">Tutor</Chip><Chip tone="ok" icon="✓">Disponible</Chip>
          <Chip tone="warn" icon="!">Cupo limitado</Chip><Chip tone="bad" icon="✕">Cerrado</Chip><Chip tone="info">Híbrida</Chip>
        </div>
        <div className="row">
          {[1, 2, 3, 4, 5].map((n) => <span key={n} className="row" style={{ gap: 6 }}><LevelMeter value={n} /><span className="help">{n}/5</span></span>)}
          <ProgressRing percent={72} />
          <ProgressRing percent={100} size={64} />
        </div>
        <div className="row">
          {COVER_STYLES.map((c) => <div key={c.id} style={{ width: 150 }}><Cover style={c.id} /><p className="help">{c.label}</p></div>)}
        </div>
        <SectionCard title="Experiencia" editTo="/profile/edit">
          <Timeline label="Experiencia">
            <TimelineItem title="Ayudante de cátedra" subtitle="Instituto Demo" meta="mar 2026 – actual" current>Laboratorios de redes y criptografía.</TimelineItem>
            <TimelineItem title="Pasante de soporte" subtitle="Estudio Marín" meta="ene 2025 – dic 2025">Backups automatizados.</TimelineItem>
          </Timeline>
        </SectionCard>
        <a href="#top" className="card card-link"><strong>Tarjeta enlazada</strong><p className="help">Sube 2 px al pasar el mouse; <span className="lnk-draw">este enlace dibuja su subrayado</span>.</p></a>
      </main>
    </>
  );
}
