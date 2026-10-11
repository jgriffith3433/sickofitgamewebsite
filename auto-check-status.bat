@echo off
echo ================================================
echo  Sick Of It - Check Deployment Status
echo ================================================

echo Checking production server...
echo Server: ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com
echo.

echo Docker containers status:
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "docker ps"

echo.
echo Container logs (last 50 lines):
echo ------------------------------------------------
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "docker logs --tail 50 sickofitgame"

echo.
echo ================================================
echo.
pause
