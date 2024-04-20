import { BonfidaTrade as ExternalAPITrade } from './types';

export default class JupiterAgApi {
  static URL: string = 'https://price.jup.ag/v4/';

  static async get<T>(
    path: string,
    query: { [key: string]: any },
  ): Promise<T | null> {
    try {
      const response = await fetch(
        this.URL +
          path +
          '?' +
          Object.entries(query)
            .map(
              ([key, val]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(val)}`,
            )
            .join('&'),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      if (response.ok) {
        const responseJson = await response.json();

        return responseJson.data ? responseJson.data : null;
      }
    } catch (err) {
      console.log(`Error fetching from JupiterAg API ${path}: ${err}`);
    }
    return null;
  }

  static async getPrice(
    marketAddress: string,
    vsToken?: string,
  ): Promise<number | undefined> {
    let results = await JupiterAgApi.get<{
      [address: string]: {
        id: String;
        mintSymbol: String;
        vsToken: String;
        vsTokenSymbol: String;
        price: number;
      };
    }>('price', {
      ids: [marketAddress],
      vsToken,
    });

    if (results) {
      return results[marketAddress]?.price;
    }
  }
}
