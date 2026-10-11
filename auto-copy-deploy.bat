@echo off
echo ================================================
echo  Sick Of It - Copy Deployment Files to EC2
echo ================================================

echo Copying deployment files to EC2 server...
echo Server: ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com
echo.

echo Creating directory on server...
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "mkdir -p ~/sickofitgame"

echo Copying .env file (if exists)...
if exist .env (
    scp -i sickofitgame-server.pem .env ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com:~/sickofitgame/
    echo .env file copied successfully!
) else (
    echo WARNING: .env file not found! Using default values from docker-compose.deploy.yml
    echo Create .env file from .env.example for production deployment
)

echo Copying deployment compose file...
scp -i sickofitgame-server.pem docker-compose.deploy.yml ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com:~/sickofitgame/

echo.
echo Deployment file copied successfully!
echo.
echo Files on server:
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && ls -la"

echo.
pause
