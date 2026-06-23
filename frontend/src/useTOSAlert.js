import { useState, useCallback, useEffect } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';

let _readClient = null;

function getReadClient() {
  if (!_readClient) {
    _readClient = createClient({ chain: studionet });
  }
  return _readClient;
}

function getWriteClient(account) {
  return createClient({ chain: studionet, account });
}

// Convert Wei (u256) to human readable GEN string
export function formatGen(weiVal) {
  if (!weiVal) return '0';
  try {
    const big = BigInt(weiVal);
    const integerPart = big / 10n**18n;
    const fractionalPart = big % 10n**18n;
    let fractionStr = fractionalPart.toString().padStart(18, '0');
    fractionStr = fractionStr.replace(/0+$/, ''); // Trim trailing zeros
    if (fractionStr === '') {
      return integerPart.toString();
    }
    return `${integerPart}.${fractionStr.slice(0, 4)}`;
  } catch (e) {
    return '0';
  }
}

// Convert human readable GEN input to Wei (u256 BigInt)
export function parseGen(genVal) {
  if (!genVal || genVal.toString().trim() === '') return 0n;
  try {
    const parts = genVal.toString().split('.');
    let integerPart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    fractionalPart = fractionalPart.slice(0, 18).padEnd(18, '0');
    return BigInt(integerPart) * 10n**18n + BigInt(fractionalPart);
  } catch (e) {
    return 0n;
  }
}

export function useTOSAlert() {
  const [address, setAddress] = useState('');
  const [glAccount, setGlAccount] = useState(null);
  const [escrowInfo, setEscrowInfo] = useState(null);
  const [userStake, setUserStake] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txStatus, setTxStatus] = useState('');

  // Connect Wallet (MetaMask or fallback ephemeral account)
  const connectWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const addr = accounts[0].toLowerCase();
        setAddress(addr);
        setGlAccount(addr);
      } else {
        // Ephemeral account fallback
        let savedKey = localStorage.getItem('__tosalert_sk');
        let acct;
        if (savedKey) {
          acct = createAccount(savedKey);
        } else {
          acct = createAccount();
          localStorage.setItem('__tosalert_sk', acct.privateKey);
        }
        const addr = acct.address.toLowerCase();
        setAddress(addr);
        setGlAccount(acct);
      }
    } catch (err) {
      console.error('Wallet connection failed:', err);
      setError('Wallet connection failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Escrow Configuration & user deposit state
  const fetchEscrowState = useCallback(async () => {
    if (!CONTRACT_ADDRESS) return;
    setLoading(true);
    try {
      const client = getReadClient();
      
      // Get core escrow info
      const rawInfo = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_escrow_info',
        args: [],
      });
      const info = JSON.parse(rawInfo);
      setEscrowInfo(info);

      // Get user stake if wallet address is active
      if (address) {
        const rawStake = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_user_stake',
          args: [address],
        });
        setUserStake(rawStake.toString());
      }
      
      setError('');
    } catch (err) {
      console.error('Error fetching escrow state:', err);
      setError('Fetch state failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Initialize Escrow Parameters (Owner only)
  const initializeEscrow = async (redLineRules, whitelistedDomain, platformAddress) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Initializing legal escrow guidelines...');

    try {
      const client = getWriteClient(glAccount);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'initialize_escrow',
        args: [
          redLineRules.trim(),
          whitelistedDomain.trim(),
          platformAddress.trim()
        ],
      });
      
      setTxHash(hash);
      setTxStatus('Initialization broadcasted. Awaiting block inclusion...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus('Success! Escrow parameters initialized.');
      await fetchEscrowState();
      return receipt;
    } catch (err) {
      console.error('Initialization failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Deposit funds (Users)
  const depositFunds = async (amountGen) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus(`Depositing ${amountGen} GEN into escrow pool...`);

    try {
      const client = getWriteClient(glAccount);
      const valueWei = parseGen(amountGen);
      
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'deposit_funds',
        args: [],
        value: valueWei,
      });
      
      setTxHash(hash);
      setTxStatus('Deposit submitted. Awaiting block finalization...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus(`Successfully deposited ${amountGen} GEN!`);
      await fetchEscrowState();
      return receipt;
    } catch (err) {
      console.error('Deposit failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Release payment to Platform (Owner only)
  const releasePaymentToPlatform = async (amountGen) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus(`Releasing ${amountGen} GEN payment to platform...`);

    try {
      const client = getWriteClient(glAccount);
      const valueWei = parseGen(amountGen);
      
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'release_payment_to_platform',
        args: [Number(valueWei)], // Sized uints can take numbers/BigInt
      });
      
      setTxHash(hash);
      setTxStatus('Releasing escrowed funds to platform address...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus(`Successfully released ${amountGen} GEN to platform.`);
      await fetchEscrowState();
      return receipt;
    } catch (err) {
      console.error('Payment release failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Run AI Legal Audit
  const auditTos = async (tosUrl) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Summoning AI Legal Counsel nodes to audit platform terms...');

    try {
      const client = getWriteClient(glAccount);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'audit_tos',
        args: [tosUrl.trim()],
      });
      
      setTxHash(hash);
      setTxStatus('AI Counsel is rendering legal text and analyzing clauses. This may take 15-30s...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Audit error';
        throw new Error(errorMsg);
      }

      setTxStatus('Audit finished! Consensus achieved on legal status.');
      await fetchEscrowState();
      return receipt;
    } catch (err) {
      console.error('Audit failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Rage quit (Pull refund)
  const rageQuit = async () => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Initiating mass rage-quit refund withdrawal...');

    try {
      const client = getWriteClient(glAccount);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'rage_quit',
        args: [],
      });
      
      setTxHash(hash);
      setTxStatus('Broadcasting refund claim. Pulling proportional share...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Rage quit error';
        throw new Error(errorMsg);
      }

      setTxStatus('Rage quit successful! Refund pulled.');
      await fetchEscrowState();
      return receipt;
    } catch (err) {
      console.error('Rage quit failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (CONTRACT_ADDRESS) {
      fetchEscrowState();
    }
  }, [CONTRACT_ADDRESS, address, fetchEscrowState]);

  return {
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
    contractAddress: CONTRACT_ADDRESS,
  };
}
