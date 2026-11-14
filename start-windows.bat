@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 无限记开发原型：启动后使用浏览器打开 http://127.0.0.1:8787
py -3 server\app.py
pause
