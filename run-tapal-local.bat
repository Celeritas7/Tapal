@echo off
title Parcel labels local server
REM Put this .bat in your Tapal folder (next to index.html)
REM and double-click it. Leave this window open while using the app.
REM Supabase sign-in (Google + email link) only works over http://localhost,
REM not by opening index.html directly as a file.
cd /d "%~dp0"

set "ROOT=."
if not exist "%ROOT%\index.html" (
  echo Could not find index.html here.
  echo Put this .bat in the same folder as the parcel app's index.html.
  echo Current folder: %CD%
  pause & goto :eof
)

REM --- Find a Python: PATH first, then common Anaconda/Miniconda locations ---
REM (double-clicking uses plain cmd, where conda's PATH is usually NOT active,
REM  so we look for python.exe directly.)
set "PY="
for %%P in (
  "python.exe"
  "%USERPROFILE%\anaconda3\python.exe"
  "%USERPROFILE%\miniconda3\python.exe"
  "%USERPROFILE%\AppData\Local\anaconda3\python.exe"
  "%USERPROFILE%\AppData\Local\miniconda3\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  "C:\ProgramData\anaconda3\python.exe"
  "C:\ProgramData\miniconda3\python.exe"
) do (
  if not defined PY (
    "%%~P" -c "import sys" >nul 2>nul && set "PY=%%~P"
  )
)

if not defined PY (
  echo.
  echo Could not find Python automatically.
  echo Open "Anaconda Prompt", cd to this folder, and run:
  echo     python -m http.server 5111 --directory "%ROOT%"
  echo.
  pause & goto :eof
)

echo.
echo   Parcel labels - local server
echo   Python:  %PY%
echo   Serving: %ROOT%    Open: http://localhost:5111/
echo   Sign in with Google or the email link, then print labels.
echo   Add http://localhost:5111 to Supabase Auth redirect URLs
echo   the first time, or sign-in will bounce back with an error.
echo   (Close this window to stop.)
echo.

start "" "http://localhost:5111/"
"%PY%" -m http.server 5111 --directory "%ROOT%"

echo.
echo Server stopped.
pause
