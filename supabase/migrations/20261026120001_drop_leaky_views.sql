-- Tenant isolation, part 2: drop the leaky views.
-- APPLY ONLY AFTER the app deploy that switches every board/stats read to
-- shop_board / shop_stats / directory_shop_counts is LIVE and verified.
-- Until then the app still reads these views; dropping them early breaks
-- the shop page, the TV display, the kiosk, and the directory.
drop view if exists public.shop_queue_board;
drop view if exists public.shop_queue_stats;
