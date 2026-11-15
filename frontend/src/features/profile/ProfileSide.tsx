import { Link } from 'react-router-dom';
import { Chip, LevelMeter, ProgressRing } from '../../components/ui';
import { profileCompleteness } from '../../api/profileUtils';
import type { LanguageLevel } from '../../api';
import { CheckSealIcon, ExternalIcon, LinkIcon } from './profileIcons';
import { editHash, formatDay, groupSkills, prettyUrl } from './profileHelpers';
import { PSection, type ViewCtx } from './ProfileSection';
import { useProfileCertificates } from './useProfileCertificates';

export function Completeness({ ctx }: { ctx: ViewCtx }) {
  const { percent, missing } = profileCompleteness(ctx.profile);
  return (
    <aside className="card pv-sec pv-o-completeness pv-comp" aria-labelledby="pv-h-completeness">
      <div className="pv-comp-head">
        <ProgressRing percent={percent} />
        <div>
          <h2 id="pv-h-completeness" className="disp sc-title">Completitud del perfil</h2>
          <p className="help">{missing.length ? 'Un perfil completo se lee mejor.' : 'Tu perfil está completo.'}</p>
        </div>
      </div>
      {!!missing.length && (
        <>
          <p className="lbl">Te falta</p>
          <ul className="pv-missing">
            {missing.map((m) => <li key={m.key}><Link to={`/profile/edit#${editHash(m.key)}`} className="lnk-draw">{m.label}</Link></li>)}
          </ul>
        </>
      )}
    </aside>
  );
}

function Certificates({ ctx }: { ctx: ViewCtx }) {
  const st = useProfileCertificates(ctx.profile, ctx.own);
  const items = st.s === 'ok' ? st.items : [];
  return (
    <PSection ctx={ctx} k="certificates" title="Certificados verificables" empty={st.s === 'ok' && !items.length}
      emptyHint="Destacá certificados emitidos a tu cuenta para que cualquiera pueda comprobarlos."
      publicEmptyText="Todavía no destacó certificados.">
      {st.s === 'loading' ? <p className="help" aria-busy="true">Cargando certificados…</p> : (
        <ul className="pv-list">
          {items.map((c) => (
            <li key={c.id} className="pv-cert">
              <div className="pv-cert-top">
                <h3 className="tl-title">{c.course}</h3>
                <span className="bdg ok"><CheckSealIcon />Verificable</span>
              </div>
              <p className="help">{[c.institution, formatDay(c.date)].filter(Boolean).join(' · ')}</p>
              <Link to={`/verify/${c.id}`} className="lnk-draw" aria-label={`Verificar ${c.course}`}>Verificar</Link>
            </li>
          ))}
        </ul>
      )}
    </PSection>
  );
}

const LEVEL_TONE: Record<LanguageLevel, 'brand' | 'neutral'> = { Nativo: 'brand', Avanzado: 'brand', Intermedio: 'neutral', Básico: 'neutral' };

export function SideSections({ ctx }: { ctx: ViewCtx }) {
  const p = ctx.profile;
  return (
    <>
      <Certificates ctx={ctx} />

      <PSection ctx={ctx} k="skills" title="Habilidades" empty={!p.skills.length} emptyHint="Cargá tus habilidades con su nivel.">
        <div className="pv-skills">
          {groupSkills(p.skills).map((g) => (
            <div key={g.category}>
              <h3 className="lbl pv-sub">{g.category}</h3>
              <ul className="pv-skill-list">
                {g.items.map((s) => (
                  <li key={s.id} className="pv-skill">
                    <span>{s.name}</span>
                    <LevelMeter value={s.level} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PSection>

      <PSection ctx={ctx} k="languages" title="Idiomas" empty={!p.languages.length} emptyHint="Sumá los idiomas que hablás.">
        <ul className="pv-list">
          {p.languages.map((l) => (
            <li key={l.id} className="pv-lang"><span>{l.name}</span><Chip tone={LEVEL_TONE[l.level]}>{l.level}</Chip></li>
          ))}
        </ul>
      </PSection>

      <PSection ctx={ctx} k="links" title="Enlaces" empty={!p.links.length} emptyHint="Sumá tu GitHub, LinkedIn o portfolio.">
        <ul className="pv-links">
          {p.links.map((l) => (
            <li key={l.url}>
              <a className="pv-link" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="pv-link-ico"><LinkIcon kind={l.kind} /></span>
                <span className="pv-link-txt"><b>{l.label}</b><span className="help">{prettyUrl(l.url)}</span></span>
                <ExternalIcon />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </li>
          ))}
        </ul>
      </PSection>

      <PSection ctx={ctx} k="interests" title="Intereses" empty={!p.interests.length} emptyHint="Contá qué te interesa.">
        <ul className="pv-chips">{p.interests.map((i) => <li key={i}><Chip>{i}</Chip></li>)}</ul>
      </PSection>
    </>
  );
}
