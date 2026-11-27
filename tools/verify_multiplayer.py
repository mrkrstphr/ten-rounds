"""Exercise two browser players against the running full-stack app."""
import argparse
import json
import time
from browser_check import CDP


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:3000")
    args = parser.parse_args()
    cdp = CDP()
    cdp.sock.settimeout(150)
    cdp.call("Runtime.enable")
    cdp.call("Page.enable")
    cdp.call("Network.setCacheDisabled", {"cacheDisabled": False})
    previous_url = cdp.evaluate("location.href", None)
    failed = False
    try:
        for scheme in ("light", "dark"):
            cdp.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": scheme}]})
            url = args.url.rstrip("/") + "/multiplayer-tests.html"
            cdp.call("Page.navigate", {"url": url})
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                report = cdp.evaluate("""location.pathname.endsWith('/multiplayer-tests.html') &&
                    window.multiplayerTestsDone ? {
                      passed: multiplayerTestResults.filter(r => r.pass).length,
                      failed: multiplayerTestResults.filter(r => !r.pass)
                    } : null""", None)
                if report is not None:
                    break
                time.sleep(.1)
            else:
                raise TimeoutError("Multiplayer UI suite timed out: " + json.dumps(
                    cdp.evaluate("({test:window.multiplayerCurrentTest, step:window.multiplayerStep, output:document.getElementById('output')?.textContent})", None)))
            print(json.dumps({"scheme": scheme, **report}), flush=True)
            failed |= bool(report["failed"])
    finally:
        cdp.call("Emulation.setEmulatedMedia", {"features": []})
        cdp.call("Page.navigate", {"url": previous_url})
        cdp.sock.close()
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
