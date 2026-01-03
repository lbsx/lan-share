#!/usr/bin/env python3
import os
import asyncio
import json
import uuid
import tempfile
from dataclasses import dataclass
from typing import List, Dict, Any, AsyncGenerator
from loguru import logger
from datetime import datetime
from pathlib import Path

from litestar import Litestar, get, post
from litestar.contrib.jinja import JinjaTemplateEngine
from litestar.response import Template, ServerSentEvent, File
from litestar.static_files import StaticFilesConfig
from litestar.template.config import TemplateConfig
from litestar.datastructures import UploadFile
from litestar.enums import RequestEncodingType
from litestar.params import Body

from utils import get_host_ip, show_qrcode, size_convert

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
DOWNLOAD_DIR = os.path.expanduser("~/Downloads")
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Connection Manager (SSE)
class BroadcastManager:
    def __init__(self):
        self.connections: List[Dict[str, Any]] = []
        self.history: List[Dict[str, Any]] = []

    def _get_unique_name(self, base_name: str) -> str:
        existing_names = {c['name'] for c in self.connections}
        if base_name not in existing_names:
            return base_name

        counter = 1
        while True:
            new_name = f"{base_name}-{counter}"
            if new_name not in existing_names:
                return new_name
            counter += 1

    async def broadcast_user_count(self):
        count = len(self.connections)
        message = {'type': 'user_count', 'count': count}
        for conn in self.connections:
            await conn['queue'].put(message)

    async def subscribe(self, name: str = "Unknown") -> AsyncGenerator[Dict[str, Any], None]:
        queue = asyncio.Queue()
        unique_name = self._get_unique_name(name)

        connection_info = {'queue': queue, 'name': unique_name}
        self.connections.append(connection_info)

        # Notify count update
        await self.broadcast_user_count()

        # Send welcome message with assigned name
        yield {'data': json.dumps({'type': 'welcome', 'assigned_name': unique_name})}

        # Send history upon connection
        if self.history:
            # Yield history as a single event containing the list
            yield {'data': json.dumps({'type': 'history', 'messages': self.history})}

        try:
            while True:
                message = await queue.get()
                yield {'data': json.dumps(message)}
        finally:
            if connection_info in self.connections:
                self.connections.remove(connection_info)
                await self.broadcast_user_count()

    async def publish(self, message: Dict[str, Any]):
        # Save to history
        self.history.append(message)
        if len(self.history) > 100:
            self.history.pop(0)

        for conn in self.connections:
            await conn['queue'].put(message)

manager = BroadcastManager()

# Routes
@get("/")
async def index() -> Template:
    return Template(template_name="index.html")

@get("/chat")
async def chat_page() -> Template:
    return Template(template_name="chat.html")

@get("/stream")
async def sse_handler(name: str = "Guest") -> ServerSentEvent:
    return ServerSentEvent(manager.subscribe(name))

@post("/send")
async def send_message(data: Dict[str, Any]) -> Dict[str, str]:
    # data: {'content': '...', 'sender_id': '...', 'sender_name': '...'}
    await manager.publish({
        'type': 'text',
        'content': data.get('content'),
        'sender_id': data.get('sender_id'),
        'sender_name': data.get('sender_name'),
        'timestamp': datetime.now().strftime("%H:%M:%S")
    })
    return {'status': 'ok'}

@dataclass
class UploadForm:
    files: List[UploadFile]
    socket_id: str
    sender_name: str

@post("/upload")
async def upload_file(data: UploadForm = Body(media_type=RequestEncodingType.MULTI_PART)) -> Dict[str, Any]:
    uploaded_files = []

    # Create a unique directory for this upload batch
    unique_subfolder = str(uuid.uuid4())
    subfolder_path = os.path.join(UPLOAD_FOLDER, unique_subfolder)
    os.makedirs(subfolder_path, exist_ok=True)

    for file in data.files:
        filename = file.filename

        # Save file to the unique subfolder
        save_path = os.path.join(subfolder_path, filename)

        with open(save_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024 * 64) # Read in 64MB chunks
                if not chunk:
                    break
                f.write(chunk)

        logger.info(f"File saved to: {save_path}")
        uploaded_files.append(filename)

        # Broadcast via SSE
        await manager.publish({
            'type': 'file',
            'filename': filename,
            'url': f'/files/{unique_subfolder}/{filename}',
            'sender_id': data.socket_id,
            'sender_name': data.sender_name,
            'timestamp': datetime.now().strftime("%H:%M:%S")
        })

    return {'message': 'Upload successful', 'files': uploaded_files}

@get("/files/{file_path:path}")
async def download_file(file_path: str) -> File:
    # Ensure file_path is relative
    clean_path = file_path.lstrip('/')
    return File(
        path=os.path.join(UPLOAD_FOLDER, clean_path),
        filename=os.path.basename(clean_path),
        content_disposition_type="attachment",
        media_type="application/octet-stream"
    )

@get("/browse")
async def browse_files() -> Template:
    files = []
    if os.path.exists(DOWNLOAD_DIR):
        for f in os.listdir(DOWNLOAD_DIR):
            full_path = os.path.join(DOWNLOAD_DIR, f)
            if os.path.isfile(full_path) and not f.startswith('.'):
                size = os.path.getsize(full_path)
                _, ext = os.path.splitext(f)

                if ext:
                    # Remove dot, upper case, take first 4 chars
                    ext_display = ext[1:].upper()[:4]
                else:
                    ext_display = "?"

                files.append({
                    'name': f,
                    'size': size_convert(size),
                    'raw_size': size,
                    'ext': ext_display,
                    'url': f'/user_downloads/{f}'
                })
    return Template(template_name="download.html", context={"files": files})

@get("/user_downloads/{filename:str}")
async def user_download_file(filename: str) -> File:
    return File(
        path=os.path.join(DOWNLOAD_DIR, filename),
        filename=filename,
        content_disposition_type="attachment",
        media_type="application/octet-stream"
    )

@get("/favicon.ico")
async def favicon() -> File:
    return File(path=f"{STATIC_DIR}/favicon.ico")

# App Init
app = Litestar(
    route_handlers=[index, chat_page, sse_handler, send_message, upload_file, download_file, browse_files, user_download_file, favicon],
    template_config=TemplateConfig(
        directory=STATIC_DIR,
        engine=JinjaTemplateEngine,
    ),
    static_files_config=[
        StaticFilesConfig(directories=[STATIC_DIR], path="/static", name="static"),
    ],
    request_max_body_size=20 * 1024 * 1024 * 1024, # 20GB Limit
    debug=True
)

if __name__ == "__main__":
    import uvicorn
    local_ip = get_host_ip()
    port = 5001
    logger.info(f"Server starting at http://{local_ip}:{port}")
    logger.info(f"Chat available at http://{local_ip}:{port}/chat")
    show_qrcode(f"http://{local_ip}:{port}/")
    uvicorn.run(app, host="0.0.0.0", port=port)
