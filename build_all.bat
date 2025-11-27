@echo off
chcp 65001 > nul
echo ==========================================
echo Запуск полного процесса сборки
echo ==========================================

echo.
echo [1/4] Установка зависимостей (npm install)...
call npm install
if %errorlevel% neq 0 goto error

echo.
echo [2/4] Пересборка нативных модулей (npm run rebuild)...
call npm run rebuild
if %errorlevel% neq 0 goto error

echo.
echo [3/4] Сборка ресурсов JS и CSS (npm run build)...
call npm run build
if %errorlevel% neq 0 goto error

echo.
echo [4/4] Упаковка приложения (npm run dist)...
echo Примечание: Это также попытается опубликовать релиз согласно настройкам package.json.
call npm run dist
if %errorlevel% neq 0 goto error

echo.
echo ==========================================
echo Сборка успешно завершена!
echo ==========================================
pause
exit /b 0

:error
echo.
echo ==========================================
echo ОШИБКА СБОРКИ! Код ошибки: %errorlevel%
echo ==========================================
pause
exit /b %errorlevel%
