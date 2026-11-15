# Identidad visual

## Propósito
PoC académica: una institución emite certificados por lote, el alumno los descarga y un tercero (p. ej. quien contrata) verifica un PDF contra el registro, a menudo desde el celular vía QR y con mucha luz. Por eso: tema **claro**, alto contraste, tono sobrio y confiable, sin imitar un sello oficial (es una demo). El resultado de verificación debe ser inequívoco; "No se pudo verificar" nunca se confunde con "Alterado".

## Tokens
Única fuente: `frontend/src/styles/tokens.css`. No hay colores hardcodeados fuera de ese archivo; todo el CSS y los `style` inline usan variables.

| Grupo | Variables |
|---|---|
| Superficies | `--bg` #F4F8FB, `--surface` #FFF, `--surface-2` #EAF1F7, `--border` #C9D8E6, `--border-input` #64748B |
| Texto | `--text` #0C2D48, `--text-muted` #475569 |
| Marca | `--brand` #0369A1, `--brand-hover` #075985, `--on-brand` #FFF, `--focus` #0369A1, `--gold` #A16207 |
| Estados (texto / fondo / borde) | `--ok`, `--bad`, `--warn`, `--info`, `--mut` con sufijos `-bg` y `-bd` |
| Otros | `--bar-bg`, `--info-stripe`, `--placeholder`, `--shadow-card` |

Contraste AA verificado para los pares fijados. Foco: outline 2px `--focus` con offset 2px (anillo claro extra en botón primario).

## Tipografía
IBM Plex Sans 400/500/600/700 para todo (títulos en 700); IBM Plex Mono 400/500 para identificadores, huellas, ids de certificado/lote y códigos (`--font-mono`). Sin degradé en texto.

## Reglas de color
- Verde = **solo** estado ok/emitido/válido. Nunca en botones, enlaces ni marca.
- Rojo = fallido/alterado; ámbar = reintento/aviso/no se pudo verificar; cian = en curso; gris = pendiente/no registrado.
- Azul de marca (`--brand`) = botón primario sólido, enlaces, foco, nav activa.
- Oro = detalle mínimo de marca (punto del wordmark, línea fina en el login). Nunca estados ni botones.
- El color nunca es la única señal: los cuatro resultados de verificación difieren además en forma e ícono (círculo sólido ✓, cuadrado de borde doble ✕, círculo punteado ?, cuadrado redondeado de puntos !).

## Tableros de diseño
Los `design/*.dc.html` (tableros oscuros) quedan **superados en color y tipografía**, pero siguen vigentes en estructura, textos y estados.
