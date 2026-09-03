Created At: 2026-07-13T23:46:00Z
Completed At: 2026-07-13T23:46:00Z
#!/usr/bin/env python3
"""
Agent Manager - CLI for managing employee agents in tmux sessions.

A simple alternative to CAO using only tmux + Python.
Sessions are named: agent-{agent_id} where agent_id is file_id in lowercase (e.g., emp-0001)
"""

from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Add scripts directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from agent_config import (
    resolve_agent,
    list_all_agents,
    load_skills,
    build_system_prompt,
    expand_env_vars,
    get_launcher_command,
    get_agent_schedule,
    get_schedule_task,
    parse_duration,
)

from repo_root import get_repo_root
from tmux_helper import (
    check_tmux,
    list_sessions,
    session_exists,
    start_session,
    start_session_with_layout,
    stop_session,
    capture_output,
    send_keys,
    get_session_info,
    wait_for_prompt,
    inject_system_prompt,
    wait_for_agent_ready,
    get_agent_runtime_state,
    recover_codex_interrupted,
    stabilize_codex_session,
)

# Import provider system (lives at .agent/skills/agent-manager/providers)
sys.path.insert(0, str(Path(__file__).parent.parent))
from providers import (
    get_system_prompt_mode,
    get_system_prompt_flag,
    get_system_prompt_key,
    get_system_prompt_value_mode,
    get_launcher_config_mode,
    get_launcher_config_flag,
    get_agents_md_mode,
    get_mcp_config_mode,
    get_mcp_config_flag,
    resolve_launcher_command,
    get_provider_key,
    get_session_restore_mode,
    get_session_restore_flag,
    get_context_left_patterns,
)

from cli_parser import create_parser
from command_registry import get_command_handlers
from commands.lifecycle import (
    cmd_start as lifecycle_cmd_start,
    cmd_stop as lifecycle_cmd_stop,
    cmd_monitor as lifecycle_cmd_monitor,
    cmd_send as lifecycle_cmd_send,
    cmd_assign as lifecycle_cmd_assign,
)
from commands.inbound import (
    cmd_inbound as inbound_cmd_inbound,
    drain_main_inbound_once as inbound_drain_main_inbound_once,
)
from commands.dream import cmd_dream as dream_cmd_dream
from services.dream_state import (
    append_dream_audit_event,
    load_dream_state,
    parse_iso8601_utc as dream_parse_iso8601_utc,
    process_heartbeat_for_dream,
    save_dream_state,
)
from services.dream_window import normalize_dream_fixed_windows, resolve_active_dream_window
from services.heartbeat_service import (
    notify_heartbeat_failure as service_notify_heartbeat_failure,
    parse_heartbeat_recovery_policy as service_parse_heartbeat_recovery_policy,
    restart_heartbeat_session_fresh as service_restart_heartbeat_session_fresh,
    run_heartbeat_attempt as service_run_heartbeat_attempt,
)
from services.inbound_queue import (
    append_inbound_reply_closure,
    append_inbound_message_event,
    enqueue_inbound_message,
    has_pending_inbound_messages,
    load_pending_inbound_messages,
    load_replayable_inbound_messages,
    mark_inbound_message_state,
    note_pending_messages_yielded,
    read_inbound_events,
    was_message_yielded,
)
from services.heartbeat_state_machine import (
    RECOVERABLE_FAILURE_TYPES as SERVICE_RECOVERABLE_FAILURE_TYPES,
    classify_heartbeat_ack as service_classify_heartbeat_ack,
    failure_reason_code as service_failure_reason_code,
    should_retry_heartbeat_attempt as service_should_retry_heartbeat_attempt,
)
from commands.status import cmd_status as status_cmd_status
from commands.listing import cmd_list as listing_cmd_list
from commands.doctor import cmd_doctor as doctor_cmd_doctor
from commands.schedule import cmd_schedule as schedule_cmd_schedule
from commands.schedule_run import cmd_schedule_run as schedule_run_cmd_schedule_run
from commands.heartbeat import cmd_heartbeat as heartbeat_cmd_heartbeat
from commands.timer import cmd_timer as timer_cmd_timer


def _normalize_path(path: str) -> str:
    try:
        return str(Path(path).resolve())
    except Exception:
        return os.path.abspath(path)


def _provider_sessions_state_dir(repo_root: Path) -> Path:
    return repo_root / '.claude' / 'state' / 'agent-manager' / 'provider-sessions'


def _load_provider_session_id(repo_root: Path, provider: str, agent_id: str) -> str:
    path = _provider_sessions_state_dir(repo_root) / provider / f"{agent_id}.json"
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        session_id = str(payload.get('session_id') or '').strip()
        return session_id
    except Exception:
        return ""


def _save_provider_session_id(repo_root: Path, provider: str, agent_id: str, *, session_id: str, cwd: str) -> None:
    provider_dir = _provider_sessions_state_dir(repo_root) / provider
    provider_dir.mkdir(parents=True, exist_ok=True)
    path = provider_dir / f"{agent_id}.json"
    payload = {
        'provider': provider,
        'agent_id': agent_id,
        'session_id': session_id,
        'cwd': cwd,
        'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding='utf-8')


def _codex_session_owner_marker(agent_id: str) -> str:
    return f"AGENT_MANAGER_OWNER:{str(agent_id or '').strip().lower()}"


def _inject_codex_session_owner_marker(system_prompt: str, agent_id: str) -> str:
    marker = _codex_session_owner_marker(agent_id)
    text = str(system_prompt or '')
    if marker in text:
        return text
    if text:
        return f"{marker}\n\n{text}"
    return marker


def _should_enforce_codex_session_owner(agent_id: str) -> bool:
    return str(agent_id or '').strip().lower() == 'main'


def _droid_sessions_dir_for_cwd(cwd: str) -> Path:
    normalized = _normalize_path(cwd)
    folder_name = "-" + normalized.lstrip('/').replace('/', '-')
    return Path.home() / '.factory' / 'sessions' / folder_name


def _droid_session_jsonl_path(cwd: str, session_id: str) -> Path:
    return _droid_sessions_dir_for_cwd(cwd) / f"{session_id}.jsonl"


def _droid_session_exists(cwd: str, session_id: str) -> bool:
    if not session_id:
        return False
    try:
        return _droid_session_jsonl_path(cwd, session_id).exists()
    except Exception:
        return False


def _snapshot_droid_sessions(cwd: str) -> set[str]:
    sessions_dir = _droid_sessions_dir_for_cwd(cwd)
    if not sessions_dir.exists() or not sessions_dir.is_dir():
        return set()
    return {str(p) for p in sessions_dir.glob('*.jsonl')}


def _extract_droid_session_id_from_jsonl(jsonl_path: Path) -> str:
    try:
        with jsonl_path.open('r', encoding='utf-8') as f:
            for _ in range(10):
                line = f.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                payload = json.loads(line)
                if payload.get('type') == 'session_start':
                    return str(payload.get('id') or '').strip()
        return ""
    except Exception:
        return ""


def _find_new_droid_session_id(cwd: str, *, before_jsonl_paths: set[str]) -> str:
    sessions_dir = _droid_sessions_dir_for_cwd(cwd)
    if not sessions_dir.exists() or not sessions_dir.is_dir():
        return ""

    candidates = [p for p in sessions_dir.glob('*.jsonl') if str(p) not in before_jsonl_paths]
    if not candidates:
        return ""

    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    return _extract_droid_session_id_from_jsonl(newest)


def _find_new_droid_session_id_with_retry(cwd: str, *, before_jsonl_paths: set[str], timeout_s: float = 2.0) -> str:
    deadline = time.time() + max(0.0, float(timeout_s))
    while True:
        session_id = _find_new_droid_session_id(cwd, before_jsonl_paths=before_jsonl_paths)
        if session_id:
            return session_id
        if time.time() >= deadline:
            return ""
        time.sleep(0.2)


_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _looks_like_uuid(value: str) -> bool:
    return bool(value and _UUID_RE.match(value))


def _claude_projects_dir_for_cwd(cwd: str) -> Path:
    normalized = _normalize_path(cwd)
    folder_name = "-" + normalized.lstrip('/').replace('/', '-')
    return Path.home() / '.claude' / 'projects' / folder_name


def _claude_session_jsonl_path(cwd: str, session_id: str) -> Path:
    return _claude_projects_dir_for_cwd(cwd) / f"{session_id}.jsonl"


def _claude_session_exists(cwd: str, session_id: str) -> bool:
    if not _looks_like_uuid(session_id):
        return False
    try:
        return _claude_session_jsonl_path(cwd, session_id).exists()
    except Exception:
        return False


def _snapshot_claude_sessions(cwd: str) -> set[str]:
    sessions_dir = _claude_projects_dir_for_cwd(cwd)
    if not sessions_dir.exists() or not sessions_dir.is_dir():
        return set()
    return {str(p) for p in sessions_dir.glob('*.jsonl')}


def _extract_claude_session_id_from_jsonl(jsonl_path: Path) -> str:
    try:
        with jsonl_path.open('r', encoding='utf-8') as f:
            for _ in range(10):
                line = f.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                payload = json.loads(line)
                session_id = str(payload.get('sessionId') or payload.get('session_id') or '').strip()
                if _looks_like_uuid(session_id):
                    return session_id
        return ""
    except Exception:
