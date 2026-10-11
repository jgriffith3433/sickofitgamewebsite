@echo off
echo ================================================
echo  Sick Of It - Production Build, Push and Deploy
echo ================================================

echo Step 1: Building production image...
docker compose -f docker-compose.prod.yml build --no-cache

echo Step 2: Pushing image to Docker Hub...
echo Image: jgriffith3433/sickofitgame:latest
docker compose -f docker-compose.prod.yml push

echo Step 3: Copying deployment files to server...
call auto-copy-deploy.bat

echo Step 4: Deploying to EC2 server...
echo Server: ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com
echo.

echo Pulling latest image and restarting service...
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml down && docker compose -f docker-compose.deploy.yml up -d"

echo.
echo Step 5: Cleaning up sensitive files on server...
echo Removing .env file from server for security...
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && rm -f .env && echo '.env removed from server'"

echo.
echo ================================================
echo  Deployment completed successfully!
echo ================================================
echo Your game should be available at: http://ec2-13-220-32-55.compute-1.amazonaws.com
echo.
echo To SSH into server: auto-ssh.bat
echo To check deployment: ssh and run 'docker ps'
echo.
pause
