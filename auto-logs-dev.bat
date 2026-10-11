@echo off
echo ================================================
echo  Sick Of It - Development Logs
echo ================================================
echo Following logs for local development environment...
echo Press Ctrl+C to stop following logs...
echo.

docker-compose -f docker-compose.dev.yml logs -f
