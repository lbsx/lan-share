# Lan Share

![Lan Chat Interface](assets/screenshot.png)

A simple and efficient web-based tool for file sharing and chatting within a Local Area Network (LAN).

## Features
- **Real-time Chat**: Chat with other users on the same network.
- **File Transfer**: Easily upload and download files.
- **Auto-Discovery**: Device type detection (Android, iOS, PC).
- **No Installation**: Client runs in the browser.

## Tech Stack

### Backend
- **Language:** Python
- **Web Framework:** Litestar
- **ASGI Server:** Uvicorn
- **Templating:** Jinja2
- **Logging:** Loguru

### Frontend
- **Core:** HTML5, CSS3, JavaScript (Vanilla)
- **Real-time Communication:** Server-Sent Events (SSE)

## Usage
1. Run the server: `python server.py`
2. Open the displayed URL (e.g., `http://192.168.1.X:5001`) on other devices.
