-- Drop old table
DROP TABLE IF EXISTS trades;

-- Create table with composite primary key
CREATE TABLE trades (
    trade_time TIMESTAMPTZ NOT NULL,
    trade_id BIGSERIAL NOT NULL,
    symbol TEXT NOT NULL,
    price_value NUMERIC NOT NULL,
    quantity_value NUMERIC NOT NULL,
    PRIMARY KEY (trade_time, trade_id)
);

-- Convert to hypertable
SELECT create_hypertable('trades', 'trade_time', if_not_exists => TRUE);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_symbol_time ON trades (symbol, trade_time DESC);

-- 30s aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_30s
WITH (timescaledb.continuous) AS
SELECT 
    symbol,
    time_bucket('30 seconds', trade_time) AS bucket,
    FIRST(price_value, trade_time) AS open_value,
    MAX(price_value) AS high_value,
    MIN(price_value) AS low_value,
    LAST(price_value, trade_time) AS close_value,
    SUM(quantity_value) AS volume_value,
    COUNT(*) AS trade_count
FROM trades
GROUP BY symbol, bucket;

-- 1m aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_1m
WITH (timescaledb.continuous) AS
SELECT 
    symbol,
    time_bucket('1 minute', trade_time) AS bucket,
    FIRST(price_value, trade_time) AS open_value,
    MAX(price_value) AS high_value,
    MIN(price_value) AS low_value,
    LAST(price_value, trade_time) AS close_value,
    SUM(quantity_value) AS volume_value,
    COUNT(*) AS trade_count
FROM trades
GROUP BY symbol, bucket;

-- 5m aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_5m
WITH (timescaledb.continuous) AS
SELECT 
    symbol,
    time_bucket('5 minutes', trade_time) AS bucket,
    FIRST(price_value, trade_time) AS open_value,
    MAX(price_value) AS high_value,
    MIN(price_value) AS low_value,
    LAST(price_value, trade_time) AS close_value,
    SUM(quantity_value) AS volume_value,
    COUNT(*) AS trade_count
FROM trades
GROUP BY symbol, bucket;

-- 10m aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_10m
WITH (timescaledb.continuous) AS
SELECT 
    symbol,
    time_bucket('10 minutes', trade_time) AS bucket,
    FIRST(price_value, trade_time) AS open_value,
    MAX(price_value) AS high_value,
    MIN(price_value) AS low_value,
    LAST(price_value, trade_time) AS close_value,
    SUM(quantity_value) AS volume_value,
    COUNT(*) AS trade_count
FROM trades
GROUP BY symbol, bucket;

-- 30m aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_30m
WITH (timescaledb.continuous) AS
SELECT 
    symbol,
    time_bucket('30 minutes', trade_time) AS bucket,
    FIRST(price_value, trade_time) AS open_value,
    MAX(price_value) AS high_value,
    MIN(price_value) AS low_value,
    LAST(price_value, trade_time) AS close_value,
    SUM(quantity_value) AS volume_value,
    COUNT(*) AS trade_count
FROM trades
GROUP BY symbol, bucket;

-- Continuous aggregate policies
SELECT add_continuous_aggregate_policy('trades_30s', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '30 seconds', schedule_interval => INTERVAL '30 seconds');
SELECT add_continuous_aggregate_policy('trades_1m', start_offset => INTERVAL '2 hours', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');
SELECT add_continuous_aggregate_policy('trades_5m', start_offset => INTERVAL '1 day', end_offset => INTERVAL '5 minutes', schedule_interval => INTERVAL '5 minutes');
SELECT add_continuous_aggregate_policy('trades_10m', start_offset => INTERVAL '1 day', end_offset => INTERVAL '10 minutes', schedule_interval => INTERVAL '10 minutes');
SELECT add_continuous_aggregate_policy('trades_30m', start_offset => INTERVAL '7 days', end_offset => INTERVAL '30 minutes', schedule_interval => INTERVAL '30 minutes');
