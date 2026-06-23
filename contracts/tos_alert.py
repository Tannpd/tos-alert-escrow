# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# =============================================================================
#  tos_alert.py — Decentralized Anti-Terms of Service Abuse Escrow
#  GenLayer Intelligent Contract (v0.2.16)
# =============================================================================

from genlayer import *
import json
from datetime import datetime, timezone

class Contract(gl.Contract):
    """
    TOS-Alert Escrow — Legal Escrow & Defense Fund
    =============================================
    Holds platform subscriptions/community funds. Continuously audits platform
    Terms of Service using AI. Halts platform payments and releases proportional
    rage-quit refunds if predefined privacy red lines are crossed.
    """

    # Escrow configurations
    escrow_owner:              Address
    platform_recipient:        Address
    whitelisted_domain:        str
    red_line_rules:            str

    # Audit status
    is_breached:               bool
    breached_clause:           str
    breach_reasoning:          str
    is_initialized:            bool

    # Financial state (u256 for native GEN tokens)
    escrow_balance:            u256
    total_staked:              u256

    # User stakes mapping. Key: Address -> Stake Amount (u256)
    user_stakes:               TreeMap[Address, u256]

    # ═══════════════════════════════════════════════════════════════════
    # CONSTRUCTOR
    # ═══════════════════════════════════════════════════════════════════
    def __init__(self) -> None:
        """
        Constructor. Standard GenLayer initialization.
        """
        self.escrow_owner       = gl.message.sender_address
        self.platform_recipient = gl.message.sender_address
        self.whitelisted_domain = ""
        self.red_line_rules     = ""
        self.is_breached        = False
        self.breached_clause    = ""
        self.breach_reasoning   = ""
        self.is_initialized     = False
        self.escrow_balance     = 0
        self.total_staked       = 0

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: INITIALIZE ESCROW
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def initialize_escrow(self, red_line_rules: str, whitelisted_domain: str, platform: Address) -> None:
        """
        Initializes the escrow rules, the target domain to monitor, and the platform recipient address.
        """
        if self.is_initialized:
            raise UserError("Escrow has already been initialized.")
            
        if len(red_line_rules.strip()) == 0:
            raise UserError("Red Line Rules cannot be empty.")
            
        if len(whitelisted_domain.strip()) == 0:
            raise UserError("Whitelisted domain cannot be empty.")
            
        self.red_line_rules     = red_line_rules.strip()
        self.whitelisted_domain = whitelisted_domain.strip().lower()
        self.platform_recipient = platform
        self.is_initialized     = True

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: USERS DEPOSIT ESCROW FUNDS
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def deposit_funds(self) -> None:
        """
        Allows users to stake native GEN tokens into this collective escrow pool.
        """
        if not self.is_initialized:
            raise UserError("Escrow is not initialized.")
            
        if self.is_breached:
            raise UserError("Escrow is in a breached state. Payouts are locked.")
            
        deposit_val = int(gl.message.value)
        if deposit_val <= 0:
            raise UserError("Must deposit a positive GEN amount.")
            
        caller = gl.message.sender_address
        current_stake = int(self.user_stakes.get(caller, 0))
        
        self.user_stakes[caller] = current_stake + deposit_val
        self.escrow_balance     = int(self.escrow_balance) + deposit_val
        self.total_staked       = int(self.total_staked) + deposit_val

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: OWNER RELEASES FUNDS TO PLATFORM
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def release_payment_to_platform(self, amount: int) -> None:
        """
        Allows the community owner to pay the platform periodically.
        Permanently frozen if a breach is confirmed.
        """
        if not self.is_initialized:
            raise UserError("Escrow is not initialized.")
            
        if self.is_breached:
            raise UserError("Payments frozen: Platform has violated community Red Lines.")
            
        if gl.message.sender_address != self.escrow_owner:
            raise UserError("Only the community manager can release escrow payments.")
            
        if amount <= 0:
            raise UserError("Release amount must be positive.")
            
        current_balance = int(self.escrow_balance)
        if amount > current_balance:
            raise UserError("Insufficient contract balance.")
            
        self.escrow_balance = current_balance - amount
        
        # Native transfer to platform
        other = gl.get_contract_at(self.platform_recipient)
        other.emit_transfer(value=u256(amount))

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: AUDIT platform's terms of service (AI AUDIT)
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def audit_tos(self, tos_url: str) -> None:
        """
        Checks a platform's live legal text page to identify if they added sneaky violations.
        """
        if not self.is_initialized:
            raise UserError("Escrow is not initialized.")
            
        if self.is_breached:
            raise UserError("TOS is already marked as breached.")
            
        # Verify submitted URL matches whitelisted domain
        url_lower = tos_url.lower().strip()
        whitelisted = self.whitelisted_domain.lower().strip()
        
        if not (url_lower.startswith("http://") or url_lower.startswith("https://")):
            raise UserError("Invalid URL format.")
            
        if whitelisted not in url_lower:
            raise UserError(f"URL does not belong to the whitelisted domain: {whitelisted}")
            
        rules = self.red_line_rules
        
        # ── Non-Deterministic Evaluation Block (Rule 7) ────────────────
        def leader_fn() -> str:
            # 1. Fetch live TOS text
            try:
                page_text: str = gl.nondet.web.render(tos_url)
            except Exception as render_err:
                return json.dumps({
                    "error": f"URL_FETCH_FAILED: {str(render_err)}",
                    "breach_found": False,
                    "violating_clause": "None",
                    "legal_reasoning": f"AI Legal Counsel could not render legal document page: {str(render_err)}"
                })
                
            content = page_text.strip()
            if len(content) < 100:
                return json.dumps({
                    "error": "CONTENT_TOO_SHORT",
                    "breach_found": False,
                    "violating_clause": "None",
                    "legal_reasoning": "The legal page returned insufficient text contents."
                })
                
            truncated_text = content[:5000]
            
            # 2. Instruct LLM to analyze the contract against community red lines
            prompt = f"""You are an elite AI Legal Counsel auditing a platform's live Terms of Service (TOS) to protect a community of depositors.
The community has established the following strict 'Red Line Rules' that the platform MUST NOT violate:
--- COMMUNITY RED LINES ---
{rules}
--- END COMMUNITY RED LINES ---

Below is the scraped text from the platform's live Terms of Service page ({tos_url}):
--- PLATFORM TOS TEXT ---
{truncated_text}
--- END PLATFORM TOS TEXT ---

Your mission is to deeply analyze the legal jargon in the TOS text against the predefined 'Red Line Rules'.
Verify if the platform has violated any of these rules (e.g. by claiming ownership of user-generated content for AI training, forcing binding arbitration, or harvesting private data).

If you find a violation:
- Set 'breach_found' to true.
- Extract the exact violating clause or sentence from the text and put it in 'violating_clause'.
- Provide a detailed 2-3 sentence legal reasoning explaining how it breaches the rules in 'legal_reasoning'.

If the text is clean:
- Set 'breach_found' to false.
- Set 'violating_clause' to 'None'.
- Explain why the TOS does not breach any community rules in 'legal_reasoning'.

OUTPUT FORMAT:
You must output ONLY a valid JSON object matching the schema below. Do not wrap in markdown syntax like ```json, do not write explanations outside JSON.
{{
  "breach_found": true | false,
  "violating_clause": "<The exact violating clause text, or 'None'>",
  "legal_reasoning": "<Your expert legal analysis>"
}}"""

            # Run LLM
            raw_output = gl.nondet.exec_prompt(prompt)
            
            # Clean markdown wrapping if present
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                inner_lines = []
                for line in lines[1:]:
                    if line.strip() == "```":
                        break
                    inner_lines.append(line)
                cleaned = "\n".join(inner_lines).strip()
                
            try:
                parsed = json.loads(cleaned)
                breach = bool(parsed.get("breach_found", False))
                clause = str(parsed.get("violating_clause", "None")).strip()
                reason = str(parsed.get("legal_reasoning", "No analysis provided.")).strip()
                
                return json.dumps({
                    "breach_found": breach,
                    "violating_clause": clause[:1000],
                    "legal_reasoning": reason[:1000]
                })
            except Exception as parse_err:
                return json.dumps({
                    "error": f"JSON_PARSE_FAILED: {str(parse_err)}",
                    "breach_found": False,
                    "violating_clause": "None",
                    "legal_reasoning": "AI Legal Counsel output was malformed. Defaulting to no breach."
                })
                
        def validator_fn(leader_result: str) -> bool:
            """
            Semantic legal consensus validator. Confirms that validators agree
            on the logical verdict `breach_found` to reach consensus.
            """
            try:
                leader_data = json.loads(leader_result)
            except Exception:
                return False
                
            if "error" in leader_data:
                allowed_errors = {"URL_FETCH_FAILED", "CONTENT_TOO_SHORT", "JSON_PARSE_FAILED"}
                return any(err in str(leader_data.get("error", "")) for err in allowed_errors)
                
            validator_raw = leader_fn()
            try:
                validator_data = json.loads(validator_raw)
            except Exception:
                return True  # Agree/abstain if validator fails locally
                
            if "error" in validator_data:
                return True  # Abstain if validator gets network error
                
            leader_breach    = bool(leader_data.get("breach_found", False))
            validator_breach = bool(validator_data.get("breach_found", False))
            
            # Semantic agreement check
            return leader_breach == validator_breach

        # Run Consensus Protocol
        consensus_json = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        
        try:
            res = json.loads(consensus_json)
        except Exception:
            return
            
        breach = bool(res.get("breach_found", False))
        clause = str(res.get("violating_clause", "None"))
        reason = str(res.get("legal_reasoning", "AI legal counsel audit completed."))
        
        if breach:
            self.is_breached      = True
            self.breached_clause  = clause
            self.breach_reasoning = reason

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: USERS REFUND ESCROW STAKES (RAGE QUIT)
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def rage_quit(self) -> int:
        """
        Allows users to withdraw their proportional share of remaining pool funds
        once a TOS breach is legally confirmed.
        """
        if not self.is_initialized:
            raise UserError("Escrow is not initialized.")
            
        if not self.is_breached:
            raise UserError("Escrow is not in breached state. You cannot rage-quit yet.")
            
        caller = gl.message.sender_address
        stake = int(self.user_stakes.get(caller, 0))
        
        if stake <= 0:
            raise UserError("No deposited stakes to claim.")
            
        current_balance = int(self.escrow_balance)
        total_stk       = int(self.total_staked)
        
        if current_balance <= 0 or total_stk <= 0:
            raise UserError("No funds remaining in the escrow pool.")
            
        # Proportional refund: (stake * current_balance) // total_stk
        refund_amount = (stake * current_balance) // total_stk
        
        # Clean user state before making the external transfer (re-entrancy protection)
        self.user_stakes[caller] = 0
        self.escrow_balance      = current_balance - refund_amount
        self.total_staked        = total_stk - stake
        
        # Transfer GEN to claimant
        other = gl.get_contract_at(caller)
        other.emit_transfer(value=u256(refund_amount))
        
        return refund_amount

    # ═══════════════════════════════════════════════════════════════════
    # READ-ONLY VIEW METHODS
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.view
    def get_escrow_info(self) -> str:
        """
        Returns a JSON-serialized representation of the escrow parameters and status.
        """
        owner = self.escrow_owner
        platform = self.platform_recipient
        
        return json.dumps({
            "owner": str(owner),
            "platform": str(platform),
            "whitelisted_domain": self.whitelisted_domain,
            "red_line_rules": self.red_line_rules,
            "is_breached": bool(self.is_breached),
            "breached_clause": self.breached_clause,
            "breach_reasoning": self.breach_reasoning,
            "escrow_balance": int(self.escrow_balance),
            "total_staked": int(self.total_staked),
            "is_initialized": bool(self.is_initialized)
        })

    @gl.public.view
    def get_user_stake(self, user: Address) -> int:
        """
        Returns the user's historical deposited stake amount.
        """
        return int(self.user_stakes.get(user, 0))
