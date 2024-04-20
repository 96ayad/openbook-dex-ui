import { BonfidaTrade as ExternalAPITrade } from './types';

export default class AlephApi {
  static URL: string = 'https://openbook.api.aleph.cloud/';

  static async get<T>(
    path: string,
    query: string,
    variables?: any,
  ): Promise<T | null> {
    try {
      const response = await fetch(this.URL + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (response.ok) {
        const responseJson = await response.json();

        return responseJson.data ? responseJson.data : null;
      }
    } catch (err) {
      console.log(`Error fetching from Aleph API ${path}: ${err}`);
    }
    return null;
  }

  static async getRecentTrades(
    marketAddress: string,
  ): Promise<ExternalAPITrade[] | undefined> {
    return (
      await AlephApi.get<{
        market: {
          address: string;
          stats: {
            change1h: number;
            change1hUsd: number;
            price: number;
            priceUsd: number;
            trades24h: number;
          };
        };
        publicTrades: [
          {
            baseAmount: string;
            makerFeeOrRebateAmount: string;
            makerOrderId: string;
            price: number;
            quoteAmount: string;
            side: 'buy' | 'sell';
            takerFeeOrRebateAmount: string;
            takerOrderId: string;
            timestamp: number;
          },
        ];
      }>(
        `graphql`,
        `
    {
      market(address: "${marketAddress}") {
        address
        stats {
          price
          priceUsd
          change1h
          change1hUsd
          trades24h
        }
      }
      publicTrades(market: "${marketAddress}", limit: 100) {
        price
        timestamp
        makerFeeOrRebateAmount
        takerFeeOrRebateAmount
        baseAmount
        quoteAmount
        makerOrderId
        takerOrderId
        side
      }
    }
    `,
        {
          marketAddress,
        },
      )
    )?.publicTrades.map((trade) => {
      return {
        market: marketAddress,
        size: Number(trade.baseAmount),
        price: trade.price,
        orderId: trade.takerOrderId,
        time: trade.timestamp,
        side: trade.side,
        feeCost: Number(trade.takerFeeOrRebateAmount),
        marketAddress: marketAddress,
      };
    });
  }
}
