exports.getExchangeRates = async () => {
  try {
    const url =
      'https://v6.exchangerate-api.com/v6/10c2b4d83ece6f6f9713e263/latest/USD';

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Exchange rate API responded with status: ${response.status}`
      );
    }

    const data = await response.json();
    const fRates = data['conversion_rates'];

    const rates = {
      BTC: 78570,
      ETH: 2211,
      SOL: 88,
      USDT: 1,
      USD: 1,
      EUR: 1 / fRates.EUR,
      UAH: 1 / fRates.UAH,
    };

    return rates;
  } catch (error) {
    console.error('Error fetching live exchange rates:', error.message);

    return {
      BTC: 78570,
      ETH: 2211,
      SOL: 88,
      USDT: 1,
      USD: 1,
      EUR: 1.08,
      UAH: 0.023,
    };
  }
};
