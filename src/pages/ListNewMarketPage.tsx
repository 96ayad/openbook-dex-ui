import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Space, Tooltip, Typography } from 'antd';
import { notify } from '../utils/notifications';
import { MARKETS } from '@openbook-dex/openbook';
import { useConnection, useConnectionConfig } from '../utils/connection';
import FloatingElement from '../components/layout/FloatingElement';
import styled from 'styled-components';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  calculateEventQueueSize,
  calculateOrderbookSize,
  calculateRequestQueueSize,
  listMarket,
} from '../utils/send';
import { useMintInput } from '../components/useMintInput';
import { PublicKey } from '@solana/web3.js';
import {
  BaseSignerWalletAdapter,
  BaseWalletAdapter,
} from '@solana/wallet-adapter-base';
import JupiterAgApi from '../utils/jupterAgConnector';
import Paragraph from 'antd/lib/skeleton/Paragraph';
import Decimal from 'decimal.js';
import { QuestionCircleOutlined } from '@ant-design/icons';
import Link from '../components/Link';

const { Text, Title } = Typography;

const Wrapper = styled.div`
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  margin-top: 24px;
  margin-bottom: 24px;
`;

type ListedMarketState = PublicKey | null;

export default function ListNewMarketPage() {
  const connection = useConnection();
  const { wallet, connected } = useWallet();
  const [baseMintInput, baseMintInfo] = useMintInput(
    'baseMint',
    <Text>
      Base Token Mint Address{' '}
      <Text type="secondary">
        (e.g. BTC solana address:{' '}
        {
          <Text type="secondary" code>
            9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E
          </Text>
        }
        )
      </Text>
    </Text>,
    'The base token is the token being traded. For example, the base token of a BTC/USDC market is BTC.',
  );
  const [quoteMintInput, quoteMintInfo] = useMintInput(
    'quoteMint',
    <Text>
      Quote Token Mint Address{' '}
      <Text type="secondary">
        (e.g. USDC solana address:{' '}
        {
          <Text type="secondary" code>
            EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
          </Text>
        }
        )
      </Text>
    </Text>,
    'The quote token is the token used to price trades. For example, the quote token of a BTC/USDC market is USDC.',
    ['USDC', 'SOL'],
  );
  const { priorityFee, computeUnits } = useConnectionConfig();

  const [lotSize, setLotSize] = useState('1');
  const [tickSize, setTickSize] = useState('0.01');
  const [isLoading, setIsLoading] = useState(false);
  const [estimatedRent, setEstimatedRent] = useState('Loading');

  const dexProgramId = MARKETS.find(({ deprecated }) => !deprecated)?.programId;
  const [submitting, setSubmitting] = useState(false);
  const [listedMarket, setListedMarket] = useState<ListedMarketState>(null);

  useEffect(() => {
    (async () => {
      if (baseMintInfo && quoteMintInfo) {
        setIsLoading(true);
        // Price is in super units, e.g. 100 USDC / 1 SOL if SOL is at $100.
        let price = await JupiterAgApi.getPrice(
          baseMintInfo?.address.toBase58(),
          quoteMintInfo?.address.toBase58(),
        );

        if (price) {
          Decimal.set({ toExpNeg: -20, toExpPos: 20 });
          setLotSize(`${new Decimal((1 / price).toPrecision(1))}`);
          let tickSize = new Decimal((0.00001 * price).toPrecision(1));

          // If the tick size would be smaller than the smallest unit of the quote currency,
          // then we'll just set it to be 1
          if (tickSize.toNumber() < 10 ** (-1 * quoteMintInfo.decimals)) {
            tickSize = new Decimal(10 ** (-1 * quoteMintInfo.decimals));
          }

          setTickSize(`${tickSize}`);
        }
        setIsLoading(false);
      }
    })();
  }, [baseMintInfo?.address, quoteMintInfo?.address, setLotSize, setTickSize]);

  useEffect(() => {
    (async () => {
      let rent = await connection.getMinimumBalanceForRentExemption(
        calculateEventQueueSize(2978) +
          calculateRequestQueueSize(63) +
          2 * calculateOrderbookSize(909),
      );

      setEstimatedRent(`${rent / 10e8} SOL`);
    })();
  }, [baseMintInfo?.address, quoteMintInfo?.address, setLotSize, setTickSize]);

  let baseLotSize;
  let quoteLotSize;
  if (baseMintInfo && parseFloat(lotSize) > 0) {
    baseLotSize = Math.round(10 ** baseMintInfo.decimals * parseFloat(lotSize));
    if (quoteMintInfo && parseFloat(tickSize) > 0) {
      quoteLotSize = Math.round(
        parseFloat(lotSize) *
          10 ** quoteMintInfo.decimals *
          parseFloat(tickSize),
      );
    }
  }

  console.log('baseLotSize:', baseMintInfo?.decimals, baseLotSize);
  console.log('quoteLotSize:', quoteMintInfo?.decimals, quoteLotSize);

  const canSubmit =
    connected &&
    !!baseMintInfo &&
    !!quoteMintInfo &&
    !!baseLotSize &&
    !!quoteLotSize;

  async function onSubmit() {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);

    if (!dexProgramId) {
      notify({
        message: 'Selected market was deprecated or does not exist.',
        description: 'Selected market was deprecated or does not exist.',
        type: 'error',
      });
      setSubmitting(false);
    }

    try {
      const marketAddress = await listMarket({
        connection,
        wallet: wallet!.adapter as BaseSignerWalletAdapter,
        baseMint: baseMintInfo.address,
        quoteMint: quoteMintInfo.address,
        baseLotSize,
        quoteLotSize,
        dexProgramId: dexProgramId!,
        priorityFee,
        computeUnits,
      });
      setListedMarket(marketAddress);
    } catch (e: any) {
      console.warn(e);
      notify({
        message: 'Error listing new market',
        description: e.message,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Wrapper>
      <FloatingElement>
        <Title level={4}>List New Market</Title>
        <Form
          labelCol={{ span: 24 }}
          wrapperCol={{ span: 24 }}
          layout={'vertical'}
          onFinish={onSubmit}
        >
          {baseMintInput}
          {quoteMintInput}
          <Form.Item
            label={
              <Tooltip title="This is the smallest allowed order size. For a SOL/USDC market, this would be in units of SOL, a.k.a. the Lot size.">
                Minimum Order Size{' '}
                <Text type="secondary">
                  <QuestionCircleOutlined />
                </Text>
              </Tooltip>
            }
            initialValue={lotSize}
            validateStatus={
              baseMintInfo && quoteMintInfo
                ? baseLotSize
                  ? 'success'
                  : 'error'
                : undefined
            }
            hasFeedback={Boolean(baseMintInfo && quoteMintInfo)}
          >
            <Input
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value.trim())}
              type="number"
              min="0"
              step="any"
              disabled={isLoading}
            />
          </Form.Item>
          <Form.Item
            label={
              <Tooltip title="This is the smallest amount by which prices can move. For a SOL/USDC market, this would be in units of USDC, a.k.a. the price increment.">
                Tick Size{' '}
                <Text type="secondary">
                  <QuestionCircleOutlined />
                </Text>
              </Tooltip>
            }
            initialValue="0.01"
            validateStatus={
              baseMintInfo && quoteMintInfo
                ? quoteLotSize
                  ? 'success'
                  : 'error'
                : undefined
            }
            hasFeedback={Boolean(baseMintInfo && quoteMintInfo)}
          >
            <Input
              value={tickSize}
              onChange={(e) => setTickSize(e.target.value.trim())}
              type="number"
              min="0"
              step="any"
              disabled={isLoading}
            />
          </Form.Item>
          <Space direction="vertical">
            <Title level={4}>Total Rent Estimate: {estimatedRent}</Title>
            <Text type="secondary">
              It is suggested that Min Price Tick Size should be a maximum of
              0.1% of your intended starting price for the Base Token (price
              being the number of Quote Tokens needed to purchase 1 Base Token)
            </Text>
            <Text type="secondary">
              Example: For a base token with intended price of $1, tick size
              should be no larger than 0.001 if quote token is USDC. If quote
              token is SOL, assuming market price for SOL is $100, then the same
              $1 base token price would equal 0.01 SOL and min tick size should
              then be 0.00001. In other words, the tick size should be with in
              1/1000 (0.001) of your token price. If your token price is $0.02,
              we recommend a tick size of 0.0001.
            </Text>
            <Text type="secondary">
              The prefilled values above should reflect this logic based on the
              current market values from{' '}
              <Link href="https://jup.ag" target="_blank">
                Jupiter
              </Link>
            </Text>
          </Space>
          <Form.Item label=" " colon={false}>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!canSubmit || isLoading}
              loading={submitting}
            >
              {connected ? 'Submit' : 'Not connected to wallet'}
            </Button>
          </Form.Item>
        </Form>
      </FloatingElement>
      {listedMarket ? (
        <FloatingElement>
          <Text>New market address: {listedMarket.toBase58()}</Text>
        </FloatingElement>
      ) : null}
    </Wrapper>
  );
}
