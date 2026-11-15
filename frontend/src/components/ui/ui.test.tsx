import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  Alert, Avatar, Button, Chip, LevelMeter, ProgressRing, SectionCard, Timeline, TimelineItem, CertStatusBadge, Field, FileDropzone, SegmentedProgress, Table, Topbar, VerifyResultBadge, verifyMeta,
} from './index';
import type { VerifyOutcome } from '../../api/types';

describe('VerifyResultBadge', () => {
  const outcomes: VerifyOutcome[] = ['VALID', 'ALTERED', 'NOT_FOUND', 'UNAVAILABLE'];

  it('los cuatro resultados difieren en texto, ícono, color y forma', () => {
    for (const key of ['label', 'icon', 'tone', 'shape'] as const) {
      expect(new Set(outcomes.map((o) => verifyMeta[o][key])).size).toBe(4);
    }
  });

  it.each([
    ['VALID', 'Válido', 'bdg-v-valid'],
    ['ALTERED', 'Alterado', 'bdg-v-altered'],
    ['NOT_FOUND', 'No registrado', 'bdg-v-notfound'],
    ['UNAVAILABLE', 'No se pudo verificar', 'bdg-v-unavailable'],
  ] as const)('%s → %s', (o, label, shape) => {
    render(<VerifyResultBadge outcome={o} />);
    const el = screen.getByTestId(`verify-badge-${o}`);
    expect(el).toHaveTextContent(label);
    expect(el).toHaveClass(shape);
  });
});

describe('CertStatusBadge', () => {
  it('pendiente con intentos previos se muestra como reintento', () => {
    render(<CertStatusBadge status="PENDING" attempts={2} />);
    expect(screen.getByText('Reintento 2/3')).toBeInTheDocument();
  });
  it('emitido y fallido', () => {
    render(<><CertStatusBadge status="ISSUED" /><CertStatusBadge status="FAILED" /></>);
    expect(screen.getByText('Emitido')).toBeInTheDocument();
    expect(screen.getByText('Fallido')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('loading deshabilita, marca aria-busy y muestra la etiqueta de carga', async () => {
    const onClick = vi.fn();
    render(<Button loading loadingLabel="Ingresando…" onClick={onClick}>Ingresar</Button>);
    const b = screen.getByRole('button', { name: 'Ingresando…' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('asocia label, error y ayuda', () => {
    render(<Field label="Email" error="Ingresá el email." help="Ayuda" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Ingresá el email. Ayuda');
  });
});

describe('Alert', () => {
  it('error y aviso usan role alert; info usa status', () => {
    render(<><Alert tone="error">e</Alert><Alert tone="warn">w</Alert><Alert tone="info">i</Alert></>);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe('SegmentedProgress', () => {
  it('describe los contadores para lectores de pantalla', () => {
    render(<SegmentedProgress counts={{ total: 48, pending: 13, processing: 2, issued: 31, failed: 2 }} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('31 emitidos, 2 fallidos, 2 procesando, 13 pendientes de 48');
  });
  it('total 0 no rompe', () => {
    render(<SegmentedProgress counts={{ total: 0, pending: 0, processing: 0, issued: 0, failed: 0 }} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});

describe('FileDropzone', () => {
  const pdf = (name: string, size = 1000) => {
    const f = new File(['x'], name, { type: 'application/pdf' });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  const setup = () => {
    const onFile = vi.fn();
    render(<FileDropzone accept=".pdf" maxBytes={5 * 1024 * 1024} hint="h" onFile={onFile} />);
    return onFile;
  };

  it('acepta un PDF dentro del límite al soltarlo', () => {
    const onFile = setup();
    const f = pdf('a.pdf');
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [f] } });
    expect(onFile).toHaveBeenCalledWith(f);
  });
  it('rechaza un archivo que no es .pdf', () => {
    const onFile = setup();
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [pdf('a.png')] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Solo se aceptan archivos .pdf de hasta 5,0 MB');
  });
  it('rechaza más de 5 MB e informa el tamaño', () => {
    const onFile = setup();
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [pdf('a.pdf', 8.4 * 1024 * 1024)] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('pesa 8,4 MB');
  });
});

describe('Table', () => {
  it('renderiza tabla (escritorio) y tarjetas (móvil) con los mismos datos', () => {
    render(
      <Table
        caption="Alumnos"
        rows={[{ id: '1', n: 'Ana' }]}
        rowKey={(r) => r.id}
        columns={[{ key: 'n', header: 'Alumno', render: (r) => r.n }, { key: 'i', header: 'Id', render: (r) => r.id }]}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('Ana')).toHaveLength(2);
  });
  it('muestra el encabezado de grupo antes de la fila indicada', () => {
    render(
      <Table
        caption="x"
        rows={[{ id: '1' }, { id: '2' }]}
        rowKey={(r) => r.id}
        groupBefore={(_, i) => (i === 0 ? 'Cola de fallidos · 2' : null)}
        columns={[{ key: 'i', header: 'Id', render: (r) => r.id }]}
      />,
    );
    expect(screen.getAllByText('Cola de fallidos · 2').length).toBeGreaterThan(0);
  });
});

describe('Topbar', () => {
  it('muestra usuario, rol y cierra sesión', async () => {
    const onLogout = vi.fn();
    render(
      <MemoryRouter>
        <Topbar nav={[{ to: '/', label: 'Lotes' }]} user={{ name: 'Marcos', roleLabel: 'Operador' }} onLogout={onLogout} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Operador')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onLogout).toHaveBeenCalled();
  });
});

describe('Avatar', () => {
  it('muestra la imagen con alt y, si falla, cae a las iniciales', () => {
    render(<Avatar name="Camila Ferreyra" src="/rota.png" alt="Foto de Camila" size="lg" />);
    const img = screen.getByRole('img', { name: 'Foto de Camila' });
    expect(img.tagName).toBe('IMG');
    fireEvent.error(img);
    const fb = screen.getByRole('img', { name: 'Foto de Camila' });
    expect(fb.tagName).toBe('SPAN');
    expect(fb).toHaveTextContent('CF');
  });
  it('sin src muestra iniciales y usa el nombre como alt', () => {
    render(<Avatar name="Marcos Quiroga" ring />);
    expect(screen.getByRole('img', { name: 'Marcos Quiroga' })).toHaveTextContent('MQ');
  });
});

describe('LevelMeter', () => {
  it.each([[4, 'Nivel 4 de 5'], [1, 'Nivel 1 de 5'], [9, 'Nivel 5 de 5']])('nivel %s → "%s"', (v, label) => {
    render(<LevelMeter value={v} />);
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
  });
  it('marca los segmentos llenos aparte de los vacíos (no solo color)', () => {
    const { container } = render(<LevelMeter value={3} />);
    expect(container.querySelectorAll('.lvl-on')).toHaveLength(3);
    expect(container.querySelectorAll('.lvl-seg')).toHaveLength(5);
  });
});

describe('ProgressRing, Chip, SectionCard, Timeline', () => {
  it('ProgressRing es un progressbar con valor', () => {
    render(<ProgressRing percent={72} />);
    expect(screen.getByRole('progressbar', { name: 'Completitud del perfil' })).toHaveAttribute('aria-valuenow', '72');
  });
  it('SectionCard titula con h2 y ofrece "Editar"', () => {
    render(<MemoryRouter><SectionCard title="Experiencia" editTo="/profile/edit"><Chip tone="brand">Tutor</Chip></SectionCard></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 2, name: 'Experiencia' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar Experiencia' })).toHaveAttribute('href', '/profile/edit');
    expect(screen.getByText('Tutor')).toBeInTheDocument();
  });
  it('Timeline es una lista y avisa el ítem actual', () => {
    render(<Timeline label="Experiencia"><TimelineItem title="Ayudante" meta="mar 2026 – actual" current /></Timeline>);
    expect(screen.getByRole('list', { name: 'Experiencia' })).toBeInTheDocument();
    expect(screen.getByText('(actual)')).toBeInTheDocument();
  });
});
