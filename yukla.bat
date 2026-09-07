@echo off
echo ==========================================
echo    GitHub ga kodlarni avtomatik yuklash
echo ==========================================
echo.

git add .
git commit -m "Kodlar yangilandi"
git branch -M main
git push -u origin main --force

echo.
echo ==========================================
echo   Barcha yangiliklar GitHubga yuborildi!
echo   Render hozir avtomatik yangilanadi.
echo ==========================================
pause
