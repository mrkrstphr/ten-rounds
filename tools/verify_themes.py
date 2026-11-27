"""Run engine and UI/contrast suites in both browser themes and reduced motion.

Tests the running full-stack application supplied by --url.
The original saved game and native browser preference are restored afterward.
"""
import json
import argparse
import time
import urllib.request
from uuid import uuid4

from browser_check import CDP


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:3000", help="Test a running development or production app")
    args = parser.parse_args()
    url = args.url.rstrip("/")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url + "/ui-tests.html", timeout=5) as response:
        assert response.status == 200
    cdp = CDP()
    cdp.sock.settimeout(150)
    cdp.call("Runtime.enable")
    cdp.call("Page.enable")
    cdp.call("Network.setCacheDisabled", {"cacheDisabled": False})
    previous_url = cdp.evaluate("location.href", None)

    def preference(scheme=None, motion=None):
        features = [{"name": "prefers-color-scheme", "value": scheme}] if scheme else []
        if motion:
            features.append({"name": "prefers-reduced-motion", "value": motion})
        cdp.call("Emulation.setEmulatedMedia", {"features": features})

    def navigate(path):
        target = url + path + "?qa=" + uuid4().hex
        result = cdp.call("Page.navigate", {"url": target})
        if result.get("errorText"):
            raise RuntimeError(result["errorText"])
        ready = {
            "/tests.html": "window.testResults",
            "/ui-tests.html": "window.uiCurrentTest",
            "/index.html": "document.querySelector('#human-hand .card')",
        }[path]
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if cdp.evaluate(f"location.href === {json.dumps(target)} && !!({ready})", None):
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
            deadline = time.monotonic() + 600
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
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
