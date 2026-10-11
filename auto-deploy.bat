@echo off
echo ================================================
echo  Sick Of It - Quick Deploy (Pull and Restart)
echo ================================================

echo Deploying to production server...
echo Server: ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com
echo.

echo Pulling latest image and restarting...
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml down && docker compose -f docker-compose.deploy.yml up -d"

if %errorlevel% equ 0 (
    echo.
    echo ✓ Deployment successful!
    echo.
    echo Your game is live at: http://ec2-13-220-32-55.compute-1.amazonaws.com
) else (
    echo.
    echo ✗ Deployment failed. Check the error above.
    echo.
)
pause
