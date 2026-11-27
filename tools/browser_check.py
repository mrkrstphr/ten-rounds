"""Tiny dependency-free CDP helper for repeatable browser regression checks.

Uses the session-provided desktop websocket directly, never CDP discovery.
The desktop proxy routes page commands to this session's own browser pane.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import socket
import struct
import time
from urllib.parse import urlsplit


class CDP:
    def __init__(self):
        url = urlsplit(os.environ["AGENT_BROWSER_CDP"])
        self.sock = socket.create_connection((url.hostname, url.port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        path = url.path + ("?" + url.query if url.query else "")
        request = (f"GET {path} HTTP/1.1\r\nHost: {url.hostname}:{url.port}\r\n"
                   f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
                   f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(request.encode())
        self.buffer = b""
        while b"\r\n\r\n" not in self.buffer:
            self.buffer += self.sock.recv(4096)
        header, self.buffer = self.buffer.split(b"\r\n\r\n", 1)
        if b" 101 " not in header.split(b"\r\n")[0]:
            raise RuntimeError(header.decode(errors="replace"))
        expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        if expected.lower() not in header.lower():
            raise RuntimeError("Invalid websocket handshake")
        self.serial = 0
        self.events = []

    def exact(self, count):
        while len(self.buffer) < count:
            chunk = self.sock.recv(max(4096, count - len(self.buffer)))
            if not chunk:
                raise EOFError("Desktop browser disconnected")
            self.buffer += chunk
        result, self.buffer = self.buffer[:count], self.buffer[count:]
        return result

    def send_frame(self, payload, opcode=1):
        mask = os.urandom(4)
        size = len(payload)
        header = bytes([0x80 | opcode])
        header += bytes([0x80 | size]) if size < 126 else (
            bytes([0xFE]) + struct.pack("!H", size) if size < 65536 else bytes([0xFF]) + struct.pack("!Q", size))
        self.sock.sendall(header + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(payload)))

    def receive(self):
        fragments = b""
        while True:
            first, second = self.exact(2)
            length = second & 127
            if length == 126:
                length = struct.unpack("!H", self.exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self.exact(8))[0]
            mask = self.exact(4) if second & 128 else None
            payload = self.exact(length)
            if mask:
                payload = bytes(v ^ mask[i % 4] for i, v in enumerate(payload))
            opcode = first & 15
            if opcode == 9:
                self.send_frame(payload, 10)
                continue
            if opcode == 8:
                raise EOFError("Websocket closed")
            if opcode in (0, 1):
                fragments += payload
                if first & 0x80:
                    return json.loads(fragments)

    def call(self, method, params=None, session=None):
        self.serial += 1
        msg = {"id": self.serial, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        self.send_frame(json.dumps(msg).encode())
        while True:
            reply = self.receive()
            if reply.get("id") == self.serial:
                if "error" in reply:
                    raise RuntimeError(json.dumps(reply["error"]))
                return reply.get("result", {})
            if reply.get("method") in ("Runtime.exceptionThrown", "Log.entryAdded"):
                self.events.append(reply)

    def evaluate(self, expression, session):
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True}, session)
        if "exceptionDetails" in result:
            raise RuntimeError(json.dumps(result["exceptionDetails"]))
        return result.get("result", {}).get("value")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url")
    parser.add_argument("--eval", dest="expression")
    parser.add_argument("--eval-file")
    parser.add_argument("--screenshot")
    parser.add_argument("--scheme", choices=["light", "dark", "system"])
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=1000)
    args = parser.parse_args()
    cdp = CDP()
    sid = None
    cdp.call("Runtime.enable", session=sid)
    cdp.call("Page.enable", session=sid)
    if args.scheme:
        features = [] if args.scheme == "system" else [{"name": "prefers-color-scheme", "value": args.scheme}]
        cdp.call("Emulation.setEmulatedMedia", {"features": features}, sid)
    try:
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": args.width, "height": args.height, "deviceScaleFactor": 1, "mobile": args.width < 681}, sid)
    except RuntimeError as error:
        if "unsupported_method" not in str(error):
            raise
    if args.url:
        cdp.call("Page.navigate", {"url": args.url}, sid)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            ready = cdp.evaluate("document.readyState === 'complete'", sid)
            if ready:
                break
            time.sleep(.05)
    expression = Path(args.eval_file).read_text(encoding="utf-8") if args.eval_file else args.expression
    if expression:
        print(json.dumps(cdp.evaluate(expression, sid), ensure_ascii=True))
    if args.screenshot:
        result = cdp.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False}, sid)
        Path(args.screenshot).write_bytes(base64.b64decode(result["data"]))
        print("Screenshot:", args.screenshot)
    if cdp.events:
        print("BROWSER EVENTS:", json.dumps(cdp.events)[:10000])
    cdp.sock.close()


if __name__ == "__main__":
    main()
