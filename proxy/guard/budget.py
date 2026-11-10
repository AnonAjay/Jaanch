"""
Jaanch Budget and Rate Limit Guard (proxy/guard/budget.py)
Enforces server-side credit limits and per-session quotas to protect challenge credits.
"""

import threading
from typing import Dict, Any


class BudgetExceededError(Exception):
    """Raised when credit quota or session rate limit is reached."""
    pass


class BudgetGuard:
    def __init__(
        self,
        global_cap: float = 4500.0,
        per_session_cap: int = 40,
        cost_per_request: float = 0.59
    ):
        self.global_cap = global_cap
        self.per_session_cap = per_session_cap
        self.cost_per_request = cost_per_request

        self._lock = threading.Lock()
        self.total_credits_used = 0.0
        self.total_requests = 0
        self.session_counts: Dict[str, int] = {}

    def check_and_charge(self, session_id: str = "default", is_live: bool = True) -> Dict[str, Any]:
        """
        Validates whether request can proceed under budget rules.
        If live call, charges credit cost.
        """
        with self._lock:
            current_session_reqs = self.session_counts.get(session_id, 0)
            if current_session_reqs >= self.per_session_cap:
                raise BudgetExceededError(
                    f"Session quota exceeded ({self.per_session_cap} requests). Please reset session."
                )

            if is_live:
                projected_total = self.total_credits_used + self.cost_per_request
                if projected_total > self.global_cap:
                    raise BudgetExceededError(
                        f"Global credit limit of {self.global_cap} reached (used: {self.total_credits_used:.2f}). "
                        "Switching to fixture/sample mode."
                    )
                self.total_credits_used = projected_total

            self.session_counts[session_id] = current_session_reqs + 1
            self.total_requests += 1

            return {
                "used": round(self.total_credits_used, 2),
                "remaining": round(max(0.0, self.global_cap - self.total_credits_used), 2),
                "cap": self.global_cap,
                "session_requests": self.session_counts[session_id],
                "total_requests": self.total_requests
            }

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "used": round(self.total_credits_used, 2),
                "remaining": round(max(0.0, self.global_cap - self.total_credits_used), 2),
                "cap": self.global_cap,
                "total_requests": self.total_requests
            }

    def reset(self):
        with self._lock:
            self.total_credits_used = 0.0
            self.total_requests = 0
            self.session_counts.clear()
