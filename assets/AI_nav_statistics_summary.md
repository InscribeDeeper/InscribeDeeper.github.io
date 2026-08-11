# 2026 monthly session / QA summary (20260101_20260630)

Source: monthly CSVs under `log_analytics/backup/` (`report_YYYYMMDD_YYYYMMDD.csv`, year=2026).
Deduped on `(user_session_id, time_stamp)`. `active_qa` = row count after dedupe.

## Monthly totals

| month | unique_sessions | active_qa |
| --- | --- | --- |
| 2026-01 | 34,269 | 36,976 |
| 2026-02 | 77,785 | 80,070 |
| 2026-03 | 109,898 | 112,443 |
| 2026-04 | 42,485 | 43,713 |
| 2026-05 | 86,096 | 87,688 |
| 2026-06 | 14,736 | 15,318 |

## Unique sessions by month × source_app

| month | faultcode | ra | searchqa | total |
| --- | --- | --- | --- | --- |
| 2026-01 | 219 | 2,476 | 31,574 | 34,269 |
| 2026-02 | 258 | 2,056 | 75,471 | 77,785 |
| 2026-03 | 281 | 2,323 | 107,294 | 109,898 |
| 2026-04 | 156 | 1,143 | 41,186 | 42,485 |
| 2026-05 | 322 | 1,738 | 84,036 | 86,096 |
| 2026-06 | 96 | 552 | 14,088 | 14,736 |

## Active QA by month × source_app

| month | faultcode | ra | searchqa | total |
| --- | --- | --- | --- | --- |
| 2026-01 | 219 | 5,183 | 31,574 | 36,976 |
| 2026-02 | 258 | 4,341 | 75,471 | 80,070 |
| 2026-03 | 281 | 4,868 | 107,294 | 112,443 |
| 2026-04 | 156 | 2,371 | 41,186 | 43,713 |
| 2026-05 | 322 | 3,330 | 84,036 | 87,688 |
| 2026-06 | 96 | 1,134 | 14,088 | 15,318 |

## Long form (month × source_app)

| month | source_app | unique_sessions | active_qa |
| --- | --- | --- | --- |
| 2026-01 | faultcode | 219 | 219 |
| 2026-01 | ra | 2,476 | 5,183 |
| 2026-01 | searchqa | 31,574 | 31,574 |
| 2026-02 | faultcode | 258 | 258 |
| 2026-02 | ra | 2,056 | 4,341 |
| 2026-02 | searchqa | 75,471 | 75,471 |
| 2026-03 | faultcode | 281 | 281 |
| 2026-03 | ra | 2,323 | 4,868 |
| 2026-03 | searchqa | 107,294 | 107,294 |
| 2026-04 | faultcode | 156 | 156 |
| 2026-04 | ra | 1,143 | 2,371 |
| 2026-04 | searchqa | 41,186 | 41,186 |
| 2026-05 | faultcode | 322 | 322 |
| 2026-05 | ra | 1,738 | 3,330 |
| 2026-05 | searchqa | 84,036 | 84,036 |
| 2026-06 | faultcode | 96 | 96 |
| 2026-06 | ra | 552 | 1,134 |
| 2026-06 | searchqa | 14,088 | 14,088 |
