@echo off
echo Starting 65536 Reverse 2048 local server...
start http://localhost:8080
python -m http.server 8080
