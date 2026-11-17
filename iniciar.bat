@echo off
rem Uso: iniciar.bat [front | todo | parar]
rem   front (por defecto)  solo la interfaz con API simulada, sin Docker
rem   todo                 backend real en Docker + interfaz contra ese backend
rem   parar                apaga el backend de Docker (conserva los datos)
setlocal
cd /d "%~dp0"

set MODO=%1
if "%MODO%"=="" set MODO=front

if /i "%MODO%"=="front" goto front
if /i "%MODO%"=="todo" goto todo
if /i "%MODO%"=="parar" goto parar
echo Uso: iniciar.bat [front ^| todo ^| parar]
exit /b 1

:todo
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker no esta corriendo. Abri Docker Desktop y volve a intentar.
  exit /b 1
)
docker compose up -d --build
if errorlevel 1 exit /b 1
echo.
echo Backend levantado: API en http://localhost:8080/api  ^|  RabbitMQ en http://localhost:15672
echo La primera vez la API puede tardar unos segundos en responder.
set VITE_API=http

:front
cd frontend
if not exist node_modules call npm i
if errorlevel 1 exit /b 1
echo.
echo Interfaz en http://localhost:5173  (usuarios: operador@demo.test / alumno01@demo.test, clave demo1234)
call npm run dev
exit /b %errorlevel%

:parar
docker compose down
exit /b %errorlevel%
