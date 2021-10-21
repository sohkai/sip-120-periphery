SELECT logs.block_timestamp, logs.data
FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
WHERE logs.address = '0xae74faa92cb67a95ebcab07358bc222e33a34da7' -- BTC/USD aggregator
    AND logs.block_number >= 12150245 -- 01/04/2021
    AND '0xf6a97944f31ea060dfde0566e4167c1a1082551e64b60ecb14d599a9d023d451' IN UNNEST(logs.topics)
ORDER BY logs.block_timestamp
