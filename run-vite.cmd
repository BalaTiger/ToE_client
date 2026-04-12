@echo off
setlocal
cd /d D:\MyGitRepo\BalaTiger.github.io
"C:\Program Files\nodejs\node.exe" "D:\MyGitRepo\BalaTiger.github.io\node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 4173 --strictPort 1>"D:\MyGitRepo\BalaTiger.github.io\vite.log" 2>"D:\MyGitRepo\BalaTiger.github.io\vite.err"
