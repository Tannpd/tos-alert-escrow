import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Coins, 
  Plus, 
  ExternalLink, 
  RefreshCw, 
  User, 
  Clock, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Info,
  Award,
  AlertTriangle,
  Send,
  Scale,
  Eye,
  Lock,
  CornerDownRight
} from 'lucide-react';
import { useTOSAlert, formatGen } from './useTOSAlert';

export default function App() {
  const {
    address,
    escrowInfo,
    userStake,
    loading,
    error,
    txHash,
    txStatus,
    connectWallet,
    fetchEscrowState,
    initializeEscrow,
    depositFunds,
    releasePaymentToPlatform,
    auditTos,
    rageQuit,
    contractAddress
  } = useTOSAlert();

  // Initialization Form State
  const [initRedLines, setInitRedLines] = useState('');
  const [initDomain, setInitDomain] = useState('slack.com');
  const [initPlatform, setInitPlatform] = useState('');
  const [initError, setInitError] = useState('');

  // User Actions State
  const [depositAmt, setDepositAmt] = useState('1');
  const [payAmt, setPayAmt] = useState('1');
  const [auditUrl, setAuditUrl] = useState('');
  const [actionError, setActionError] = useState('');

  const truncateAddr = (addr) => {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  };

  const handleInitialize = async (e) => {
    e.preventDefault();
    setInitError('');

    if (initRedLines.trim() === '') {
      setInitError('Red Line Rules cannot be empty.');
      return;
    }
    if (initDomain.trim() === '') {
      setInitError('Whitelisted domain is required.');
      return;
    }
    if (initPlatform.trim() === '') {
      setInitError('Platform recipient address is required.');
      return;
    }

    try {
      await initializeEscrow(initRedLines, initDomain, initPlatform);
    } catch (err) {
      // Handled in custom hook
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    setActionError('');
    const amt = parseFloat(depositAmt);
    if (isNaN(amt) || amt <= 0) {
      setActionError('Please enter a valid deposit amount.');
      return;
    }
    try {
      await depositFunds(depositAmt);
      setDepositAmt('1');
    } catch (err) {}
  };

  const handleReleasePayment = async (e) => {
    e.preventDefault();
    setActionError('');
    const amt = parseFloat(payAmt);
    if (isNaN(amt) || amt <= 0) {
      setActionError('Please enter a valid payment release amount.');
      return;
    }
    try {
      await releasePaymentToPlatform(payAmt);
      setPayAmt('1');
    } catch (err) {}
  };

  const handleAudit = async (e) => {
    e.preventDefault();
    setActionError('');

    if (auditUrl.trim() === '') {
      setActionError('Please provide a Terms of Service page URL.');
      return;
    }

    // Client-side domain validation
    const lowerUrl = auditUrl.toLowerCase().trim();
    const domain = escrowInfo?.whitelisted_domain.toLowerCase().trim();
    if (!lowerUrl.includes(domain)) {
      setActionError(`URL must belong to the whitelisted domain: ${domain}`);
      return;
    }

    try {
      await auditTos(auditUrl);
      setAuditUrl('');
    } catch (err) {}
  };

  // Calculations for Proportional Refund
  const getRefundEstimate = () => {
    if (!escrowInfo) return '0';
    const stake = BigInt(userStake);
    const balance = BigInt(escrowInfo.escrow_balance);
    const staked = BigInt(escrowInfo.total_staked);
    if (staked === 0n || stake === 0n) return '0';
    const estWei = (stake * balance) / staked;
    return formatGen(estWei);
  };

  const isOwner = address && escrowInfo && escrowInfo.owner.toLowerCase() === address.toLowerCase();

  return (
    <div className="app-container">
      {/* HEADER SECTION */}
      <header className="app-header glass-panel">
        <div className="brand">
          <div className="brand-logo">🛡️</div>
          <div>
            <h1 className="brand-name">TOS-Alert</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Decentralized Anti-TOS Abuse Escrow</p>
          </div>
        </div>
        
        <div className="wallet-section">
          {address ? (
            <>
              <div className="network-badge">
                <span className="network-dot"></span>
                <span>GenLayer Studio</span>
              </div>
              <div className="network-badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'var(--border-color)' }}>
                <User size={14} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ color: 'var(--text-primary)' }}>{truncateAddr(address)}</span>
              </div>
            </>
          ) : (
            <button className="btn btn-wallet" onClick={connectWallet} disabled={loading}>
              <Coins size={16} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-rose)', padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <AlertTriangle style={{ color: 'var(--accent-rose)' }} />
          <div>
            <p style={{ fontWeight: '600', color: 'var(--text-primary)' }}>System Alert</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        </div>
      )}

      {/* CASE 1: CONTRACT NOT INITIALIZED YET */}
      {escrowInfo && !escrowInfo.is_initialized ? (
        <div className="glass-panel info-card" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          <h2 className="section-title">
            <Scale size={20} style={{ color: 'var(--accent-blue)' }} />
            <span>Initialize Legal Escrow Rules</span>
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Set up the escrow guidelines. You must configure the red line clauses you wish to monitor, the platform recipient address, and the target domain for safety.
          </p>

          <form onSubmit={handleInitialize}>
            <div className="form-group">
              <label className="form-label">Whitelisted Platform Domain</label>
              <input 
                type="text"
                className="input-text"
                value={initDomain}
                onChange={(e) => setInitDomain(e.target.value)}
                placeholder="e.g. slack.com"
                disabled={loading || !address}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Platform Recipient Wallet Address</label>
              <input 
                type="text"
                className="input-text"
                value={initPlatform}
                onChange={(e) => setInitPlatform(e.target.value)}
                placeholder="0x..."
                disabled={loading || !address}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Predefined Red Line Rules (One per line)</label>
              <textarea 
                className="input-text input-textarea"
                value={initRedLines}
                onChange={(e) => setInitRedLines(e.target.value)}
                placeholder="e.g.&#10;The platform must not claim ownership of user content for AI training.&#10;The platform must not share private data with third-party advertisers.&#10;The platform must not enforce forced binding arbitration."
                disabled={loading || !address}
              />
            </div>

            {initError && (
              <p style={{ color: 'var(--accent-rose)', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>
                {initError}
              </p>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading || !address}>
              <span>Initialize Contract</span>
            </button>
          </form>
        </div>
      ) : (
        /* CASE 2: CONTRACT ACTIVE */
        escrowInfo && (
          <>
            {/* BREACH STATUS BANNER */}
            {escrowInfo.is_breached ? (
              <div className="status-banner breached">
                <AlertTriangle size={24} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
                <div className="banner-content">
                  <h2 className="banner-title">Platform Breach Legally Confirmed</h2>
                  <p className="banner-desc">
                    GenLayer AI validators reached consensus that the Terms of Service have violated community Red Line rules. 
                    Escrow payouts to the platform are permanently frozen. Users can rage-quit and claim proportional refunds.
                  </p>
                </div>
              </div>
            ) : (
              <div className="status-banner safe">
                <ShieldCheck size={24} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                <div className="banner-content">
                  <h2 className="banner-title">Platform Terms of Service Secure</h2>
                  <p className="banner-desc">
                    AI Legal audits show no red line rules have been violated. Subscriptions and community escrow payments are active and safe.
                  </p>
                </div>
              </div>
            )}

            <div className="dashboard-grid">
              
              {/* SIDEBAR COL */}
              <div className="sidebar-col">
                
                {/* FINANCIAL STATUS CARD */}
                <div className="glass-panel info-card">
                  <h2 className="section-title">
                    <Coins size={18} style={{ color: 'var(--accent-blue)' }} />
                    <span>Escrow Pool Stats</span>
                  </h2>

                  <div className="stats-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                    <div className="stat-item">
                      <span className="stat-label">Active Escrow Balance</span>
                      <span className="stat-value highlight-blue">{formatGen(escrowInfo.escrow_balance)} GEN</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Total Staked Pool</span>
                      <span className="stat-value">{formatGen(escrowInfo.total_staked)} GEN</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Your Active Stake</span>
                      <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                        {formatGen(userStake)} GEN
                      </span>
                    </div>
                  </div>
                </div>

                {/* USER ESCROW ACTIONS */}
                <div className="glass-panel info-card">
                  
                  {/* Scenario A: Escrow Safe -> Deposit */}
                  {!escrowInfo.is_breached ? (
                    <>
                      <h2 className="section-title">
                        <Plus size={18} style={{ color: 'var(--accent-blue)' }} />
                        <span>Deposit Escrow Funds</span>
                      </h2>
                      <form onSubmit={handleDeposit}>
                        <div className="form-group">
                          <label className="form-label">Stake Amount (GEN)</label>
                          <input 
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="input-text"
                            value={depositAmt}
                            onChange={(e) => setDepositAmt(e.target.value)}
                            disabled={loading || !address}
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={loading || !address}>
                          <span>Deposit Funds</span>
                        </button>
                      </form>
                    </>
                  ) : (
                    /* Scenario B: Escrow Breached -> Rage Quit */
                    <>
                      <h2 className="section-title">
                        <XCircle size={18} style={{ color: 'var(--accent-rose)' }} />
                        <span>Rage-Quit Refund</span>
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                        Platform rules violated. Pull your proportional share of the remaining escrow budget.
                      </p>
                      <div className="stat-item" style={{ marginBottom: '20px', borderLeft: '3px solid var(--accent-rose)' }}>
                        <span className="stat-label">Estimated Refund Payout</span>
                        <span className="stat-value highlight-red">{getRefundEstimate()} GEN</span>
                      </div>
                      <button 
                        className="btn btn-rage-quit"
                        onClick={rageQuit}
                        disabled={loading || !address || BigInt(userStake) === 0n}
                      >
                        <Award size={14} />
                        <span>Rage Quit & Withdraw</span>
                      </button>
                    </>
                  )}
                  {actionError && (
                    <p style={{ color: 'var(--accent-rose)', fontSize: '13px', marginTop: '12px', fontWeight: '500' }}>
                      {actionError}
                    </p>
                  )}
                </div>

                {/* OWNER RELEASE ACTIONS (Only visible if owner & not breached) */}
                {isOwner && !escrowInfo.is_breached && (
                  <div className="glass-panel info-card">
                    <h2 className="section-title">
                      <Lock size={18} style={{ color: 'var(--accent-indigo)' }} />
                      <span>Release Escrow Payout</span>
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      As manager, release subscription fees to platform address. Locked if audit confirms violation.
                    </p>
                    <form onSubmit={handleReleasePayment}>
                      <div className="form-group">
                        <label className="form-label">Payout Amount (GEN)</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="input-text"
                          value={payAmt}
                          onChange={(e) => setPayAmt(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }} disabled={loading}>
                        <span>Release to Platform</span>
                      </button>
                    </form>
                  </div>
                )}

              </div>

              {/* CONTENT COL */}
              <div className="content-col">
                
                {/* RED LINE CLAUSES CARD */}
                <div className="glass-panel info-card">
                  <h2 className="section-title">
                    <Scale size={18} style={{ color: 'var(--accent-blue)' }} />
                    <span>Predefined Legal Red Lines</span>
                  </h2>
                  <div className="rules-list">
                    {escrowInfo.red_line_rules.split('\n').filter(r => r.trim() !== '').map((rule, idx) => (
                      <div key={idx} className="rule-card">
                        <span className="rule-bullet">{idx + 1}</span>
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AUDIT FORM & RESULTS CARD */}
                <div className="glass-panel info-card">
                  <h2 className="section-title">
                    <Eye size={18} style={{ color: 'var(--accent-blue)' }} />
                    <span>Terms of Service Audit Panel</span>
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                    Trigger GenLayer legal validators to parse platform legal docs. URL domain must be whitelisted: <strong>{escrowInfo.whitelisted_domain}</strong>
                  </p>
                  
                  {!escrowInfo.is_breached && (
                    <form onSubmit={handleAudit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                      <input 
                        type="url"
                        className="input-text"
                        style={{ flex: 1, minWidth: '240px' }}
                        value={auditUrl}
                        onChange={(e) => setAuditUrl(e.target.value)}
                        placeholder={`https://www.${escrowInfo.whitelisted_domain}/terms`}
                        disabled={loading || !address}
                      />
                      <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={loading || !address}>
                        <Sparkles size={14} />
                        <span>Run AI Legal Audit</span>
                      </button>
                    </form>
                  )}

                  {/* AI Legal Review Report */}
                  {escrowInfo.is_breached && (
                    <div className="ai-report">
                      <div className="report-section-title">Violating Clause Extracted</div>
                      <div className="clause-quote">
                        <CornerDownRight size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--accent-rose)' }} />
                        <span>{escrowInfo.breached_clause}</span>
                      </div>
                      
                      <div className="report-section-title" style={{ marginTop: '8px' }}>AI Legal Analyst Reasoning</div>
                      <p className="reasoning-text">"{escrowInfo.breach_reasoning}"</p>
                    </div>
                  )}
                </div>

              </div>

            </div>
          </>
        )
      )}

      {/* TX STATUS FLOATING BAR */}
      {txHash && (
        <div className="glass-panel tx-status-card" style={{ position: 'fixed', bottom: '24px', right: '24px', maxWidth: '380px', zIndex: 1000, borderLeft: '4px solid var(--accent-blue)' }}>
          <div className="tx-status-title">
            <RefreshCw size={14} className="animate-spin-slow" />
            <span>GenLayer Legal Tx Log</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{txStatus}</p>
          <a 
            href={`https://studio.genlayer.com/tx/${txHash}`} 
            target="_blank" 
            rel="noreferrer" 
            className="tx-hash-link"
          >
            Tx: {txHash}
          </a>
        </div>
      )}
    </div>
  );
}
