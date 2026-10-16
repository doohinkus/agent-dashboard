from fastapi.testclient import TestClient

import app as dashboard

client = TestClient(dashboard.app)


def clear_buffer() -> None:
    dashboard.events.clear()


def test_normalize_opencode_shape():
    record = dashboard._normalize(
        {"platform": "opencode", "event": "PreToolUse", "tool": "bash", "args": {"cmd": "ls"}},
        {},
    )
    assert record["platform"] == "opencode"
    assert record["event"] == "PreToolUse"
    assert record["tool"] == "bash"
    assert record["args"] == str({"cmd": "ls"})
    assert record["timestamp"].endswith("Z")


def test_normalize_claude_code_fallbacks():
    record = dashboard._normalize(
        {"hook_event_name": "PostToolUse", "tool_name": "Edit", "tool_input": {"file": "x.py"}},
        {},
    )
    assert record["event"] == "PostToolUse"
    assert record["tool"] == "Edit"
    assert record["args"] == str({"file": "x.py"})


def test_normalize_platform_from_header():
    headers = {"x-platform": "codex"}
    record = dashboard._normalize({"tool": "read"}, headers)
    assert record["platform"] == "codex"


def test_normalize_empty_body_defaults():
    record = dashboard._normalize({}, {})
    assert record["platform"] == "unknown"
    assert record["event"] == "Unknown"
    assert record["tool"] == ""
    assert record["args"] == ""


def test_truncate():
    assert dashboard._truncate(None, 3) == ""
    assert dashboard._truncate("abc", 5) == "abc"
    assert dashboard._truncate("abcdef", 5) == "abcd…"


def test_post_event_returns_empty_body():
    clear_buffer()
    resp = client.post("/event", json={"platform": "pi", "event": "Stop"})
    assert resp.status_code == 200
    assert resp.json() == {}
    assert dashboard.events[0]["platform"] == "pi"


def test_post_event_malformed_json_does_not_500():
    clear_buffer()
    resp = client.post("/event", content=b"not json", headers={"Content-Type": "application/json"})
    assert resp.status_code == 200
    assert len(dashboard.events) == 1
    assert dashboard.events[0]["platform"] == "unknown"


def test_health_counts_events():
    clear_buffer()
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "events": 0}
    client.post("/event", json={"tool": "read"})
    assert client.get("/health").json()["events"] == 1


def test_buffer_respects_max_events():
    clear_buffer()
    for i in range(dashboard.MAX_EVENTS + 10):
        client.post("/event", json={"args": i})
    assert len(dashboard.events) == dashboard.MAX_EVENTS
    assert dashboard.events[0]["args"] == str(dashboard.MAX_EVENTS + 9)
