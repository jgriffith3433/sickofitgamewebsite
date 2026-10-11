@echo off
echo ================================================
echo  Sick Of It - Development Environment
echo ================================================

echo Cleaning up any existing containers...
docker rm -f sickofitgame-dev 2>nul

echo Building development environment...
docker compose -f docker-compose.dev.yml build --no-cache

echo Starting development environment...
docker compose -f docker-compose.dev.yml up -d

echo.
echo Development environment is starting...
echo Game: http://localhost
echo Health check: http://localhost/health
echo.

echo Showing logs (press Ctrl+C to exit)...
docker compose -f docker-compose.dev.yml logs -f
