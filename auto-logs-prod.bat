@echo off
echo ================================================
echo  Sick Of It - Production Logs
echo ================================================
echo Connecting to production server...
echo Server: ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com
echo.
echo Following logs...
echo Press Ctrl+C to stop following logs...
echo.

ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && docker compose -f docker-compose.deploy.yml logs -f"
