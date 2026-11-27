"""Run engine and UI/contrast suites in both browser themes and reduced motion.

The local server exists only for this check, on an ephemeral loopback port.
The original saved game and native browser preference are restored afterward.
"""
import json
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
import urllib.request

from browser_check import CDP


ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="Test an existing Vite dev or preview server instead of dist")
    args = parser.parse_args()
    server = None
    if args.url:
        url = args.url.rstrip("/")
    else:
        if not (ROOT / "dist" / "index.html").exists():
            raise SystemExit("Build first with npm run build, or pass --url http://127.0.0.1:3000")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT / "dist")))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url + "/ui-tests.html", timeout=5) as response:
        assert response.status == 200
    cdp = CDP()
    cdp.sock.settimeout(150)
    cdp.call("Runtime.enable")
    cdp.call("Page.enable")
    previous_url = cdp.evaluate("location.href", None)

    def preference(scheme=None, motion=None):
        features = [{"name": "prefers-color-scheme", "value": scheme}] if scheme else []
        if motion:
            features.append({"name": "prefers-reduced-motion", "value": motion})
        cdp.call("Emulation.setEmulatedMedia", {"features": features})

    def navigate(path):
        target = url + path
        result = cdp.call("Page.navigate", {"url": target})
        if result.get("errorText"):
            raise RuntimeError(result["errorText"])
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if cdp.evaluate(f"location.href === {json.dumps(target)} && document.readyState === 'complete' && ({json.dumps(path)} !== '/index.html' || !!document.querySelector('#human-hand .card'))", None):
                return
            time.sleep(.05)
        raise TimeoutError("Game page did not load")

    failed = False
    try:
        navigate("/tests.html")
        report = cdp.evaluate("""({
          passed:window.testResults.filter(r=>r.pass).length,
          failed:window.testResults.filter(r=>!r.pass),
          matches:window.matchSummaries
        })""", None)
        print(json.dumps({"suite": "engine", **report}), flush=True)
        failed |= bool(report["failed"])
        for scheme, motion in (("light", "no-preference"), ("dark", "no-preference"), ("dark", "reduce")):
            preference(scheme, motion)
            navigate("/ui-tests.html")
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                report = cdp.evaluate("""window.uiTestsDone ? ({
                  title:document.title,
                  failed:window.uiTestResults.filter(r=>!r.pass),
                  passed:window.uiTestResults.filter(r=>r.pass).length,
                  contrastChecks:window.contrastReports.reduce((n,r)=>n+r.checked,0),
                  minimumContrast:Math.min(...window.contrastReports.map(r=>r.minimum)),
                  worst:window.contrastReports.flatMap(r=>r.worst).sort((a,b)=>a.contrast-b.contrast).slice(0,3)
                }) : null""", None)
                if report is not None:
                    break
                time.sleep(.1)
            else:
                diagnostics = cdp.evaluate("""({
                current:window.uiCurrentTest,step:window.uiTestStep,
                frame:document.getElementById('game')?.contentDocument?.readyState,
                fonts:document.getElementById('game')?.contentDocument?.fonts.status,
                renderedCards:document.getElementById('game')?.contentDocument?.querySelectorAll('#human-hand .card').length,
                visibility:document.visibilityState,
                output:document.getElementById('output').textContent
                })""", None)
                raise TimeoutError("UI suite timed out: " + json.dumps(diagnostics))
            print(json.dumps({"scheme": scheme, "motion": motion, **report}), flush=True)
            failed |= bool(report["failed"])
        preference("light")
        navigate("/index.html")
        original = cdp.evaluate("localStorage.getItem('tenrounds.table.v1')", None)
        try:
            cdp.evaluate("""(()=>{
              const state=TenRoundsGame.newGame();state.turn=0;
              localStorage.setItem('tenrounds.table.v1',JSON.stringify({state,sort:'number',sound:false}));
            })()""", None)
            navigate("/index.html")
            before = cdp.evaluate("""(async()=>{
              document.getElementById('draw-pile').click();
              await new Promise(resolve=>setTimeout(resolve,0));
              document.querySelector('#human-hand .card').click();
              await new Promise(resolve=>setTimeout(resolve,0));
              return {
                state:localStorage.getItem('tenrounds.table.v1'),
                selection:document.querySelector('#human-hand .selected').dataset.id,
                background:getComputedStyle(document.body).backgroundColor
              };
            })()""", None)
            for scheme, background in (("dark", "rgb(19, 27, 23)"), ("light", "rgb(246, 245, 240)")):
                preference(scheme)
                after = cdp.evaluate("""({
                  state:localStorage.getItem('tenrounds.table.v1'),
                  selection:document.querySelector('#human-hand .selected')?.dataset.id,
                  background:getComputedStyle(document.body).backgroundColor,
                  dark:matchMedia('(prefers-color-scheme: dark)').matches
                })""", None)
                assert after["state"] == before["state"], "Theme switch changed game state"
                assert after["selection"] == before["selection"], "Theme switch cleared selection"
                assert after["background"] == background, "Theme did not switch live"
                assert after["dark"] == (scheme == "dark")
            print("PASS: Browser preference switches light/dark live without reloading, losing selection, or changing the saved game.", flush=True)
        finally:
            if original is None:
                cdp.evaluate("localStorage.removeItem('tenrounds.table.v1')", None)
            else:
                cdp.evaluate(f"localStorage.setItem('tenrounds.table.v1', {json.dumps(original)})", None)
    finally:
        preference()
        cdp.call("Page.navigate", {"url": previous_url})
        cdp.sock.close()
        if server:
            server.shutdown()
            server.server_close()
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
