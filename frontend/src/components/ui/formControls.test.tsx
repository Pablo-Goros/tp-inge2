import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ChipInput, MonthField, RadioCardGroup, RepeatableList, Select, Switch, Textarea } from './index';

describe('Textarea', () => {
  it('muestra el contador y asocia ayuda y error', () => {
    render(<Textarea label="Resumen" value="hola" maxLength={10} onChange={() => {}} help="Ayuda" error="Falla" />);
    const ta = screen.getByLabelText('Resumen');
    expect(screen.getByText('4 de 10')).toBeInTheDocument();
    expect(ta).toHaveAttribute('aria-invalid', 'true');
    expect(ta.getAttribute('aria-describedby')).toContain(screen.getByText('Falla').id);
  });
});

describe('Select', () => {
  it('tiene label y error', () => {
    render(<Select label="Nivel" error="Elegí uno" defaultValue="a"><option value="a">A</option></Select>);
    expect(screen.getByLabelText('Nivel')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Elegí uno')).toBeInTheDocument();
  });
});

describe('Switch', () => {
  it('es role=switch, cambia y muestra texto de estado', async () => {
    const Demo = () => { const [v, setV] = useState(true); return <Switch label="Proyectos" checked={v} onChange={setV} onText="Visible" offText="Oculta" />; };
    render(<Demo />);
    const sw = screen.getByRole('switch', { name: 'Proyectos' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Visible')).toBeInTheDocument();
    await userEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Oculta')).toBeInTheDocument();
  });
});

describe('RadioCardGroup', () => {
  it('es un radiogroup con una opción marcada', async () => {
    const Demo = () => { const [v, setV] = useState('a'); return <RadioCardGroup legend="Portada" value={v} onChange={setV} options={[{ value: 'a', label: 'Ondas' }, { value: 'b', label: 'Malla' }]} />; };
    render(<Demo />);
    expect(screen.getByRole('radiogroup', { name: 'Portada' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Ondas/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Malla' }));
    expect(screen.getByRole('radio', { name: /Malla/ })).toBeChecked();
  });
});

describe('ChipInput', () => {
  it('agrega con Enter, evita repetidos y quita con su botón', async () => {
    const Demo = () => { const [v, setV] = useState<string[]>(['Redes']); return <ChipInput label="Intereses" values={v} onChange={setV} />; };
    render(<Demo />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Intereses' }), 'Ajedrez{Enter}');
    expect(screen.getByText('Ajedrez')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Intereses' }), 'redes{Enter}');
    expect(screen.getAllByText('Redes')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Ajedrez' }));
    expect(screen.queryByText('Ajedrez')).toBeNull();
  });
});

describe('MonthField', () => {
  it('emite AAAA-MM solo con mes y año', async () => {
    const seen: string[] = [];
    const Demo = () => { const [v, setV] = useState(''); return <MonthField label="Desde" value={v} onChange={(x) => { seen.push(x); setV(x); }} />; };
    render(<Demo />);
    await userEvent.selectOptions(screen.getByLabelText('Desde: mes'), '03');
    expect(seen[seen.length - 1]).toBe('');
    await userEvent.selectOptions(screen.getByLabelText('Desde: año'), '2024');
    expect(seen[seen.length - 1]).toBe('2024-03');
  });
});

describe('RepeatableList', () => {
  type It = { id: string; name: string };
  const Demo = () => {
    const [items, setItems] = useState<It[]>([{ id: '1', name: 'Uno' }, { id: '2', name: 'Dos' }]);
    return (
      <RepeatableList<It>
        noun="ítem" addLabel="Agregar ítem" emptyText="Nada" items={items} onChange={setItems} createItem={() => ({ id: String(Math.random()), name: '' })}
        summary={(x) => ({ title: x.name })}
        renderFields={(x, up) => <label>Nombre<input value={x.name} onChange={(e) => up({ name: e.target.value })} /></label>}
      />
    );
  };
  it('reordena con botones y anuncia el orden', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Bajar Uno' }));
    expect(screen.getByRole('status')).toHaveTextContent('Uno pasó al lugar 2 de 2');
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Uno');
    expect(screen.getByRole('button', { name: 'Subir Dos' })).toBeDisabled();
  });
  it('quitar pide confirmación en línea', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Uno' }));
    const grp = screen.getByRole('group', { name: /Confirmar quitar Uno/ });
    await userEvent.click(within(grp).getByRole('button', { name: 'No' }));
    expect(screen.getByText('Uno')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Uno' }));
    await userEvent.click(screen.getByRole('button', { name: /^Sí/ }));
    expect(screen.queryByText('Uno')).toBeNull();
  });
  it('agregar abre el ítem con foco en el primer campo', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: '+ Agregar ítem' }));
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
  });
});
