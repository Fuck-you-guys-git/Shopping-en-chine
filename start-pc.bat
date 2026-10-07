@echo off
setlocal
title Shopping en Chine - demarrage
cd /d "%~dp0"

echo.
echo  === Shopping en Chine : demarrage sur ce PC ===
echo.

echo [1/4] Verification des outils...
where python >nul 2>nul
if errorlevel 1 (
    echo   Python introuvable. Installez Python 3.11+ : https://www.python.org/downloads/
    echo   ^(cochez "Add python.exe to PATH" pendant l'installation^)
    pause
    exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
    echo   Node.js introuvable. Installez Node.js LTS : https://nodejs.org/
    pause
    exit /b 1
)
where yarn >nul 2>nul
if errorlevel 1 (
    echo   Installation de yarn...
    call npm install -g yarn
)

echo [2/4] Backend (FastAPI)...
if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul
if not exist "backend\venv" python -m venv "backend\venv"
call "backend\venv\Scripts\python.exe" -m pip install -q -r "backend\requirements.txt"
if errorlevel 1 (
    echo   Echec de l'installation des dependances Python.
    pause
    exit /b 1
)

echo [3/4] Frontend (React)...
if not exist "frontend\.env" copy "frontend\.env.example" "frontend\.env" >nul
if not exist "frontend\node_modules" (
    pushd frontend
    call yarn install
    if errorlevel 1 (
        popd
        echo   Echec de l'installation des dependances JavaScript.
        pause
        exit /b 1
    )
    popd
)

echo [4/4] Lancement...
start "Shopping en Chine - Backend (port 8001)" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe -m uvicorn server:app --reload --port 8001"
start "Shopping en Chine - Frontend (port 3000)" /D "%~dp0frontend" cmd /k "yarn start"

echo.
echo  Deux fenetres se sont ouvertes : le backend (port 8001) et le frontend (port 3000).
echo  Le site s'ouvrira dans votre navigateur sur http://localhost:3000 a la fin de la compilation.
echo  MongoDB doit etre demarre (service Windows "MongoDB") pour que les commandes s'enregistrent.
echo.
pause
