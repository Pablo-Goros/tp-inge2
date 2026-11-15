# 05: Comparar el archivo recibido con el registro

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** done

## What to build

Un verificador sube un archivo desde la página de un certificado y recibe el resultado de comparar sus bytes con la huella registrada por C. Reutilizar la dependencia de verificación establecida en 04 y delegar el cálculo/comparación al caso de uso de C. No guardar el archivo, extraer su identificador ni crear una segunda lógica de registro en B.

## Acceptance criteria

- [x] POST /api/verify/{cert_id}/file acepta multipart con archivo sin exigir autenticación y devuelve 200 con result VALID, ALTERED o NOT_FOUND según la comparación contra el registro.
- [x] El identificador proviene de la ruta; la comparación utiliza el registro, no el hash de la copia local como autoridad alternativa.
- [x] Se aceptan hasta 5.242.880 bytes; un byte más produce 400 VALIDATION_ERROR con el sobre común y lectura acotada del archivo.
- [x] UUID inválido o archivo obligatorio ausente produce 400; dependencia indisponible produce 503 UNAVAILABLE, sin devolver ALTERED ni NOT_FOUND por ese fallo.
- [x] No se guarda la subida ni se decide autenticidad por nombre, extensión o MIME declarado.
- [x] Pruebas HTTP cubren coincidencia, diferencia, id no registrado, indisponibilidad, límites exactos y excedidos y acceso anónimo, sustituyendo solo la dependencia de C.
- [x] Contrato y OpenAPI reflejan los resultados y errores y eliminan el 501 de esta ruta. La integración real, incluida alteración de la nota, se valida en 07.

## Blocked by

- [04: Consultar la verificación pública por identificador](04-verificacion-publica.md)


