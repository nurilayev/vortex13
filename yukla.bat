@echo off
echo ==========================================
echo 🚀 GitHub'ga kodlarni avtomatik yuklash
echo ==========================================
echo.

git add .
git commit -m "Kodlar yangilandi"
git branch -M main
git push origin main

echo.
echo ==========================================
echo ✅ Barcha yangiliklar GitHubga yuborildi!
echo Render hozir avtomatik ravishda yangilanadi.
echo ==========================================
pause
