import React, { useContext, useState } from 'react';
import { sleep, useLocalStorageState } from './utils';
import { useInterval } from './useInterval';
import { useConnection, useConnectionConfig } from './connection';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMarketInfos, useTokenAccounts } from './markets';
import { settleAllFunds } from './send';
import { PreferencesContextValues } from './types';
import { Market } from '@openbook-dex/openbook';
import { BaseSignerWalletAdapter } from '@solana/wallet-adapter-base';

export const AUTO_SETTLE_DISABLED_OVERRIDE = true;

const PreferencesContext = React.createContext<PreferencesContextValues | null>(
  null,
);

export function PreferencesProvider({ children }) {
  const [autoSettleEnabled, setAutoSettleEnabled] = useLocalStorageState(
    'autoSettleEnabled',
    true,
  );

  const [tokenAccounts] = useTokenAccounts();
  const { connected, wallet } = useWallet();
  const marketInfoList = useMarketInfos();
  const [currentlyFetchingMarkets, setCurrentlyFetchingMarkets] =
    useState<boolean>(false);
  const [markets, setMarkets] = useState<Map<string, Market>>(new Map());
  const addToMarketsMap = (marketId, market) => {
    setMarkets((prev) => new Map(prev).set(marketId, market));
  };
  const connection = useConnection();
  const { priorityFee, computeUnits } = useConnectionConfig();

  useInterval(() => {
    const autoSettle = async () => {
      if (AUTO_SETTLE_DISABLED_OVERRIDE) {
        return;
      }
      if (!wallet) {
        return;
      }
      try {
        console.log('Settling funds...');
        await settleAllFunds({
          connection,
          wallet: wallet.adapter as BaseSignerWalletAdapter,
          tokenAccounts: tokenAccounts || [],
          markets: [...markets.values()],
          priorityFee,
          computeUnits,
        });
      } catch (e: any) {
        console.log('Error auto settling funds: ' + e.message);
        return;
      }
      console.log('Finished settling funds.');
    };
    connected &&
      (wallet?.adapter as any).autoApprove &&
      autoSettleEnabled &&
      autoSettle();
  }, 20000);

  // warms up the market and open orders cache for auto-settlement
  useInterval(() => {
    const fetchMarkets = async () => {
      if (!wallet) {
        // only need these markets for auto-settlement, so don't fetch unless we are connected.
        return;
      }
      setCurrentlyFetchingMarkets(true);
      for (const marketInfo of marketInfoList) {
        if (markets.has(marketInfo.address.toString())) {
          continue;
        }
        try {
          const market = await Market.load(
            connection,
            marketInfo.address,
            {},
            marketInfo.programId,
          );
          addToMarketsMap(marketInfo.address.toString(), market);
          await sleep(1000);
        } catch (e: any) {
          console.log('Error fetching market: ' + e.message);
        }
      }
      setCurrentlyFetchingMarkets(false);
    };
    connected &&
      (wallet?.adapter as any).autoApprove &&
      autoSettleEnabled &&
      !currentlyFetchingMarkets &&
      fetchMarkets();
  }, 60000);

  return (
    <PreferencesContext.Provider
      value={{
        autoSettleEnabled,
        setAutoSettleEnabled,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('Missing preferences context');
  }
  return {
    autoSettleEnabled: context.autoSettleEnabled,
    setAutoSettleEnabled: context.setAutoSettleEnabled,
  };
}
